# Arquitetura — Modelo de Processos, IPC, Persistência e Segurança

> Documento técnico para desenvolvedores. Descreve como o openCate funciona internamente, baseado na leitura do código-fonte (não no README). Última atualização: 2026-08-29 — CLI/SDK, reconexão bounded, restore serializado e diagnóstico de runtime.

## Visão geral dos processos

O openCate é um app Electron com **três camadas de processo**:

```
┌──────────────────────────────────────────────────────┐
│  Renderer (por BrowserWindow)                        │
│  React + Zustand + xterm.js + Monaco                 │
│  • UI do canvas, docks, sidebars                     │
│  • CanvasStore por painel (nodes/zoom/viewport)      │
│  • Comunica via preload bridge (contextBridge)       │
└────────────────────┬─────────────────────────────────┘
                     │ IPC (invoke/handle + send/on)
┌────────────────────▼─────────────────────────────────┐
│  Main Process (Electron Node)                        │
│  • Gerencia janelas, menus, diálogos nativos         │
│  • RuntimeManager: conecta/dispatch para daemons     │
│  • projectWorkspaceStore: persiste .cate/*.json      │
│  • pathValidation: sandbox de filesystem             │
│  • webSecurity: hardening de webviews                │
└────────────────────┬─────────────────────────────────┘
                     │ stdio JSON-LF RPC
┌────────────────────▼─────────────────────────────────┐
│  Runtime Daemon (Node standalone, cate-runtime)      │
│  • PTYs via node-pty (lazy-loaded)                   │
│  • File watcher (@parcel/watcher)                    │
│  • Ripgrep content search                            │
│  • Git operations                                    │
│  • Agent hooks ingestion endpoint                    │
│  Roda local OU remoto (SSH/WSL) — mesmo tarball      │
└──────────────────────────────────────────────────────┘
```

### Por que um daemon separado?

O daemon (`src/runtime/index.ts`) roda em Node standalone — sem Electron. Isso permite:

- **Remoto**: o MESMO tarball roda num host SSH ou distro WSL; o main fala com ele via stdio pipes sobre a conexão.
- **Isolamento**: crash do daemon não derruba a UI; PTYs morrem limpos quando o daemon sai (stdin close → killAll).
- **ABI correto**: node-pty é compilado pro Node embutido no tarball, não pro ABI do Electron.

## IPC — canais e contratos

Canares declarados em `src/shared/ipc-channels.ts`. O preload expõe via `contextBridge` uma API tipada (`window.electronAPI`), nunca `ipcRenderer` cru.

### Categorias principais

| Categoria | Exemplos de canal | Direção |
|---|---|---|
| Terminal | `TERMINAL_CREATE/WRITE/RESIZE/KILL/DATA/EXIT` | bidirecional |
| Filesystem | `FS_READ_FILE/WRITE_FILE/READ_DIR/WATCH_*` | invoke |
| Git | `GIT_IS_REPO/STATUS/DIFF/COMMIT...` | invoke |
| Search | `SEARCH_START/CANCEL` → `SEARCH_RESULT/DONE` | stream |
| Project state | `PROJECT_STATE_SAVE/LOAD` | invoke |
| Project memory | `PROJECT_MEMORY_SAVE/LOAD` | invoke |
| Session flush | `SESSION_FLUSH_SAVE` / `SESSION_FLUSH_SAVE_DONE` | quit-time sync |
| Runtime | `RUNTIME_CONNECT/STATUS/INSTALL/DELETE` | invoke + broadcast |
| Window panels | cross-window panel union | broadcast |
| Agent history | `AGENT_SESSION_HISTORY_LIST/LOAD` | invoke |
| Agent audit | `PROJECT_AGENT_AUDIT_LOAD/SAVE` | invoke |

### Handlers registrados UMA vez no boot

`src/main/index.ts` registra todos os handlers no startup — não por janela. Handlers que dependem do sender (ex: busca por window id) recebem `event` e usam `event.sender.id` como chave.

### Preload bridge

`src/preload/index.ts` monta a superfície pública e usa as fábricas tipadas de
`src/preload/ipcBridge.ts` para os wrappers de `ipcRenderer.invoke` e listeners.
Eventos push (PTY data, runtime status) usam `ipcRenderer.on` com cleanup
automático.

**Segurança**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (desativável só para dev com flag). Ver `src/main/windows/windowFactory.ts`.

## Persistência

### `.cate/workspace.json` (compartilhável, commitável)

Contém estado "de projeto": nome, cor do workspace, dockState (árvore de zonas/splits), painéis (tipo/título/filePath), e **geometria de canvas** sob `canvases.<canvasPanelId>.canvasNodes.<nodeId>` (origin, size, zOrder).

### `.cate/session.json` (machine-local, gitignored)

Fatos que NÃO devem ser commitados: worktree tag por terminal, working directory live, conteúdo unsaved de scratch, sessões CLI retomáveis, starred/tags/cor por terminal, stashed panels, worktrees registry.

### `.cate/memory.json` (machine-local, gitignored)

Notas curadas pelo usuário, separadas por projeto ou por caminho de worktree.
Cada nota exige uma citação estruturada de origem; o sistema não captura nem
compartilha scrollback de terminal implicitamente. A persistência é atômica no
host local e usa a API de arquivos do runtime para projetos remotos.

### `.cate/tasks.json` (machine-local, gitignored)

Contém a lista bounded de contratos de trabalho: objetivo, restrições, pré-requisitos
(`dependsOn`), estado, resultado validado, logs curtos e referências de artefatos.
`projectTaskGraph.ts` deriva referências ausentes, ciclos, tarefas prontas e um
subconjunto seguro para paralelização: no máximo uma tarefa sem worktree e uma por
`worktreeId`. O `taskId` opcional em `CodingAgentRun` liga a missão operacional a
esse documento sem duplicar seu estado; caminhos tocados por hooks podem virar
referências de arquivo, mas o scrollback do terminal nunca é copiado implicitamente.

### `.cate/agent-audit.json` (machine-local, gitignored)

Mantém uma trilha local e bounded de proveniência para contexto, prompts e
comandos enviados a agentes. Cada evento registra apenas metadados — ator,
origem, painel/execução de destino, tipo, correlação, resultado e quantidade de
caracteres — sem texto de prompt, comando, contexto selecionado ou scrollback.
Composer global, chat direto, sidebar/orquestrador e API de terminal usam o mesmo
contrato; a persistência passa pelo main/IPC/preload e usa escrita atômica tanto
para raízes locais quanto remotas. A auditoria é best-effort para não transformar
uma falha de persistência em falha do envio.

### Ciclo de gravação

1. **Autosave** (`sessionAutosave.ts`): debounce ~30s + trailing. Qualquer mudança relevante marca dirty e agenda save.
2. **Flush on quit**: main envia `SESSION_FLUSH_SAVE`; renderer responde com `SESSION_FLUSH_SAVE_DONE` após gravar. Se restore em progresso, ACK sem salvar (evita persistir meio-hydrate).
3. **IPC**: renderer chama `projectStateSave(rootPath, wsFile, sessFile)` — fire-and-forget com promise.
4. **Main** (`projectWorkspaceStore.ts`):
   - Adquire project lock (`workspace.lock` com pid) se nenhuma outra instância segura;
   - Guarda lastSavedProjectStates para detectar external edits;
   - `atomicWriteWithBak(sessionPath, ...)` sempre (machine-local, nunca hand-edited);
   - Para workspace.json: checa external edit → prompt reload; checa empty-overwrite (issue #220 guard) antes de escrever.

Restores, reloads e hydrates são enfileirados por `workspaceId` em
`sessionRestore.ts`. Isso inclui o teardown e a reconstrução do layout, evitando
que duas origens de lifecycle intercalem painéis, canvases ou hints de terminal;
um hydrate concorrente também não repete a leitura do snapshot antes de o
primeiro terminar.

### Backup e recuperação

Antes de cada write, copia o arquivo atual pra `.bak`. Na leitura, se o primary estiver corrupto, cai pro `.bak` (prefer-richer load). Orphan tmp files são limpos.

### Multi-instância

Lock file `.cate/workspace.lock` contém `{pid}`. Outro openCate que encontra lock vivo pula o autosave desse root. Crash → pid morto → lock reclaimado automaticamente.

### Histórico unificado de agentes

O histórico cross-CLI fica separado de `session.json` em
`.cate/agent-sessions.json` (machine-local e coberto pelo `.gitignore`). O
daemon normaliza os eventos de hook em uma referência composta por
`runtimeId + agentId + sessionId`, mantendo apenas metadados e o caminho do
transcript nativo quando o CLI o fornece. A atualização é idempotente e
preserva o caminho aprendido em eventos posteriores que não o repetem.

O renderer consulta esse índice pelo popover de histórico e pede um replay
read-only. O main valida que a referência existe no índice e que o transcript
está dentro do workspace ou do diretório nativo conhecido do CLI antes de
ler; scrollback de PTY nunca é promovido a transcript semântico. Resume é uma
operação distinta e continua usando `resumeCommandForAgent`/o comando nativo.
CLIs sem transcript ou sem id estável (como Aider) aparecem como metadados sem
replay inventado.

### Composer global de agentes

`src/renderer/canvas/GlobalAgentComposer.tsx` oferece um ponto único para
enviar um follow-up a missões `codingAgentRun` criadas pelo openCate. A lista só
habilita alvos cujo registro declara follow-up e cujo estado derivado está em
`working` ou `waiting`; terminais arbitrários, processos encerrados e CLIs sem
esse contrato permanecem indisponíveis. Mais de um alvo exige uma segunda
confirmação antes do broadcast, e cada envio passa por
`sendCodingAgentFollowUp`, que reutiliza a validação do driver e registra o
follow-up no estado persistido da missão.

Slash commands são literais por padrão. O usuário pode ativar a tradução
opt-in de `/status`, `/plan` e `/review` para instruções neutras; comandos
desconhecidos não são reescritos, evitando afirmar compatibilidade entre CLIs
que não foi verificada.

## Segurança

### Sandbox de filesystem

`src/main/ipc/pathValidation.ts` mantém um Map de **allowed roots** (workspaces abertos + temp dir). Toda operação fs valida:

1. Path resolve pra dentro de algum allowed root (com case-insensitive no Windows, symlink-aware via realpathSync.native);
2. Symlinks são rejeitados em operações write/remove (anti-symlink attack);
3. Grants persistentes por janela para arquivos escolhidos via dialog nativo;
4. Write allowances temporários (60s TTL) para operações one-shot.

O daemon repete a validação no seu lado — autoridade final, pois só ele pode realpath seu próprio filesystem.

### Webviews (browser panel)

`src/main/webSecurity.ts` instala handlers globais:

- `will-navigate`: bloqueia navegação fora de allowlist (app windows vs guest sessions têm regras distintas);
- `will-attach-webview`: força preload canônico (nunca confia no path do renderer), `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`;
- `setWindowOpenHandler`: deny por padrão; popups OAuth rastreados via registry;
- Guest sessions isoladas por partition.

### Agent hooks

Hooks de CLI agents (Codex/Claude/Gemini/etc.) reportam eventos ao daemon via HTTP loopback:

- Daemon materializa hooks dir estável em `~/.cate/agent-hooks`;
- Cada PTY recebe env com endpoint URL + bearer token HMAC-SHA256(ptyId, per-boot secret);
- Posts autenticados por token; token derivado por terminal (não global).

Ver `src/runtime/capabilities/agentHooks.ts`.

### Secrets

Passphrases SSH criptografadas via Electron safeStorage (`sshSecretStore.ts`). Nunca plaintext em disco. Outros secrets (tokens de provider) ficam no keychain do OS via authManager do pi.

### Content Security Policy

Renderer carrega apenas assets locais (file:// ou dev server). CSP restritiva definida no index.html.

## Limites conhecidos

Documentados honestamente (não são bugs, são tradeoffs):

1. **Windows**: `postinstall` agora usa Node (cross-platform), mas CI macOS ainda depende de bash scripts para codesign/notarize — específico de plataforma, não afeta devs Windows.
2. **Remote musl**: runtime tarball shipa glibc prebuilds de node-pty; hosts Alpine precisam de suporte adicional (erro explícito, não fallback silencioso).
3. **Scrollback**: serializado por terminal em session.json; limites de memória dependem da setting do usuário (padrão 1000 linhas).
4. **Multi-canvas perf**: cada canvas tem store próprio; muitos canvases simultâneos = muitas subscrições reativas (mitigado por virtualização DOM, mas ainda é custo linear).
5. **Daemon restart**: PTYs morrem com o daemon. Reconexão restaura scrollback mas não revive processos interativos (limitação fundamental de PTY-over-pipe).
6. **Canvas nesting**: um canvas dentro de outro é recusado no store; canvases
   adicionais são painéis independentes. O benchmark de performance não trata
   nesting como uma superfície suportada.
7. **Histórico cross-CLI**: a primeira versão indexa sessões observadas pelos
   hooks; ela não varre retroativamente todos os diretórios globais dos CLIs.
   Transcripts remotos fora do workspace aguardam uma capacidade de leitura
   específica no runtime, em vez de ampliar silenciosamente o escopo de
   filesystem.
8. **Broadcast global**: a primeira versão só alcança missões criadas pelo
   openCate com follow-up declarado; sessões de CLI abertas manualmente em
   terminais não são alvos até existir um protocolo de estado e envio seguro.
9. **Durabilidade e expansão remota**: tmux, containers, companion e relay não
   são inferidos a partir do transporte SSH/WSL. Seus contratos de identidade,
   montagem, secrets, autenticação e aprovação estão registrados em
   [ADR 0002](adr/0002-runtime-durability-and-remote-boundaries.md). O companion
   já tem SDK, crypto, pairing host-side, UI/QR desktop, companion web,
   identidade IndexedDB/Web Crypto e E2E HTTP local; wrappers mobile nativos,
   proxy TLS e validação cross-platform continuam fora da superfície de
   produção.

## Referências rápidas

| Módulo | Caminho |
|---|---|
| Boot main | `src/main/index.ts` |
| Window factory | `src/main/windows/windowFactory.ts` |
| Preload bridge | `src/preload/index.ts` |
| IPC channels | `src/shared/ipc-channels.ts` |
| Runtime manager | `src/main/runtime/runtimeManager.ts` |
| Runtime diagnostics | `src/renderer/ui/RuntimeLockOverlay.tsx` + `src/renderer/dialogs/RuntimeDiagnosticsDialog.tsx` |
| Local transport | `src/main/runtime/transports/localTransport.ts` |
| Daemon entry | `src/runtime/index.ts` |
| Capabilities | `src/runtime/capabilities/` |
| PTY wrapper | `src/runtime/capabilities/process.ts` |
| File watcher | `src/runtime/capabilities/fileWatcher.ts` |
| Agent hooks | `src/runtime/capabilities/agentHooks.ts` |
| Agent session history | `src/shared/agentSessions.ts` + `src/main/ipc/agentSessionHistory.ts` |
| Global agent composer | `src/renderer/canvas/GlobalAgentComposer.tsx` + `src/renderer/lib/agent/codingAgentBroadcast.ts` |
| Path validation | `src/main/ipc/pathValidation.ts` |
| Project state | `src/main/projectWorkspaceStore.ts` |
| Session autosave | `src/renderer/lib/workspace/sessionAutosave.ts` |
| E2E harness | `src/renderer/lib/e2eHarness.ts` |
