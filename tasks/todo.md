# Backlog — Canvas de Agentes CLI e Terminais

## Decisão atual

- **Base escolhida:** [`VIDORETTO/openCate`](https://github.com/VIDORETTO/openCate).
- **Motivo:** maior aderência ao produto desejado, canvas infinito/zoomável nativo, painéis de terminal/editor/browser/documento, agentes CLI integrados, subagentes, orquestrador, worktrees, sessões persistentes e licença MIT.
- **Clone local:** `C:\Users\gabri\Documents\cate`.
- **Estratégia:** manter a arquitetura do openCate e absorver as melhores ideias de TermCanvas, Paseo, Nimbalyst e Claude Squad sem quebrar os contratos existentes.

## Fase 0 — Baseline e governança

- [x] Criar branch própria de produto a partir do snapshot clonado.
- [x] Registrar upstream original, licença MIT e créditos em `NOTICE.md` ou equivalente.
- [x] Rodar `bun install`, runtime tarball e `typecheck` no Windows; documentar falhas específicas.
- [x] Rodar `test` no Windows e registrar baseline: 3.007 aprovados, 0 falhas, 70 skips.
- [x] Rodar `lint` (0 erros / 22 avisos herdados) e `build` com sucesso.
- [x] Corrigir baseline Windows: isolamento de localStorage, symlinks não suportados, home real em teste e escopo do daemon local.
- [x] Rodar app em modo desenvolvimento e registrar smoke test manual.
  - [x] `bun run dev` iniciou Vite, Electron, preload/IPC e o daemon local; a
    inicialização foi observada em 2026-08-29 e o processo foi encerrado sem
    árvores Electron órfãs.
  - [x] O caminho reproduzível equivalente (`bun run test:smoke:electron`) e
    os E2Es cobrem a interação mínima; webviews/CDP e hosts remotos continuam
    na revisão manual de segurança.
- [x] Criar ADR curto confirmando openCate como base e listando integrações prioritárias.
- [x] Definir nome, identidade visual e metadados de empacotamento: openCate,
  wordmark compartilhado e contrato desktop `com.opencate.app`.
  - [x] Nome canônico, descritor, app ID e nomes de pacote documentados em
    [`BRAND_IDENTITY.md`](../docs/BRAND_IDENTITY.md).
  - [x] Fontes SVG, paleta, tipografia e derivados PNG/ICO referenciados.
  - [x] `productName`/`desktopName`, ícones por plataforma e metadata do
    builder verificados.
- [x] Configurar CI com lint, typecheck, unit tests e build em Windows, macOS e Linux.
  - [x] O workflow também executa smoke Electron nos três runners, E2E Playwright multiplataforma e SSH loopback onde há OpenSSH.

## Fase 1 — Estabilização da fundação

- [x] Auditar dependências nativas: Electron, `node-pty`, xterm WebGL, watcher e runtime embutido.
- [x] Corrigir scripts incompatíveis com Windows sem remover suporte Unix (commit `7eacf7b`).
- [x] Adicionar teste E2E mínimo: abrir projeto, criar terminal, redimensionar nó, salvar/restaurar canvas (commit `c36b570`).
- [x] Adicionar teste E2E de múltiplos canvases e janelas destacadas (commit `454e5e9`).
- [x] Documentar modelo de processos, IPC, persistência e limites de segurança (commit `2044a6f`).

## Fase 2 — Canvas e terminais de referência

- [x] Nome customizado por terminal com atalho rápido e persistência.
- [x] Adicionar metadados persistentes de estrela, tags e cor por terminal.
- [x] Expor metadados na sidebar com menu nativo e indicadores visuais.
- [x] Expor metadados nas abas usadas por docks principais e mini-docks do canvas.
- [x] Adicionar ações de estrela/cor/tag ao menu de contexto central das abas.
- [x] Mostrar indicador de estrela nos resultados do Command Palette (commit `526c96b`).
- [x] Adicionar filtros e ciclos rápidos por projeto/worktree/tag/estrela/agente (commit `493ca1d`).
- [x] Comando "Focus Next Starred Terminal" no Command Palette, com ciclo entre terminais marcados (commit `df9b041`).
- [x] Atalho `Ctrl+Shift+Space` dedicado para o comando, integrado ao menu Go do Electron (commit `d8b21d0`).
- [x] Command palette busca painéis por tag além do título (commit `7f8e677`).
- [x] Modo `@tag` no Command Palette: cicla o foco entre todos os terminais com a tag digitada (commit `6f2f6f3`).
- [x] Teste de round-trip: estrela/tag/cor sobrevivem a save/restore e ficam apenas em session.json, nunca em workspace.json (commit `915380f`).
- [x] Lembrar tamanho preferido por tipo de agente, projeto e worktree.
- [x] Melhorar cadeia de foco: zoom-to-fit, próximo/anterior, ciclo por estrela/worktree.
- [x] Implementar "stash": ocultar tile mantendo PTY vivo e indicador de atividade.
- [x] Adicionar fila de atenção para terminais aguardando input ou concluídos.
- [x] Adicionar heatmap/sparkline de atividade recente por tile.
- [x] Criar status digest compacto com os sinais mais relevantes do canvas.
- [x] Suportar waypoints nomeados e salto rápido por região.
- [x] Permitir anotações, setas e agrupamentos visuais fora dos painéis.
- [x] Snapshot histórico do layout com rollback além do undo local.
- [ ] Garantir desempenho com 50+ nós, culling correto e scrollback preservado.
  - [x] Culling bounded validado com canvas sintético de 64 nós; scrollback por `panelId` e keep-alive de webviews permanecem cobertos.
  - [x] E2E de território cobre pan/zoom/movimento a 144 FPS.
  - [x] E2E opt-in `CATE_PERF_50=1` confirmou 50 PTYs vivos, 21 nós montados, 144 FPS, 0 long tasks e saída concorrente em 8 terminais; execução local Windows registrada em 2026-08-29.
- [x] E2E opt-in de resize confirmou 24 nós, 12 montados, 144 FPS e 0 long tasks; execução local Windows registrada em 2026-08-29.
- [x] Harness Linux descartável repetiu 50+ PTYs, resize e território: 17/18
  testes aprovados, 1 skip esperado do backend GL, 60 FPS no caso de 50+ e
  60 FPS no resize; o `.deb` instalado também passou restore/autosave.
- [ ] Repetir a medição live em macOS/Linux antes de fechar o requisito multiplataforma.

## Fase 3 — Agentes CLI unificados

- [x] Extrair registro declarativo de agentes: Claude Code, Codex, Gemini CLI, OpenCode, Copilot, Pi, Aider e comando customizado.
  - [x] Registro declarativo já presente na base para Claude Code, Codex, Cursor, Grok, OpenCode e PI; Gemini CLI, Copilot e Aider continuam pendentes como extensões do registro.
  - [x] Registrar Gemini CLI, Copilot CLI e Aider no registro canônico, com hooks/skills quando documentados e lacunas explícitas quando ausentes.
  - [x] Centralizar decisões de retomada e fallback de tela no `AgentDef`; overrides/profiles cobrem comando customizado sem tabela paralela.
- [x] Padronizar detecção de estado: working, waiting, idle, finished, error, stalled (commit `de654f8`).
  - [x] Adicionar `stalled` ao contrato canônico com limiar explícito de 5 minutos sem saída do PTY; `error` permanece coberto por `failed`.
  - [x] Criar contrato provider-neutral com precedência única e adaptadores para estados legados do terminal e status persistido de missões; manter projeções existentes sem quebra de UI.
- [x] Combinar hooks estruturados com fallback heurístico de tela quando o CLI não expõe eventos (commit `f559e01`).
  - [x] Amostrar somente o viewport xterm, com parser conservador e sem persistir/transmitir conteúdo de tela.
  - [x] Hooks estruturados vencem a heurística; `screenFallback` fica habilitado apenas para Aider até novos contratos serem validados.
- [x] Permitir override por agente/projeto/perfil sem editar código (commit `14211d9`).
- [x] Exibir tokens, custo estimado, contexto restante e tempo por execução (commit `191d201`).
- [x] Unificar histórico, busca e replay de sessões entre CLIs na primeira versão: índice machine-local alimentado por hooks, busca por metadados/conteúdo e replay somente leitura; retomada continua separada e a varredura retroativa global/transcritos remotos permanece como limitação explícita (commit `f1918d9`).
- [x] Implementar retomada confiável com fallback claro quando a sessão do CLI expirou (registro por agente + stamps/testes de contrato).
- [x] Criar composer global para um prompt, seleção múltipla, broadcast controlado e tradução opcional de slash commands na primeira versão (commit `e6880b1`); a superfície alcança apenas missões openCate-owned com follow-up suportado.
- [x] Adicionar perfis reutilizáveis de modelo, reasoning, permissões e ambiente (commit `ad68522`).

## Fase 4 — Subagentes, contexto e conversa entre terminais

- [x] Construir árvore viva de orquestrador -> subagentes -> tarefas (commit `647d60e`; visão derivada de runs + cross-window reports, renderizada na sidebar).
- [x] Mostrar status, último tool call, arquivos tocados, custo e contexto de cada subagente.
- [x] Permitir inspecionar, pausar, cancelar, reenviar e promover resultado de subagente (commit `0a59817`; controles na árvore de missões usando o driver como autoridade).
- [x] Criar barramento explícito de contexto entre terminais (primeira versão no commit `089bf25`; capturas completas no commit `0595375`: seleção de terminal, arquivo do workspace e diff de worktree).
- [x] Representar relações de contexto como arestas visuais no canvas (commit `f6bcdbe`; somente entregas confirmadas, com origem explícita e grafo limitado).
- [x] Evitar compartilhamento implícito de todo o scrollback; exigir seleção/contrato (commits `089bf25` e `0595375`).
- [x] Criar memória por projeto/worktree com notas persistidas e citação de origem (commit `9f370a6`).
  - [x] Persistir notas bounded em `.cate/memory.json`, com escopo explícito por projeto ou caminho de worktree e suporte a projetos locais/remotos.
  - [x] Registrar citações estruturadas (tipo, localizador e linhas opcionais) sem capturar scrollback implicitamente; expor criação/edição na árvore do workspace.
- [x] Implementar contrato de tarefa em disco: objetivo, restrições, resultado validado, logs e artefatos.
  - [x] Definir contrato compartilhado, normalização determinística e limites bounded em `src/shared/projectTasks.ts`, sem capturar scrollback implicitamente.
  - [x] Persistir a projeção em `.cate/tasks.json` para projetos locais e remotos, com escrita atômica, quarentena de JSON inválido e isolamento por raiz.
  - [x] Expor load/save pelo caminho main → IPC → preload → renderer e cobrir a corrida de carregamento no store Zustand.
  - [x] Associar tarefas a missões/subagentes por `taskId`, sincronizar estado/arquivos tocados nos hooks de execução e exibir a seção editável na árvore do workspace.
  - [x] Registrar somente logs e artefatos explicitamente criados, com locators bounded; resultado validado exige ação explícita do usuário.
- [x] Adicionar grafo de dependência entre tarefas com paralelização segura.
  - [x] Persistir `dependsOn` bounded e deduplicado no contrato compartilhado.
  - [x] Detectar referências ausentes e ciclos; liberar somente tarefas `planned` com todos os pré-requisitos `completed`.
  - [x] Planejar paralelização conservadora por lane: uma tarefa sem worktree e uma por `worktreeId`, com conflitos deferidos de forma determinística.
  - [x] Exibir prontidão e causas de bloqueio na seção Tasks sem iniciar agentes automaticamente.
- [x] Adicionar retry, timeout, health check e aprovação humana nos pontos críticos.
  - [x] Definir política bounded de tentativas, timeout, intervalo de health, atraso de retry e aprovação no contrato compartilhado.
  - [x] Implementar gate e executor puro com prontidão, aprovação explícita, cancelamento, retry limitado, timeout e health check inicial/periódico.
  - [x] Persistir tentativas das missões e encerrá-las por fatos explícitos do run; expor pedido/decisão de aprovação na seção Tasks.
  - [x] Manter o executor sem criação de processos, ações destrutivas ou cópia implícita de scrollback.
- [x] Registrar auditoria de quem enviou contexto, prompt ou comando a cada agente.
  - [x] Definir contrato bounded de metadados com ator, origem, destino, tipo, correlação, resultado e contagem de caracteres, sem persistir conteúdo enviado.
  - [x] Persistir `.cate/agent-audit.json` para raízes locais e remotas via main/IPC/preload, com normalização, quarentena e escrita atômica.
  - [x] Instrumentar composer global, chat direto, sidebar/orquestrador e `terminal.type/press`, mantendo falha de auditoria independente do resultado da ação.
  - [x] Cobrir normalização, persistência e atribuição dos emissores com testes focados.

## Fase 5 — Worktrees, Git e durabilidade

- [x] Criar território visual automático por worktree.
- [x] Um clique para criar worktree + terminal + agente + tarefa inicial.
- [x] Inline diff card por agente com aprovação seletiva por hunk ou arquivo.
- [x] Fila de merge/conflito com checks antes de integrar trabalho.
- [x] Commit assistido, geração de mensagem, criação de PR e checklist de revisão.
- [x] Backend opcional de durabilidade com tmux onde disponível (contrato e critérios em [`ADR 0002`](../docs/adr/0002-runtime-durability-and-remote-boundaries.md)).
  - [x] Modo persistido opt-in, nome estável por workspace/painel, argv sem shell string, teardown explícito no close e detach do cliente no shutdown.
  - [x] WSL2 validou que o servidor tmux e a sessão sobrevivem à desconexão do cliente.
  - [ ] Repetir o smoke do host em macOS e em uma instalação Linux fora do WSL.
- [x] Reconstruir sessão após restart sem matar processos remotos/desanexados (depende do backend de durabilidade).
  - [x] O modo tmux é persistido no painel; o restore reconstrói o mesmo nome e reanexa a sessão existente.
  - [x] Validar o ciclo completo com o daemon empacotado reiniciado durante uma sessão real; `src/main/runtime/local-daemon-tarball.test.ts` agora provisiona o tarball nativo, exercita filesystem/PTY, encerra o daemon e confirma o auto-reconnect com o mesmo install.
- [x] Preservar scrollback, título, tags, geometria e estado do agente por sessão.
  - [x] Estado persistido é restaurado por painel; a limitação separada é que um restart do daemon não mantém o processo PTY vivo.

## Fase 6 — Plataforma, daemon e acesso remoto

- [x] Separar serviço headless opcional do desktop.
- [x] Expor API WebSocket/HTTP com autenticação local primeiro.
  - [x] O endpoint HTTP local usa bearer token efêmero e a CLI `cate`; o transporte RPC do daemon continua em stdio/túnel, sem listener remoto aberto.
- [x] Criar CLI com paridade: projetos, terminais, agentes, tarefas, contexto, diffs e resultados.
  - [x] A CLI atual cobre browser, painéis, editor, terminais e operações de agente, incluindo review/apply.
  - [x] Comandos dedicados de projeto, tarefas, contexto e resultados usam envelopes bounded e os mesmos escopos do endpoint local.
- [x] Publicar SDK TypeScript para automação e integrações.
  - [x] `@cate/sdk` é gerado sem dependência de Electron, com erros tipados, timeout e helpers para a API pública.
- [x] Implementar telemetria bounded e reconexão estável no caminho SSH/WSL existente.
  - [x] Transporte SSH/WSL, reconexão local e testes de contrato existem.
  - [x] Quedas remotas/WSL usam backoff bounded, fábrica de transporte novo, limite de cinco tentativas e evento de telemetria redigido via IPC.
  - [x] Validar WSL2 real com `runtimeConnectE2e.itest.ts`: Ubuntu passou
    CONNECT, INSTALL, ENSURE/reconexão mantida e DELETE (5/5; 2026-08-30).
  - [ ] Validar reconexão e teardown em um host SSH externo real.
  - [x] Tela de diagnóstico dedicada exibe fatos da conexão e histórico lifecycle bounded em memória.
- [x] Adicionar runtime remoto/container com workspace montado e segredos isolados (seam e critérios em [`ADR 0002`](../docs/adr/0002-runtime-durability-and-remote-boundaries.md)).
  - [x] Contrato Docker/Podman, mount único, root dentro do mount, `--pull never`, rede `none` por padrão e allowlist de ambiente.
  - [x] UI, serialização e erro de imagem ausente integrados ao RuntimeManager.
  - [x] Executar smoke contra daemon Docker e imagem openCate reais via `npm run test:container:runtime`; Podman continua dependente de um daemon instalado no host.
- [x] Notificações nativas quando agente pedir input, terminar ou falhar.
- [ ] Completar a disponibilização do companion mobile/web (protocolo em [`docs/COMPANION_AND_RELAY.md`](../docs/COMPANION_AND_RELAY.md)); a implementação local, UI/QR e companion web já existem, mas deployment e wrappers nativos ainda pendem.
  - [x] Métodos de leitura enumerados, sem scrollback implícito, limites bounded e gateway host-side com nonce/escopos.
  - [x] Ações limitadas a `codingAgent.send`/`tasks.update` com aprovação host-minted one-shot.
  - [x] Cliente SDK transport-neutral para web/mobile, prova de pairing e responder HTTP do desktop.
  - [x] Pairing one-shot com identidade P-256, código armazenado como digest, limite de tentativas e revogação de sessão.
  - [x] Entregar UI/QR no desktop e companion web responsivo; persistir a chave web como `CryptoKey` não extraível em IndexedDB (`src/sdk/companionIdentityStore.ts`). Wrappers mobile nativos ainda precisam de Keychain/Keystore.
  - [x] Gerar asset estático versionado (`npm run package:companion`) e integrá-lo ao release Linux; hosting/deployment real continua dependente do operador.
  - [x] Smoke web autocontido constrói/inicia o preview, espera readiness, verifica persistência após reload e encerra o processo em caso de falha.
- [x] Relay E2E opcional e self-hosted; nunca exigir conta para uso local (contrato em [`docs/COMPANION_AND_RELAY.md`](../docs/COMPANION_AND_RELAY.md)); servidor e round-trip criptografado cobertos por testes reais de loopback.
- [x] Relay HTTP loopback, canais efêmeros, bearer por digest, frames ciphertext-only e limites de tamanho/TTL.
- [x] Implementar P-256 ECDH + HKDF-SHA-256 + AES-256-GCM com AAD de metadados e testes de round-trip.
- [x] Cliente companion tolera até três falhas transitórias consecutivas de leitura sem repetir `POST`s; regressão no round-trip real do relay.
- [ ] Validar deployment atrás de proxy TLS autenticado, rotação operacional e reconnect real.

## Fase 7 — Qualidade, segurança e release

- [x] Suite de contratos para cada adaptador de agente.
  - [x] A suíte live é opt-in (`CATE_LIVE_AGENT_CLIS=1`) e fica excluída do gate unitário por depender dos CLIs instalados e de credenciais locais.
- [x] Testes de concorrência: muitos PTYs, eventos simultâneos e restore de sessão.
  - [x] Capability de processos cobre 48 PTYs criados, escritos, redimensionados, com saída e encerramento concorrentes, sem cross-routing.
  - [x] Restore/hydrate por workspace serializa chamadas concorrentes e evita leitura duplicada do snapshot.
- [x] Testes de performance nas superfícies suportadas: pan/zoom, resize e 50+ terminais; canvas aninhado permanece fora do contrato atual.
  - [x] Pan/zoom, resize e 50+ PTYs vivos cobertos; canvas aninhado não é uma superfície suportada pelo contrato atual.
  - [x] Resize live dedicado coberto; canvas dentro de canvas continua recusado pelo contrato do store e documentado como limitação.
- [x] Revisão de segurança: IPC, path traversal, comandos injetados, credenciais, webviews e runtime remoto.
  - [x] SEC-001: destinos de worktree validados no runtime antes de Git/filesystem; regressão em `vcs.security.test.ts`.
  - [x] SEC-002: ambiente de servidores de extensão reduzido por allowlist; regressão em `server.test.ts`.
  - [x] BrowserPanel local: E2E cobriu HTTP loopback, `file:` e CDP real; política
    unitária cobriu popup HTTPS permitido e esquemas inseguros bloqueados.
  - [ ] Validar manualmente webviews, CDP local e SSH externo; o WSL2 real foi
    coberto pelo E2E IPC, e o detalhe restante está em [`docs/SECURITY_AUDIT.md`](../docs/SECURITY_AUDIT.md).
- [x] Auditoria de privacidade: sem telemetria obrigatória e dados sensíveis fora de logs.
  - [x] `telemetryEnabled` com opt-in explícito, padrão desligado, gate em analytics/Sentry e descarte do buffer legado.
  - [x] Feedback externo não carrega texto livre; apenas rating e metadados bounded.
  - [x] Registrar o comportamento técnico e o gate de aprovação em [`docs/PRIVACY_DRAFT.md`](../docs/PRIVACY_DRAFT.md).
  - [ ] Revisar política pública, retention e DSN antes do release candidate.
- [x] Empacotar Windows, macOS e Linux com auto-update seguro.
  - [x] CI de release publica instaladores por plataforma, tarballs do runtime e metadados usados pelo `electron-updater`; assinatura/configuração dependem dos secrets de release.
- [x] Documentação de usuário em português e inglês (`docs/USER_GUIDE.md` e `docs/USER_GUIDE.en.md`).
- [x] Guia de contribuição, arquitetura e troubleshooting (`CONTRIBUTING.md`, `docs/ARCHITECTURE.md` e `docs/TROUBLESHOOTING.md`).
- [x] Release candidate com checklist de migração a partir de workspaces do openCate em [`docs/RELEASE_CANDIDATE.md`](../docs/RELEASE_CANDIDATE.md).
  - [x] Pacote Windows local gerado e validado em `release/` (NSIS, ZIP, blockmap e `latest.yml`); assinatura não foi declarada sem os secrets do release.
  - [ ] Executar o checklist em checkout limpo, obter sign-off cross-platform e publicar artefatos assinados.

## Próximos passos imediatos

> **INSTRUÇÃO PARA PRÓXIMA SESSÃO DE IA:** O repositório do produto está em `C:\Users\gabri\Documents\cate`. A **Fase 1** está concluída (`7eacf7b`, `c36b570`, `454e5e9`, `2044a6f`). Os itens 1–6 da **Fase 4** também estão concluídos (`647d60e`, `21dc550`, `0a59817`, `089bf25`, `0595375`, `f6bcdbe`). Na **Fase 3**, o registro declarativo, o fallback hooks+tela e a taxonomia canônica de estados já estão concluídos (`29a0595`, `f559e01`, `de654f8`). A memória por projeto/worktree, o contrato de tarefa em disco, o grafo de dependências com lanes seguras, a política bounded de execução e a auditoria local de autoria estão implementados e validados. Nesta retomada também foram fechados o quick start de worktree + terminal + agente + tarefa, diff seletivo, fila de merge, commit assistido, nomes/tamanhos/memória espacial de canvas, notificações de conclusão/falha e a auditoria do daemon/CLI. A organização documental/higienização de baixo risco já foi aplicada no repositório, mas há alterações locais preservadas: leia `docs/README.md`, `docs/PROJECT_STRUCTURE.md` e `docs/maintenance/hygiene-backlog.md` antes de novas refatorações. Não compartilhar scrollback implicitamente; novas relações devem nascer apenas de seleção/contrato explícito e entrega confirmada.

### Ponto de retomada confirmado — 2026-08-29

- **Pasta canônica:** `C:\Users\gabri\Documents\cate`.
- **Branch:** `product/agent-canvas`.
- **Último commit base:** `5380f92 test: keep daemon fixtures out of checkout`; as implementações desta retomada continuam somente na árvore de trabalho.
- **Estado do código:** alterações locais de higiene e produto já existentes foram preservadas; diretórios temporários de testes E2E continuam cobertos pelo `.gitignore`.
- **O que foi concluído:** contrato compartilhado, persistência local/remota, main/IPC/preload, store/UI, associação com missões/subagentes, grafo de dependências, política bounded de execução, histórico de tentativas, auditoria local de autoria, território visual, quick start de missão, diff seletivo, fila de merge, commit assistido, tamanhos preferidos, memória espacial, notificações de ciclo de vida, auditoria da plataforma/CLI, CLI/SDK de projeto e reconexão remota bounded com telemetria redigida.
- **Próxima ordem:** executar as validações externas ainda abertas — host SSH/WSL real, revisão manual de webviews/CDP, smoke Podman, deployment TLS e política/retention — e obter as decisões de identidade visual e assinatura de RC. Os contratos locais de tmux, container e companion/relay estão implementados e registrados no [`ADR 0002`](../docs/adr/0002-runtime-durability-and-remote-boundaries.md); o SDK, pairing host-side, cripto E2E, UI/QR desktop e companion web com identidade IndexedDB também estão implementados.
- **Verificação final desta retomada:** typecheck, lint, build, smoke Electron, audit de produção e a suíte serial passaram; resultado: **412 arquivos / 3.280 testes aprovados / 6 arquivos e 69 testes ignorados / 0 falhas**. O gate `verify:hygiene` também passou após ser tornado serial para evitar contenção `EBUSY` nos teardowns de daemon do Windows. Os E2Es reais de browser background + CLI passaram juntos (**2/2**).
- **Higienização concluída nesta sessão:** análise comparativa trazida para `research/project-analysis.md`, link do ADR corrigido, mapa de documentação criado, caminhos de skills corrigidos em `AGENTS.md`/`CLAUDE.md`, instruções de Bun/npm alinhadas, `WorkspaceTab`/preload divididos, smoke reproduzível documentado e resíduos `cate-exte2e-*` adicionados ao ignore.

### Review — 2026-08-29 (Fase 5, território visual por worktree)

- A base já tinha a projeção automática em `src/renderer/canvas/worktree/`: membership por worktree vivo, agrupamento bounded de painéis montados, lente de foco/hover e campo visual WebGL2 com fallback CPU. O Canvas mantém a camada atrás dos painéis, sem capturar ponteiro nem alterar geometria.
- O cenário E2E cobre engajamento com quatro worktrees, pan, zoom, movimento de nó, contagem de draws, área do scissor e diferença entre cluster amplo e ilha pequena. A janela de performance é ativada somente com `CATE_PERF=1`; E2Es comuns continuam ocultas para não roubar foco.
- Verificação: build após o ajuste do harness; `e2e/worktree-territory-perf.spec.ts` **5 testes aprovados**, incluindo pan/zoom/node-move a **144 FPS**, 91–118 draws por janela e scissor de 100% vs 29%.

### Review — 2026-08-29 (Fase 5, quick start de missão isolada)

- O menu de worktrees agora oferece “Start task in new worktree…”, com nome de branch, tarefa inicial, agente opcional e base branch.
- `startWorktreeMission` compõe um supervisor openCate Agent, o driver autoritativo `cate.codingAgent.create`, o worktree real, a tarefa persistida e a associação do chat ao worktree. O driver continua responsável por hooks, PTY, lifecycle e rollback.
- Falhas de criação do painel ou inicialização do terminal encerram a tarefa, fecham o painel e removem o worktree criado pela missão; falhas de preflight continuam usando o rollback existente.
- Verificação: typecheck aprovado; driver **34 testes**, composição **2 testes** e formulário **2 testes** aprovados.

### Review — 2026-08-29 (Fase 5, diff seletivo por missão)

- O review de worktree agora retorna hunks bounded com IDs determinísticos e o card inline agrupa arquivos, mostra linhas coloridas e permite seleção de arquivo ou hunk.
- A aprovação não envia patch arbitrário pelo renderer: o runtime recalcula `base...worker`, valida que o checkout base está limpo e na branch revisada e executa somente a seleção no índice (`git apply --cached`). Nenhum commit ou merge automático é feito.
- O driver registra os hunks aprovados no run e mantém a ação de merge integral separada. Seleções obsoletas, diff truncado e conflitos retornam mensagens acionáveis.
- Verificação: parser **2 testes**, runtime VCS **6 testes**, integração **7 testes** e sidebar **4 testes** aprovados; typecheck aprovado.

### Review — 2026-08-29 (Fase 5, fila de merge e commit assistido)

- A fila é serializada por raiz do workspace, revalida o review antes de enfileirar, interrompe em conflito/falha e mantém estados visíveis de queued/running/completed/conflict/failed.
- O commit assistido relê o status, exibe os arquivos atuais, exige revisão de diff, consideração dos checks e verificação de secrets, permite editar a mensagem gerada e só então faz stage/commit. PR continua bloqueado enquanto houver arquivos não commitados.
- Verificação: fila/store e integração **15 testes**, commit/helper e store **17 testes** aprovados.

### Review — 2026-08-29 (Fase 2, tamanhos e memória espacial)

- Tamanhos de painel agora resolvem por agente → worktree → workspace → tipo, rejeitando preferências inválidas e lembrando o último resize no escopo mais específico aplicável.
- O canvas persiste waypoints nomeados, notas, setas, grupos e checkpoints de layout com limites bounded; o menu contextual oferece salto, remoção e rollback sem misturar a memória espacial com a geometria dos nós.
- Verificação: preferências/painéis **15 testes**, memória espacial/canvas **70 testes** e round-trips de sessão **57 testes** aprovados; typecheck aprovado.

### Review — 2026-08-29 (Fase 2/6, desempenho e notificações)

- O culling conserva a identidade dos nós, mantém webviews necessários vivos e restaura scrollback por `panelId`; a nova cobertura sintética mede um canvas de 64 nós sem prometer custo de 50+ PTYs ativos.
- A máquina de estados agora notifica needs input, conclusão e falha, usando a saída conhecida do PTY quando disponível, com ação para focar o terminal e sem alerta de falsa conclusão em missão interrompida pelo usuário.
- Verificação: recorte combinado de renderer/runtime/shared **12 arquivos / 158 testes** e detector/lifecycle **2 arquivos / 51 testes** aprovados. O stress E2E de terminais vivos continua limitado a 9 PTYs.

### Review — 2026-08-29 (Fase 6/7, daemon, CLI e release)

- A auditoria confirmou o daemon `cate-runtime` headless, RPC por stdio/túnel, endpoint HTTP loopback autenticado e transporte SSH/WSL já existentes. A CLI cobre browser, painéis, editor, terminais e operações de agente; paridade dedicada para projetos, tarefas, contexto e resultados uniformes segue pendente.
- CI executa build, typecheck, lint, unit tests, smoke Electron e E2E em Windows, macOS e Linux; o workflow de release empacota os três sistemas e publica tarballs do runtime/metadata para o updater.
- Permanecem deliberadamente abertos nesse ponto histórico: reconexão automática remota/telemetria operacional, tmux/process survival, runtime containerizado, SDK, companion mobile/web, relay self-hosted, 50+ terminais vivos, documentação de usuário bilíngue e checklist de release candidate.

### Review — 2026-08-29 (Fase 6, CLI/SDK e reconexão remota)

- A CLI agora cobre projeto, tarefas, contexto e resultados com envelopes bounded e permissões separadas de leitura/controle. O SDK TypeScript compartilha os contratos públicos, não importa Electron e tem timeout/erros tipados.
- O `RuntimeManager` aceita uma fábrica de transporte novo para quedas SSH/WSL, aplica backoff de 1–15 s com cinco tentativas máximas, cancela timers em teardown e emite telemetria lifecycle sem detalhes de host, caminho ou credencial. O preload e o app store mantêm os últimos 50 eventos apenas em memória.
- Verificação: conexão runtime **29 testes**; IPC runtime/preload **29 testes**; typecheck, lint e `git diff --check` aprovados. A validação em SSH/WSL real ainda é necessária.

### Review — 2026-08-29 (gate final e compatibilidade)

- A suíte completa encontrou e corrigiu uma regressão de compatibilidade: `canvasAccess` agora trata arrays de memória ausentes em fixtures/snapshots legados como memória vazia, sem alterar o formato novo persistido.
- Verificação final: teste de teardown **4/4**; suíte serial **393 arquivos aprovados / 7 skipped; 3.223 testes aprovados / 70 skipped / 0 falhas**; typecheck aprovado; lint aprovado sem avisos; build Electron aprovado; `git diff --check` limpo.

### Review — 2026-08-29 (Fase 4, política de execução de tarefas)

- O contrato de tarefas agora aceita uma política bounded de execução, decisão de aprovação humana e histórico limitado de tentativas. A normalização impõe limites de tentativas, timeout, health check, retry, mensagens e notas.
- `projectTaskExecution.ts` concentra o gate de prontidão/aprovação e o executor puro com cancelamento, retry limitado, timeout e health check inicial/periódico. O seam não cria processos nem copia scrollback.
- O store expõe pedido/decisão de aprovação e registro de tentativas. O driver cria a tentativa `running` junto da missão; lifecycle, stop e falhas de criação encerram a tentativa por facts explícitos do run e registram somente logs/artefatos estruturados.
- A UI da seção Tasks permite editar a política e tomar a decisão de aprovação, sem iniciar agentes automaticamente.
- Verificação: typecheck aprovado; lint aprovado sem novos warnings; testes focados da política/store/driver aprovados (**45 testes**); suíte completa **384 arquivos / 3.185 testes / 70 skips / 0 falhas**.

### Review — 2026-08-29 (Fase 4, autoria e auditoria local)

- `agentAudit.ts` define um contrato bounded de proveniência para contexto, prompt e comando, com ator, origem, painel/run de destino, correlação, resultado e tamanho; normalização descarta campos de conteúdo e eventos malformados.
- `.cate/agent-audit.json` usa a mesma rota main/IPC/preload local/remota das demais projeções machine-local, com escrita atômica, quarentena e retenção limitada. A gravação é best-effort e não altera o resultado da ação original.
- Composer global, chat direto, sidebar/orquestrador e API de terminal passam autoria explícita; `terminal.read` não cria evento e entrada em terminal só é auditada quando há missão alvo identificável.
- Verificação: **8 arquivos / 111 testes focados aprovados / 0 falhas**; typecheck, lint, build e smoke Electron aprovados; suíte completa serial **387 arquivos / 3.195 testes / 70 skips / 0 falhas**. A execução paralela padrão manteve os testes verdes, mas sofreu contenção `EBUSY` no teardown de daemon no Windows; as suítes afetadas passaram isoladamente.

### Estado atual da Fase 4 — Árvore viva (item 1)

**Data:** 2026-08-24
**Branch:** `product/agent-canvas`
**Último commit:** `647d60e` (`feat(agents): live mission tree`)
**Working tree:** limpo, exceto diretórios temporários `cate-exte2e-*` usados por testes E2E.
**Progresso de código:** item 1 implementado, validado e commitado.

#### Decisão de arquitetura registrada

- A árvore viva deve ser uma **visão derivada pura**, não uma nova entidade persistida.
- Fontes existentes que devem ser combinadas:
  - `CodingAgentRun` em `src/shared/codingAgentRuns.ts`, usando `ownerPanelId` para identificar o supervisor.
  - Descoberta cross-window em `windowPanelSync.ts` / `windowPanels.ts`.
  - Estado do agente derivado por `agentScreenDetector.ts` / status store.
  - Usage/métricas já persistidas em `codingAgentRun`.
- O builder não deve duplicar fonte de verdade nem depender de mutação global.

#### Subtarefas do item 1

- [x] Criar `src/renderer/lib/agent/agentTree.ts`.
- [x] Implementar `buildAgentTree(input)` recebendo runs locais + detached panels + informações por panel.
- [x] Retornar grupos `{ supervisor, workers }`, com workers ordenados por `createdAt`.
- [x] Incluir workers locais, stashed/detached e reportados por outras janelas sem duplicar painéis.
- [x] Adicionar testes unitários cobrindo supervisor com workers, worker detached/cross-window, ordenação e ausência de supervisor.
- [x] Renderizar a árvore derivada na sidebar, integrando ou agrupando abaixo dos supervisores.
  - Seção "Missions" mostra supervisor com contagem de workers; cada worker expõe estado, título, tokens, contexto, custo e duração.
  - Workers locais focam o painel; workers cross-window focam a janela dona.
- [x] Rodar gates: typecheck, lint, testes focados e suíte completa.
  - Typecheck limpo.
  - Lint: **0 erros / 23 avisos herdados**.
  - Testes focados: **17 aprovados / 0 falhas** (builder + renderização da sidebar).
  - Suíte unitária completa: **3.087 aprovados / 70 skips / 0 falhas**.
- [x] Commit e atualizar esta seção como concluída (`647d60e`).

#### Próximo item da Fase 4

Mostrar detalhes acionáveis por subagente — especialmente último tool call e arquivos tocados — evoluindo a linha atual da sidebar para um painel/inspetor sem duplicar o estado das missões.

#### Definição de pronto

- Supervisor aparece uma única vez com seus workers derivados corretamente.
- Workers locais, stashed/detached e cross-window aparecem sem duplicação.
- Estados voláteis e métricas persistidas são apresentados pela mesma visão derivada.
- Typecheck/lint/testes focados/suite completa passam conforme baseline atual.

### Ordem de execução

**Fase 1 — Estabilização da fundação (prioridade atual):**

1. ~~Auditar dependências nativas: Electron, `node-pty`, xterm WebGL, watcher e runtime embutido.~~ ✅ Concluído.
2. ~~Corrigir scripts incompatíveis com Windows sem remover suporte Unix.~~ ✅ Concluído (commit `7eacf7b`).
3. ~~Adicionar teste E2E mínimo: abrir projeto, criar terminal, redimensionar nó, salvar/restaurar canvas.~~ ✅ Concluído (commit `c36b570`).
4. ~~Adicionar teste E2E de múltiplos canvases e janelas destacadas.~~ ✅ Concluído (commit `454e5e9`).
5. ~~Documentar modelo de processos, IPC, persistência e limites de segurança.~~ ✅ Concluído (commit `2044a6f`).

**Depois — pendências da Fase 3 (nesta ordem):**

6. ~~Exibir tokens, custo estimado, contexto restante e tempo por execução.~~ ✅ Concluído (commit `191d201`).
7. ~~Unificar histórico, busca e replay de sessões entre CLIs.~~ ✅ Concluído na primeira versão (commit `f1918d9`; indexação por eventos observados, busca por metadados/conteúdo e replay somente leitura).
8. ~~Criar composer global para um prompt, seleção múltipla, broadcast controlado e tradução opcional de slash commands.~~ ✅ Concluído na primeira versão (commit `e6880b1`; implementação no toolbar do canvas, confirmação para múltiplos alvos, filtro por contrato de follow-up e tradução opt-in limitada).
9. ~~Adicionar perfis reutilizáveis de modelo, reasoning, permissões e ambiente.~~ ✅ Concluído (commit `ad68522`; preferências estruturadas são traduzidas apenas pelo registro canônico, com ambiente validado e degradação silenciosa quando um agente não suporta a permissão).

**Fase 4 — prioridade atual:**

10. ~~Construir árvore viva de orquestrador -> subagentes -> tarefas~~ ✅ Concluído no commit `647d60e`. Continuar pelo segundo item da Fase 4: "Mostrar status, último tool call, arquivos tocados, custo e contexto de cada subagente" (custo/contexto/status já visíveis na árvore; tool call e arquivos são as lacunas atuais).
11. ~~Mostrar status, último tool call, arquivos tocados, custo e contexto de cada subagente~~ ✅ Implementado no commit `21dc550`: captura estruturada de PostToolUse (`tool_name`/`toolName` + comando/caminho), histórico limitado e deduplicado de arquivos, persistência em `codingAgentRun`, propagação compacta entre janelas e exibição na árvore de missões.
12. ~~Permitir inspecionar, pausar, cancelar, reenviar e promover resultado de subagente~~ ✅ Implementado no commit `0a59817`.
13. ~~Criar barramento explícito de contexto entre terminais~~ ✅ Completo nos commits `089bf25` (contrato + nota/artefato) e `0595375` (seleção de terminal, arquivo de workspace e diff de worktree). **Próximo:** arestas visuais de contexto.

### Review — 2026-08-25 (Fase 4, item 4 completo)

- Capturas explícitas adicionadas ao composer global: seleção ativa/fallback do terminal com limpeza imediata da seleção xterm, anexo de arquivo via bridge escopada `fsReadFile` e diff calculado pelo review de worktree contra a branch primária.
- O dropdown de diff passou a usar a junção canônica `useWorktrees`, unindo metadados persistidos à lista live do git em vez da cópia denormalizada do workspace.
- Erros ficam acionáveis na UI (`terminal-not-ready`, `no-terminal-selection`, `workspace-file-unavailable`) e nenhuma evidência é enviada implicitamente; todo conteúdo passa pela mesma fila limitada de contexto e pelo follow-up autoritativo.
- Verificação final: typecheck limpo; lint focado sem problemas; testes direcionados **10 aprovados / 0 falhas**; suíte completa **3.106 aprovados / 70 skips / 0 falhas**. Commit: `0595375`.

### Review — 2026-08-27 (Fase 4, itens 5–6 e realocação do projeto)

- Relações de contexto agora são derivadas somente de entregas bem-sucedidas do composer global. A origem do terminal fica registrada no item capturado, o log de relações é limitado a 40 entradas e o overlay calcula arestas entre nós reais do canvas sem inferir proximidade ou compartilhar scrollback.
- O canvas renderiza arestas direcionais no espaço mundial, com rótulo e cor por tipo de evidência; relações incompletas, entre painéis ausentes ou dentro do mesmo nó são omitidas. Testes cobrem contrato, limite, geometria, entrega parcial e renderização.
- A decisão de segurança para persistir um `session-start` como stamp de retomada agora vive em `AgentDef.resumeFromSessionStart`; `agentSessionStamps` não mantém mais uma tabela paralela de agentes (commit `29a0595`).
- O repositório foi movido de `work\repos\cate` para `C:\Users\gabri\Documents\cate`, preservando o branch `product/agent-canvas`, o histórico, os arquivos rastreados e as alterações locais. A origem contém apenas diretórios vazios temporários e nenhum arquivo restante.
- Verificação final no novo caminho: testes focados **16 aprovados / 0 falhas**; contrato de registry/stamps **38 aprovados / 0 falhas**; typecheck limpo; lint **0 erros / 5 avisos herdados**; suíte completa **3.112 aprovados / 70 skips / 0 falhas**. Commits: `f6bcdbe`, `29a0595`.

### Review — 2026-08-27 (Fase 3, registro declarativo e fallback de tela)

- O registro compartilhado agora declara também `screenFallback`; Aider é o único agente habilitado enquanto os demais permanecem hook-first. A identidade pode vir do processo monitorado ou de um lançamento openCate-owned confiável.
- O fallback lê somente as linhas visíveis do viewport xterm, remove decoração ANSI e retorna apenas `running`, `waitingForInput` ou ambíguo. Não lê/persiste/transmite scrollback e não cria sessão, métrica ou notificação por heurística.
- Um evento estruturado observado torna-se autoritativo e desativa amostras heurísticas para aquele terminal; a queda do processo continua fornecendo a aresta `finished`. O nome/logo de um fallback permanece visível apenas enquanto o estado está vivo.
- Verificação: testes focados **63 aprovados / 0 falhas**; suíte completa **3.121 aprovados / 70 skips / 0 falhas**; typecheck limpo; lint **0 erros / 23 avisos herdados**. Commit: `f559e01`.

### Review — 2026-08-27 (Fase 3, taxonomia canônica de estados)

- O ciclo de vida provider-neutral agora usa `working`, `waiting`, `idle`, `finished`, `error` e `stalled`, com precedência centralizada e adaptadores explícitos para `AgentState` do terminal e `CodingAgentRunStatus` persistido.
- A derivação de missões continua expondo os status específicos existentes (`starting`, `working`, `waiting`, `stalled`, `ready`, `stopped`, `failed`); erros e finalizações não são achatados na fonte canônica antes da projeção da missão.
- Verificação: contrato focado **75 aprovados / 0 falhas**; suíte completa **3.145 aprovados / 70 skips / 0 falhas**; typecheck limpo; lint **0 erros / 23 avisos herdados**. Commit: `de654f8`.

### Review — 2026-08-27 (Fase 4, memória por projeto/worktree)

- O projeto agora mantém notas user-curated em `.cate/memory.json`, com armazenamento atômico local/remoto e isolamento por escopo `project` ou caminho de worktree. A camada de renderer evita que uma leitura lenta sobrescreva uma alteração feita durante o carregamento.
- Cada nota exige pelo menos uma citação estruturada (arquivo, terminal, sessão de agente, tarefa, URL ou manual), com localizador e linhas opcionais; a UI de Memory fica na árvore do workspace e não captura/transmite scrollback automaticamente.
- Verificação: testes dedicados **17 aprovados / 0 falhas**; suíte completa **3.162 aprovados / 70 skips / 0 falhas** com `--hookTimeout=60000`; typecheck limpo; lint **0 erros / 23 avisos herdados**. Commit: `9f370a6`.

### Review — 2026-08-29 (Fase 4, contrato de tarefa em disco)

- `ProjectTask` agora é um contrato provider-neutral com objetivo, restrições, status, resultado validado, logs e artefatos estruturados. A normalização aplica limites de quantidade/tamanho, remove evidência malformada e ordena de forma determinística.
- `.cate/tasks.json` é persistido por projeto/worktree no main process, com escrita atômica local/remota, quarentena de JSON corrompido e lock por raiz. O renderer recebe apenas load/save pelo IPC e evita que uma leitura atrasada sobrescreva alterações locais.
- Missões openCate-owned carregam `taskId`; hooks e encerramento de terminal atualizam a tarefa associada, e arquivos tocados entram somente como referências explícitas. A seção Tasks permite criar/editar contrato, registrar validação, log e artefato manualmente; nenhum scrollback é lido ou salvo implicitamente.
- Verificação focada: **11 arquivos / 100 testes aprovados / 0 falhas**. Typecheck, lint, build de produção e smoke Electron passaram. A suíte completa terminou com **379 arquivos / 3.169 testes aprovados / 70 skips** e **3 arquivos / 5 falhas** somente sob execução paralela; `cateApiEndpointManager.test.ts`, `ExtensionServerManager.test.ts` e `workspaceCateApi.test.ts` passaram isoladamente (1, 17 e 17 testes).

### Review — 2026-08-29 (Fase 4, grafo de dependências)

- `ProjectTask.dependsOn` mantém pré-requisitos explícitos, bounded e deduplicados. O analisador puro em `src/shared/projectTaskGraph.ts` identifica dependências ausentes, ciclos, espera por tarefas incompletas e bloqueios por falha/cancelamento.
- A lista de tarefas prontas só inclui contratos `planned` cujos pré-requisitos estão `completed`. O plano paralelo escolhe no máximo uma tarefa por lane: tarefas sem `worktreeId` compartilham a lane `project`, enquanto worktrees distintos podem avançar em paralelo; o restante fica deferido de modo determinístico.
- A sidebar permite editar dependências e mostra prontidão/causa de bloqueio. O grafo é somente análise: não inicia processos nem transforma scrollback em contexto.
- Verificação: contrato/grafo/store/UI **4 arquivos / 10 testes aprovados / 0 falhas**; typecheck, lint, build, smoke Electron e suíte completa **383 arquivos / 3.177 testes / 70 skips / 0 falhas**.

**Pendências bloqueadas (aguardando binários):**

- Validar adaptadores Gemini/Copilot/Aider contra binários reais (`gemini`, `copilot`, `aider` não instalados nesta máquina).
- Avaliar recuperação de interrupção para Gemini/Copilot somente após capturar transcripts reais.
- Smoke test manual do app em modo desenvolvimento (Fase 0) — requer abrir o app visualmente.

## Review — 2026-08-23

- Baseline Windows consolidado com `typecheck`, `lint`, suite completa e smoke dos daemons locais: **3.007 aprovados / 0 falhas / 70 skips**.
- O menu de contexto de terminais na sidebar agora é um único menu nativo, combinando metadados (`star`, cor, tags) com rename, move-to-window e close; isso elimina o popup encadeado que consumia a ação escolhida.
- Testes foram ajustados para não dependerem do localStorage experimental incompleto do Node, de symlinks privilegiados no Windows ou do estado real do home do desenvolvedor.
- `RemoteRuntime.validatePathStrict` e `validatePathForCreation` agora aplicam o mesmo contrato de escopo confiável das operações folha quando o chamador interno não passa contexto explícito.
- Stash implementado como estado machine-local do painel: `stashPanel` remove apenas a colocação visual e preserva PTY/xterm; `unstashPanel` restaura pelo caminho normal de colocação. A sidebar ganhou seção "Stashed", o Command Palette lista/restaura painéis estacionados e o menu do nó no canvas expõe a ação para a aba ativa. Autosave inclui explicitamente painéis stashed em session.json. Verificação: typecheck, lint e suite completa — **3.012 aprovados / 0 falhas / 70 skips**.
- Fila de atenção baseada em estado: `waitingForInput` e `finished` entram automaticamente na seção "Needs attention"; o foco revela o painel e o estado transient sai da fila. A ação `focusNextAttentionTerminal` está disponível no menu Go, Command Palette e atalho padrão `Ctrl+Shift+I`. Verificação: typecheck, lint sem erros e suite completa — **3.014 aprovados / 0 falhas / 70 skips**.
- Sparkline de atividade implementada com histórico circular por painel: 24 buckets de 5s alimentados pelo stream real do PTY; snapshot imutável evita re-render a cada chunk. Visualização compacta no grab strip do canvas e nas linhas locais/stashed da sidebar, com limpeza no dispose. Verificação: typecheck, lint 0 erros / 24 avisos herdados e suite completa — **3.021 aprovados / 0 falhas / 70 skips**.
- Linhas stashed agora exibem fatos duráveis do agente: sessão CLI retomável, missão retida/pronta/falha ou interrompida. A derivação usa apenas metadados persistidos (`agentSession` / `codingAgentRun`) e não inventa status volátil quando o processo não é visível. Verificação: typecheck, lint 0 erros / 24 avisos herdados e suite completa — **3.023 aprovados / 0 falhas / 70 skips**.
- Cadeia de foco completada com ciclo por worktree: a ação parte do terminal ativo, percorre somente terminais do mesmo `worktreeId` na ordem canônica da sidebar e fica disponível via menu Go, Command Palette e `Ctrl+Shift+O`. Zoom-to-fit e próximo/anterior já existiam na base. Verificação: typecheck, lint 0 erros / 24 avisos herdados e suite completa — **3.024 aprovados / 0 falhas / 70 skips**.
- Ciclo por agente no Command Palette: o modo `#agente` une identidade persistida (`codingAgentRun` / `agentSession`) e agente detectado em execução, aceita id ou nome de exibição e usa a mesma ordem canônica dos demais ciclos. A verificação cobre missão Codex, sessão Claude restaurada e Grok detectado ao vivo. Typecheck passou; lint ficou com 0 erros / **23 avisos herdados**; suite completa — **3.025 aprovados / 0 falhas / 70 skips**.
- Estado `stalled` padronizado na política central de missões: um agente em execução sem saída observada do PTY por 5 minutos passa a `stalled`, para de brilhar como "working" e recebe selo visível no cartão. O histórico de atividade persiste o timestamp real do último output; supervisor, snapshot/API e relatórios entre janelas usam a mesma derivação, e `stalled` é acionável em esperas cross-window. Verificação: typecheck, lint 0 erros / **23 avisos herdados**, testes focados (**108 aprovados**) e suite completa — **3.030 aprovados / 0 falhas / 70 skips**.
- Status digest compacto implementado como derivado puro (`buildWorkspaceDigest` + `formatWorkspaceDigest`): agrega estados locais, painéis stashed e painéis em outras janelas sem duplicar fonte de verdade. A fila de atenção foi estendida para incluir stashed acionáveis, e o digest renderiza uma linha discreta no topo da árvore expandida da sidebar. Verificação: typecheck, lint 0 erros / 23 avisos herdados, testes focados (3 aprovados) e suíte completa — **3.033 aprovados / 0 falhas / 70 skips** (um hook de cleanup em teste de daemon estourou timeout na primeira passada; o teste passa isolado).
- Registro de agentes ampliado para **Gemini CLI, Copilot CLI e Aider**. Gemini recebeu hooks mapeados em `.gemini/settings.json` (merge seguro) e skills em `.gemini/skills`; Copilot recebeu arquivo próprio `.github/hooks/cate-hook.json` com payload VS Code-compatível e skills em `.github/skills`; Aider foi registrado como agente parcial com lançamento one-shot `--message`, sem resume por id, skills ou hooks — todas as lacunas ficam protegidas por tripwires. Sessões, logos, preflight, argv de missões, status lifecycle e exclusão git foram cobertos por testes. Verificação: typecheck, lint **0 erros / 23 avisos herdados** e suíte completa — **3.047 aprovados / 0 falhas / 70 skips**. Contratos Gemini/Copilot derivam das fontes salvas em `work/`; validação live com binários permanece como próximo passo.
- Overrides declarativos de comando implementados por workspace: perfis nomeados com executável/argv sem shell, interpolação `{PROMPT}` nos argumentos e precedência perfil explícito > override por agente > registro canônico. A configuração é normalizada em settings/store/schema, propagada do driver até o spawn do PTY e o CLI ganhou `cate agent create --profile`. Verificação: typecheck, lint 0 erros / **23 avisos herdados** e suíte completa — **3.057 aprovados / 0 falhas / 70 skips**.
- Lição registrada em `tasks/lessons.md`: sessão anterior avançou da Fase 0 direto para Fase 2/3 sem executar Fase 1. Regra adicionada: verificar fases pendentes antes de iniciar qualquer item e perguntar ao usuário se houver pulo.
- Métricas de execução adicionadas para missões de agentes CLI (commit `191d201`): duração calculada com início/fim real e atualizada enquanto o processo está ativo; uso estruturado opcional (`inputTokens`, `outputTokens`, cache, total, custo reportado, modelo, contexto usado/janela) é normalizado a partir de payloads de hooks e persistido no `codingAgentRun` em `session.json`. O cartão do openCate Agent e os detalhes de `inspect`/`wait` mostram tokens, duração, contexto restante e custo; quando o CLI não reporta usage, a UI mostra `tokens unavailable`/`Unavailable` sem estimar a partir de texto. Pi agora envia usage/contexto disponível no evento `agent_end`. Verificação: typecheck, lint sem erros (**23 avisos herdados**) e suíte completa — **3.064 testes aprovados / 0 falhas / 70 skips**.
- Histórico unificado de sessões implementado na primeira versão (commit `f1918d9`): contrato canônico provider-neutral, índice machine-local em `.cate/agent-sessions.json`, registro idempotente a partir dos hooks, busca por metadados e conteúdo de transcripts conhecidos e replay somente leitura no openCate Agent. A chave composta inclui runtime, agente e sessão; caminhos de transcript são validados no processo principal e não são lidos diretamente pelo renderer. Retomada não é acionada pelo replay. A versão atual indexa sessões observadas enquanto o openCate está ativo; varredura retroativa global e leitura de transcripts externos em runtimes remotos ficam documentadas como próxima evolução. Verificação: typecheck passou; lint sem erros (**23 avisos herdados**); testes focados passaram; suíte completa terminou com **3.074 testes aprovados / 70 skips**, mas 2 suítes falharam em cleanup de infraestrutura no Windows (`extension-daemon.e2e.test.ts` por timeout do `afterAll` e `local-daemon-tarball.test.ts` por `EBUSY` ao remover diretório temporário).
- Composer global de agentes implementado na primeira versão (commit `e6880b1`): botão no toolbar do canvas, lista reativa de missões openCate-owned, seleção múltipla, confirmação obrigatória para broadcast, envio por driver com validação de prompt e tradução opt-in somente para `/status`, `/plan` e `/review`. Sessões arbitrárias de terminal, missões encerradas e CLIs sem follow-up ficam indisponíveis. Verificação: typecheck passou; lint sem erros (**23 avisos herdados**); testes focados — **36 aprovados / 0 falhas**; suíte completa — **3.080 aprovados / 70 skips / 0 falhas**.
- Perfis estruturados de lançamento implementados (commit `ad68522`): o registro canônico agora traduz modelo, níveis suportados de reasoning e posturas explícitas de permissão por agente; overrides e perfis nomeados aceitam essas preferências além de variáveis de ambiente adicionais. O ambiente é validado antes do spawn — chaves reservadas `CATE_*` são bloqueadas, valores com NUL são rejeitados e há limite de entradas/tamanho. A resolução mantém argv fechado, injeta permissões antes do prompt quando o agente define posição conhecida e usa `strictUnsupported: false` no spawn de produção para ignorar preferência não suportada sem quebrar o lançamento. Verificação: typecheck limpo; lint sem erros (**23 avisos herdados**); testes focados passaram; suíte completa — **3.082 aprovados / 70 skips / 0 falhas**.

### Review — Fase 1 (auditoria de dependências nativas)

| Componente | Pacote | Estado no Windows | Risco | Observações |
|---|---|---|---|---|
| Electron | `electron@41.2.0` | ✅ binário presente (`node_modules/electron/dist/electron.exe`) | Baixo | `patch-electron-name.sh` roda no `postinstall` via Git Bash; só afeta macOS (PlistBuddy), no-op no Windows exceto chmod de binários POSIX. |
| PTY | `node-pty@^1.0.0` (devDep) | ✅ prebuild `win32-x64/pty.node` presente | Médio | Carregado lazy no daemon (`src/runtime/capabilities/process.ts:142`). Runtime tarball já contém prebuild por target (`scripts/build-runtime-tarball.mjs:stageNodePty`). Empacotado via `asarUnpack`. |
| Terminal render | `@xterm/addon-webgl@^0.18.0` | ✅ JS puro (WebGL via browser) | Baixo | Budget de contexts gerenciado por `src/main/webglBudget.ts`; fallback DOM renderer quando budget excedido. |
| Watcher | `@parcel/watcher@^2.5.1` + `@parcel/watcher-win32-x64` | ✅ prebuild presente | Baixo | Usado apenas no daemon (`src/runtime/capabilities/fileWatcher.ts:26`); externalizado no esbuild bundle. |
| Ripgrep | `@vscode/ripgrep@^1.18.0` + `ripgrep-win32-x64` | ✅ binário `rg.exe` (5.4 MB) | Baixo | Daemon resolve via sibling do node (`daemonRgPath()`); tarball local `dist-runtime/opencate-runtime-1.6.1-beta.2-win32-x64.tgz` presente (73 MB). |
| Runtime tarball | `opencate-runtime-1.6.1-beta.2-win32-x64` | ✅ buildado em `dist-runtime/` | Baixo | Instalação local em `~/.cate/runtime/<ver>/<target>` ainda não criada (será criada no primeiro `bun run dev` ou smoke test). |
| Sharp/WASM | `sharp@^0.35.3`, `pdfjs-dist`, `mammoth` | ⚠️ empacotados via `asarUnpack` mas não validados em runtime Windows | Médio | Não exercitados nesta auditoria estática; cobrir no smoke test manual (Fase 0). |

**Conclusão:** Nenhum bloqueador nativo para desenvolvimento Windows. Todos os prebuilds críticos presentes. Scripts shell (`postinstall`, `predev`) funcionam via Git Bash no Windows mas não são portáveis sem ele — risco documentado, correção adiada para o próximo item.

### Review — Fase 1 (scripts Windows)

Script `patch-electron-name` convertido de bash para Node.js (commit `7eacf7b`). Elimina dependência de Git Bash no Windows para `postinstall`/`predev`. Funcionalidades preservadas:

- chmod exec bit em `spawn-helper` e `rg` — agora condicionado a `process.platform !== 'win32'` (era no-op silencioso no bash também, mas explícito).
- Instalação do Electron se binário ausente — idêntica ao original.
- PlistBuddy no macOS — condicionado a `process.platform === 'darwin'`.

Verificação: script executado com sucesso no Windows (exit 0, Electron intacto), typecheck limpo, lint 0 erros / 23 avisos herdados.

Scripts shell restantes (`ci-mac-signing-keychain.sh`, `perf-sample.sh`) são específicos de CI/perf e não afetam o workflow de desenvolvimento no Windows.

### Review — Fase 1 (E2E mínimo)

Teste E2E `terminal-lifecycle.spec.ts` implementado (commit `c36b570`). Cobre a cadeia completa de persistência:

1. **Abrir projeto** — cria workspace em diretório temporário e passa pelo diálogo de trust real.
2. **Criar terminal** — via harness E2E (`createTerminal`) com posição explícita; valida que o nó aparece no canvas DOM.
3. **Redimensionar nó** — novo método no harness (`resizeNode`) chama a mesma store action do resize handle, sem depender de mouse sintético headless.
4. **Salvar/restaurar** — novo método `saveSessionNow()` dispara o autosave pipeline real (sessionSerialize → IPC → main process atomicWriteWithBak). O teste faz polling até os arquivos `.cate/workspace.json` + `.cate/session.json` existirem no disco.
5. **Verificação** — lê workspace.json do disco e confirma que a geometria redimensionada (`canvasNodes.<id>.size`) sobreviveu à serialização. Valida também session.json com version:1.

Descoberta durante implementação: a geometria dos nós vai em **workspace.json** (não session.json) sob `canvases.<canvasId>.canvasNodes`. Session carrega apenas metadados machine-local por painel.

### Review — Fase 1 (E2E multi-canvas + detach)

Teste E2E `multi-canvas-detach.spec.ts` implementado (commit `454e5e9`). Combina dois requisitos da Fase 1:

- Isolamento entre múltiplos canvases: terminal criado no canvas secundário não aparece no primário.
- Detach para nova janela via pipeline de produção (`movePanelToNewWindow`), não drag sintético — valida que a janela abre e o nó sai do canvas fonte.

Novo método no harness E2E: `detachPanel(panelId)` chama a função real usada pela sidebar. O teste cobre o caminho completo renderer → IPC → main → nova BrowserWindow.

### Review — Fase 1 (documentação de arquitetura)

Documento `docs/ARCHITECTURE.md` criado (commit `2044a6f`). Cobre:

- Modelo de processos: renderer / main / runtime daemon com diagrama ASCII.
- Justificativa para daemon separado (remoto SSH/WSL com mesmo tarball; isolamento de crash; ABI correto de node-pty).
- Tabela de categorias IPC com exemplos e direção (invoke vs broadcast).
- Persistência: diferença workspace.json vs session.json, ciclo autosave/flush-on-quit, backup `.bak`, multi-instância via lock por pid.
- Segurança: sandbox de filesystem com allowed roots + anti-symlink, hardening de webviews, agent hooks com HMAC per-terminal, secrets via safeStorage.
- Limites conhecidos documentados honestamente.
- Tabela de referência rápida para os módulos principais.

## Review — 2026-08-24 (Fase 4, item 1)

- Árvore viva de missões implementada como projeção pura em `agentTree.ts`: `CodingAgentRun` continua sendo a única fonte persistida de ownership e os relatórios cross-window continuam sendo a única fonte de painéis destacados. Snapshots locais do driver prevalecem sobre relatórios detached para o mesmo run id, evitando duplicação.
- O hook `useAgentTree` rederiva status local a cada segundo usando o mesmo caminho canônico do supervisor; o builder permanece puro e testável. A sidebar ganhou a seção "Missions", com supervisor, contagem, workers ordenados por criação, estado colorido/pulsante e métricas compactas (tokens, contexto restante, custo reportado/estimado e duração).
- Workers locais focam o painel correspondente; workers cross-window usam a ação "focus window panel". A ausência de dados não é mascarada: sem usage/contexto, o campo simplesmente não aparece. Teste de renderização cobre supervisor + worker na árvore real da sidebar.
- Verificação final: typecheck limpo; lint **0 erros / 23 avisos herdados**; testes focados **17 aprovados / 0 falhas**; suíte unitária completa **3.087 aprovados / 70 skips / 0 falhas**. Commit: `647d60e`.

## Review — 2026-08-25 (Fase 4, item 3)

- Menu contextual da seção Missions agora expõe ações dinâmicas por estado do worker: inspecionar saída recente, revisar changes, enviar follow-up, parar, aplicar à branch base, manter worktree e descartar worktree.
- Inspecionar e revisar abrem modais dedicados; follow-up tem entrada de prompt; ações destrutivas exigem confirmação explícita. Todas as operações passam pelo driver autoritativo via `handleCodingAgentMethod`, sem duplicar controle no renderer.
- Erros são normalizados para mensagens acionáveis e o teste da sidebar cobre inspeção, stop e apply, incluindo mocks dos métodos do driver e do review de worktree.
- O bug de teste foi corrigido na causa raiz: o mock `workspaceCreate` agora preserva o `id` recebido em vez de substituir o workspace real por um objeto sem identidade. O ambiente React Act foi configurado explicitamente no teste que monta a sidebar.
- Regra persistente sobre prevenção de loops foi reforçada no `AGENTS.md`: reutilizar evidências recentes, tratar atividade como diferente de progresso, sair imediatamente de investigação estagnada e não confundir leitura com gates.
- Verificação final: typecheck limpo; lint **0 erros / 23 avisos herdados**; suíte completa **3.095 aprovados / 70 skips / 0 falhas**. Commit: `0a59817`.

## Review — 2026-08-25 (Fase 4, item 4 — primeira versão)

- Contrato compartilhado `AgentContextItem` implementado com tipos explícitos (`note`, `terminal-selection`, `file`, `diff`, `artifact`), limites de fila e caracteres, deduplicação por ID, truncamento por item e formatação determinística para prompt.
- O composer global agora tem uma área "Explicit context": o usuário pode transformar o rascunho atual em nota ou escolher um artefato de texto. Os itens são exibidos como chips removíveis, concatenados ao prompt final e entregues apenas pelo caminho autoritativo de follow-up/broadcast.
- Nenhum scrollback ou estado global é compartilhado implicitamente. Seleção de terminal, arquivo de workspace e diff permanecem fora da UI até terem captura explícita; isso está registrado como próximo passo do mesmo item.
- Verificação: typecheck limpo; lint **0 erros / 23 avisos herdados**; testes focados **6 aprovados / 0 falhas**; suíte completa **3.099 aprovados / 70 skips**, com uma única suite de cleanup do daemon a falhar por timeout no Windows — o arquivo passou isolado em seguida. Commit: `089bf25`.

## Fase 1 — CONCLUÍDA ✅

Todos os 5 itens da Fase 1 finalizados. Suíte unitária completa: 3057 aprovados / 0 falhas / 70 skips. Typecheck e lint limpos (0 erros / 23 avisos herdados). Testes E2E individuais dos novos specs passaram; a suíte completa `test:e2e` travou em um spec pré-existente dependente de timing/GPU no Windows — não é regressão dos commits desta fase.

## Review — 2026-08-27 (organização estrutural e continuidade)

- O backlog e as lições operacionais foram movidos para dentro do repositório: `tasks/todo.md` e `tasks/lessons.md`. Esta é a fonte canônica para a próxima sessão ao abrir `C:\Users\gabri\Documents\cate`.
- A estrutura documental foi organizada com `docs/README.md`, `docs/PROJECT_STRUCTURE.md` e `docs/maintenance/hygiene-backlog.md`, sem mover módulos de código ou alterar comportamento.
- A análise comparativa foi trazida para `research/project-analysis.md`; o ADR deixou de apontar para o diretório externo obsoleto.
- `AGENTS.md` e `CLAUDE.md` agora apontam para `.codex/skills/karpathy-guidelines/SKILL.md` e distinguem desenvolvimento local com Bun da reprodução de CI com `npm ci`.
- Diretórios temporários `cate-exte2e-*` passaram a ser ignorados. A remoção física dos resíduos existentes foi bloqueada pelo executor e não foi forçada; nenhum arquivo de código foi apagado.
- Verificação: `bun run typecheck` aprovado; `bun run lint` aprovado com 0 erros e 23 avisos herdados; `src/main/ipc/ipcConformance.test.ts` aprovado com 5/5; `git diff --check` aprovado.
- **Próximo trabalho funcional:** implementar o contrato de tarefa em disco (objetivo, restrições, resultado validado, logs e artefatos), seguindo a ordem registrada no ponto de parada acima.

## Higienização de temporários do daemon — 2026-08-27 (concluída)

- [x] Confirmar que `cate-daemon-ws-*` são fixtures temporários do teste de subprocesso e não dados do produto.
- [x] Remover os diretórios residuais já confirmados, usando somente os caminhos exatos da raiz do projeto; 35 pastas foram enviadas para a Lixeira do Windows.
- [x] Fazer o teste criar workspaces em `os.tmpdir()` e ignorar também bundles interrompidos `cate-daemon-build-*`.
- [x] Rodar o teste focado e validar que a raiz do repositório não recebe novos `cate-daemon-ws-*`.
- [x] Verificar gates: teste focado `3 aprovados / 2 ignorados`, typecheck aprovado e lint aprovado com `0 erros / 23 avisos herdados`.

## Fechamento do TO-DO de higiene — 2026-08-27 (em andamento)

- [x] Formalizar o fluxo Bun/npm e a justificativa dos dois lockfiles em `docs/DEVELOPMENT.md`.
- [x] Consolidar a orientação comum de `AGENTS.md`, `CLAUDE.md` e `CONTRIBUTING.md` em `docs/ENGINEERING_GUIDELINES.md`.
- [x] Mapear e extrair responsabilidades independentes de `WorkspaceTab.tsx` e `src/preload/index.ts`, preservando contratos.
- [x] Criar smoke gate reproduzível para a inicialização do Electron (`bun run test:smoke:electron`).
- [x] Revisar fronteiras de `src/shared/types.ts` e usos de `any`; fronteiras sem tipo local seguro ficaram documentadas em `docs/maintenance/code-hygiene-audit.md`.
- [x] Auditar arquivos grandes, imports e comentários obsoletos sem reformatar o repositório inteiro; seams sensíveis ficaram documentados no relatório de higiene.
- [x] Configurar/validar CI explícita para typecheck, lint, testes, build e E2E por sistema operacional.
- [x] Rodar a matriz de validação e atualizar `docs/maintenance/hygiene-backlog.md` e este ponto de retomada.

## Review — 2026-08-29 (Fase 7, segurança e privacidade)

- Corrigido o boundary de VCS: add/add-from-PR/remove/status agora validam o destino do worktree no runtime antes de tocar filesystem ou Git; regressão focada passou (**7 aprovados / 3 skips**).
- Servidores de extensão server-backed passaram a herdar somente variáveis de ambiente de sistema allowlisted; chaves, `NODE_OPTIONS` e `SSH_AUTH_SOCK` não são propagados. Teste real do capability passou (**3/3**).
- Telemetria de uso e crash passou a exigir `telemetryEnabled` explícito, padrão `false`, com escolha no WelcomeDialog e General Settings. O feedback não transmite texto livre e buffers antigos são descartados sem consentimento.
- Verificação: analytics/WelcomeDialog/server **33 testes aprovados**, typecheck aprovado, `npm audit --omit=dev --audit-level=high` sem vulnerabilidades. Relatório: [`docs/SECURITY_AUDIT.md`](../docs/SECURITY_AUDIT.md).
- Pendências honestas: smoke empacotado/manual de webviews e CDP, host SSH/WSL real, threat model do CDP loopback, revisão da política/retention do Sentry e itens de produto (tmux, container, mobile/relay).

## Review — 2026-08-29 (concorrência, performance, smoke e runtime)

- Adicionado lock por workspace ao restore/reload/hydrate; chamadas concorrentes não
  intercalam teardown, painéis, canvases ou hints de terminal. Regressão cobre
  leitura única do snapshot durante hydrate concorrente.
- Adicionado contrato concorrente do capability de processos: 48 PTYs falsos
  criados, escritos, redimensionados, com saída e encerramento simultâneos, sem
  cross-routing; o teste passou.
- E2E live de resize passou no Windows com 24 nós, 12 montados, 144 FPS e 0 long
  tasks. Canvas dentro de canvas permanece explicitamente recusado pelo store e
  foi removido da promessa de recurso da documentação.
- O modo `bun run dev` iniciou Vite, Electron, preload/IPC e runtime local; o
  processo foi encerrado após a observação e as árvores Electron órfãs de E2E
  foram finalizadas pelos PIDs exatos.
- A tela `RuntimeDiagnosticsDialog` e seu teste foram adicionados ao overlay de
  runtime; o histórico não é persistido e não inclui saída de terminal.

## Review — 2026-08-29 (gates finais e ponto de retomada)

- Corrigidos os contratos de teste que ainda esperavam telemetria automática em
  builds empacotados e os escopos antigos da API de projetos.
- O mock de endpoint foi isolado do grafo lazy de imports; os testes de
  lifecycle receberam limites compatíveis com a execução serial.
- `LocalSubprocessTransport` agora compartilha uma parada idempotente entre
  `channel.kill()` e `dispose()` e aguarda o evento `close` antes de liberar o
  `node.exe`; o fixture do tarball usa retries de limpeza no Windows.
- Validação final: typecheck, lint, `git diff --check`, build, smoke Electron e
  **398 suítes / 3.245 testes aprovados / 7 suítes e 70 testes ignorados / 0
  falhas**.
- O worktree continua deliberadamente sem commit, preservando as alterações
  locais existentes. As únicas pendências do plano são validações em host/SO
  externo, decisões de produto/protocolo e o roteiro manual de release.

## Review — 2026-08-29 (higiene estrutural)

- `AGENTS.md`, `CLAUDE.md` e `CONTRIBUTING.md` agora apontam para a fonte
  comum `docs/ENGINEERING_GUIDELINES.md`; wrappers mantêm somente instruções
  específicas de agente ou de contribuição.
- O relatório `docs/maintenance/code-hygiene-audit.md` registra os maiores
  arquivos, os consumidores sensíveis de `src/shared/types.ts`, os `any` de
  fronteira e os seams seguros para uma próxima refatoração.
- Não houve reformatação ampla nem alteração mecânica de contratos; a revisão
  foi validada com `git diff --check`, e os gates de typecheck/lint/build/teste
  permanecem verdes conforme o review imediatamente anterior.

## Review — 2026-08-29 (durabilidade, containers, companion e RC)

- Durabilidade de terminal agora é opt-in por painel: tmux usa nome estável por
  workspace/painel, argv separado, close que destrói a sessão e shutdown que
  apenas desanexa o cliente. O WSL2 real confirmou que a sessão sobrevive à
  desconexão do cliente; macOS/Linux externo e restart do daemon empacotado
  continuam como validações manuais.
- O adaptador container Docker/Podman foi integrado ao RuntimeManager e à UI,
  com imagem declarada, mount único, root dentro do mount, `--pull never`,
  allowlist de ambiente e rede `none` por padrão. O daemon Docker deste host
  não respondeu, então o smoke de imagem real continua pendente.
- O companion v1 enumera leituras sem scrollback e restringe ações a métodos
  com aprovação host-minted one-shot. O relay self-hosted guarda apenas frames
  opacos, com token por digest, TTL e bind loopback; cliente mobile/web, pairing
  e criptografia E2E ainda não foram enviados.
- Foram adicionados [`docs/CONTAINER_RUNTIME.md`](../docs/CONTAINER_RUNTIME.md),
  [`docs/COMPANION_AND_RELAY.md`](../docs/COMPANION_AND_RELAY.md),
  [`docs/PRIVACY_DRAFT.md`](../docs/PRIVACY_DRAFT.md) e
  [`docs/RELEASE_CANDIDATE.md`](../docs/RELEASE_CANDIDATE.md). O DSN/retention,
  identidade do produto e assinatura do RC continuam dependendo de owners.
- Verificação: suíte serial **405/7 arquivos, 3.268/70 testes**, typecheck,
  lint, `build:runtime`, build Electron, smoke Electron, `npm audit` com **0
  vulnerabilidades** e `verify:hygiene` serial passaram; `git diff --check`
  permaneceu limpo. A primeira execução paralela de higiene falhou apenas em
  dois teardowns (`afterAll`/`EBUSY`) e deixou de reproduzir após a correção do
  gate.

## Review — 2026-08-30 (bridge de browser e companion seguro)

- O runner do `agent-browser` deixou de esperar o encerramento de um daemon
  persistente: agora lê a primeira resposta JSON em streaming, usa config sem
  newline inválido e namespace/sessão por processo. Isso elimina o timeout de
  28 s e colisões entre processos Electron.
- A automação de webviews embutidos passou a direcionar seletores CSS,
  teclado, reload/back/forward e ações DOM ao guest selecionado. A geometria do
  browser background espera a atualização de frame em vez de capturar o slot
  durante a troca de workspace; o worker CLI normaliza CRLF do `cmd.exe`.
  E2Es reais background + CLI passaram juntos (**2/2**); o primeiro conjunto
  teve um único flake de bootstrap do Electron e passou na repetição controlada.
- O companion ganhou P-256 ECDH + HKDF-SHA-256 + AES-256-GCM com AAD de
  metadados, cliente fetch no SDK (`CompanionClient`), `CompanionRelayResponder`
  host-side, prova de pairing e registro de dispositivos com código digest,
  limite de tentativas, read-only por padrão e revogação de sessão.
- Verificação incremental: typecheck, lint direcionado, build do SDK e
  **14 testes focados** do companion passaram; depois do endurecimento final do
  cache do cliente, os testes companion passaram novamente (**9/9**), e o gate
  `verify:hygiene` serial confirmou **412 arquivos / 3.280 testes aprovados / 6
  arquivos e 69 testes ignorados / 0 falhas**; com o tarball nativo presente, o
  teste de restart do daemon empacotado também passou.
- O runner dos testes live deixou de depender de atribuição de variável Unix:
  `test:ssh:loopback` e `test:agent-contracts` agora executam de forma
  cross-platform, sem shell concatenado. No Windows, o SSH loopback e os
  contratos de agentes foram iniciados corretamente e permaneceram skipped por
  ausência do ambiente POSIX/CLIs live.
- `npm run package:win` gerou localmente instalador NSIS, ZIP, blockmap e
  `latest.yml`; o smoke Electron também passou. Assinatura, publicação e
  sign-off cross-platform continuam deliberadamente separados.
- `npm run package:companion` gerou e inspecionou um tarball estático com
  `index.html`, manifest e assets relativos; o job Linux do release agora o
  inclui entre os assets publicados.
- Rechecagem do host: Docker falha porque o named pipe do Docker Desktop não
  existe, Podman e `sshd` não estão instalados, e as distribuições WSL estão
  paradas; portanto os smokes reais de container/SSH e a matriz POSIX continuam
  dependentes de outro ambiente.
- Permanecem abertos: hosting do companion web e wrappers mobile nativos com
  Keychain/Keystore; proxy TLS/rotação/reconnect real; macOS/Linux, SSH/WSL
  externo e Docker/Podman real; revisão de privacidade/DSN; identidade visual,
  sign-off e artefatos assinados do RC.

## Review — 2026-08-30 (reconnect do companion)

- O `CompanionClient` agora preserva status HTTP no erro de transporte e repete
  somente leituras transitórias do relay, com limite de três retries. Falhas de
  `POST` continuam sem retry automático, evitando duplicação de `tasks.update`
  ou `codingAgent.send` quando a resposta fica ambígua.
- O polling serializado trata a promessa de acompanhamento tanto no sucesso
  quanto na falha, sem deixar rejeições internas não tratadas. O teste de relay
  real injeta uma queda de rede na primeira leitura e confirma os dois comandos
  com exatamente dois `POST`s.
- Verificação incremental: relay responder **1/1**, conjunto companion/SDK **6
  arquivos / 10 testes**, typecheck, lint e `git diff --check` aprovados. O
  `verify:hygiene` serial completo foi repetido com exit code 0, mantendo
  **412 arquivos / 3.280 testes aprovados / 6 arquivos e 69 testes ignorados /
  0 falhas**. Deployment TLS, rotação e validação em rede não-loopback
  continuam pendentes. O smoke `test:companion:web` também passou de forma
  autocontida, com build e preview gerenciados pelo próprio script.

## Ponto exato de parada — 2026-08-30

- **Implementação local:** concluída para todas as pendências que não exigem
  escolha de produto ou infraestrutura externa. O companion tem protocolo,
  pairing, cripto E2E, UI/QR desktop, web app, asset de release, smoke
  autocontido e reconnect de leitura bounded sem retry de `POST`.
- **Estado validado:** `verify:hygiene` passou em **412 arquivos / 3.280 testes
  aprovados / 6 arquivos e 69 testes ignorados / 0 falhas**; o smoke web, o
  relay real, o restart do daemon empacotado, typecheck, lint e `git diff
  --check` também passaram.
- **Próxima ação autorizável:** escolher owner/valores de identidade e política
  pública; depois fornecer host POSIX/SSH/Docker e deployment TLS para executar
  as validações externas. Não transformar ausência de host, secrets ou sign-off
  em checkbox verde.

## Review - 2026-08-30 (smoke Docker real)

- O Docker Desktop ficou disponivel neste host durante a retomada e respondeu
  com daemon `29.1.5`; containers existentes do usuario foram preservados.
- O tarball `linux-x64` foi reconstruido com `--docker`, a imagem
  `opencate-runtime-smoke` foi criada a partir do Dockerfile versionado e o E2E
  real passou em 2/2 cenários: handshake, leitura/escrita no workspace, mount
  somente leitura com escrita recusada e boundary de `/workspace` confirmados.
- A validacao agora e reproduzivel com `npm run test:container:runtime`, que
  remove a imagem temporaria ao final. O smoke real de Podman, hosts SSH/WSL
  externos, macOS/Linux nativo e deployment TLS continuam condicionados a
  infraestrutura/autoridade externa.
- O gate `verify:hygiene` foi repetido depois dessas mudancas e terminou com
  exit code 0; a imagem fixa criada durante a investigacao tambem foi removida
  explicitamente, deixando apenas os artefatos versionados e a arvore de
  trabalho existente.
- O comando `npm run test:ssh:loopback` terminou com exit code 0, mas registrou
  1 teste skipped porque o host ainda nao oferece `sshd`; isso mantem a
  pendencia de reconexao SSH/WSL real corretamente aberta.

## Ponto exato de parada - 2026-08-30 (apos smoke Docker)

- Implementacao local sem dependencia externa continua concluida; o smoke
  containerizado Docker agora tambem esta certificado neste host.
- Permanecem pendentes somente validacoes ou decisoes externas: Podman/hosts
  POSIX adicionais, SSH externo, relay/TLS implantado, hosting e
  wrappers nativos do companion, politica publica/retention, identidade visual,
  sign-off e artefatos assinados do RC.

## Review - 2026-08-30 (WSL2 real e empacotamento POSIX)

- A causa raiz do `WSL extract failed` foi o tarball Linux criado no Windows sem
  bits POSIX de execucao: `runtime/bin/node` era extraido como nao executavel.
  `build-runtime-tarball.mjs` agora normaliza os headers tar das entradas
  executaveis explicitas (`node`, `rg`, `cate` e `node-pty/spawn-helper`) antes
  do rename atomico; o artefato verificado no Ubuntu mostra `-rwxr-xr-x`.
- O E2E IPC WSL passou **5/5 testes**: CONNECT, distro desconhecida, INSTALL,
  ENSURE com reconexao mantida e DELETE. O teste Linux hermetico de SSH dentro
  do Ubuntu WSL tambem passou **1/1**; `test:ssh:loopback` no processo Windows
  continua corretamente skipped por `process.platform === win32`.
- Para habilitar esse teste Linux, `openssh-server` foi instalado na distro
  Ubuntu WSL; nenhum listener foi exposto fora do WSL nem iniciado como serviço
  público.
- Regressões focadas passaram **7/7** (`wslTransport` e `containerTransport`),
  alem de typecheck, lint e `git diff --check`. O smoke Docker passou **2/2**
  novamente com o mesmo tarball e removeu a imagem temporaria.
- O gate amplo `npm run verify:hygiene` terminou com exit code 0 após a correção;
  não restou tarball parcial, imagem smoke temporária ou instalação runtime no
  WSL do cenário de teste.
- O proximo ponto exato continua sendo externo: host SSH fora do WSL,
  macOS/Linux nativo, Podman, deployment TLS, wrappers/hosting do companion,
  privacidade publica, identidade visual, sign-off e artefatos assinados.

## Review - 2026-08-31 (foco, teardown e suite E2E final)

- A corrida de foco entre paineis foi corrigida no produto: ao mudar o painel
  ativo, o retry agendado do painel anterior e cancelado imediatamente. Isso
  impede que um tick atrasado roube o foco do painel que o usuario acabou de
  selecionar.
- O harness E2E para BrowserWindow oculto ganhou helpers deterministas para
  drag de canvas e foco de terminais. O seletor `data-node-drag-spacer` evita
  confundir arraste de no com arraste de aba; os handlers reais de captura,
  bubble e ciclo de drag continuam sendo exercitados.
- O teardown ficou bounded e observavel: helpers `conpty_console_list_agent`
  sao rastreados no fork, aguardados durante a saida dos PTYs e drenados ou
  encerrados dentro de uma janela curta; o teardown do daemon agora e retornado
  ao lifecycle, que aguarda a mesma promessa antes do hard exit. O fixture
  tambem fecha com seguranca falhas durante o boot e encerra o servico esbuild
  apos gerar o CLI.
- A suite E2E completa passou com **58 testes aprovados e 1 skip condicional**
  em 10,2 minutos. O skip permanece o cenario de encaixar um painel canvas em
  um mini-dock de canvas, quando a capacidade nao esta disponivel. A auditoria
  posterior encontrou **0** Electron do openCate, **0** daemons runtime, **0**
  agentes ConPTY, **0** workers Playwright e **0** launchers E2E reais.
- Gates locais finais passaram: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run build:runtime`, `npm run runtime:tarball`,
  `npm run verify:hygiene` e `git diff --check`. O tarball win32 foi regenerado
  em 2026-08-31 e conferido com `runtime.cjs`, Node win32 e os binarios ConPTY.
- Nenhum commit ou push foi feito. As alteracoes e o worktree preexistente
  continuam preservados para o proximo owner/revisor.

## Ponto exato de parada - 2026-08-31

- A implementacao local e a validacao que nao exigem nova autoridade ou
  infraestrutura externa estao concluidas, incluindo foco/copia de terminais,
  teardown ConPTY, drag E2E, companion web/desktop e os gates locais acima.
- Permanecem abertos, sem marcar checkbox verde: nome/identidade visual e
  metadados de empacotamento; medicao live de desempenho em macOS/Linux;
  validacao em host SSH externo, macOS/Linux nativo e Podman; deployment,
  proxy TLS autenticado, rotacao e reconnect reais; hosting do companion e
  wrappers mobile nativos; politica publica de privacidade/DSN; sign-off e
  artefatos assinados do release candidate.

## Review - 2026-09-01 (seguranca webview/CDP e fechamento local)

- A auditoria de seguranca foi consolidada em `docs/SECURITY_AUDIT.md`.
  Nao foram inventadas garantias para superficies que ainda dependem de host,
  empacotamento, infraestrutura ou decisao do produto.
- Foi corrigido o controle de popup do BrowserPanel: conteudo remoto so pode
  abrir `http:`, `https:` ou `about:blank`; `file:` e `data:` sao recusados.
  O teste focado passou **6/6** e os E2Es reais de browser/CDP passaram **2/2**.
- Foi corrigido o ambiente herdado do processo nativo `agent-browser` usando a
  allowlist de processos de terceiros. Credenciais, tokens, `NODE_OPTIONS` e
  `SSH_AUTH_SOCK` nao sao propagados; o teste focado de seguranca passou junto
  com **24/24** testes dos tres arquivos envolvidos.
- Depois das correcoes, `npm run build`, `verify:hygiene` e o empacotamento
  Windows terminaram com exit code 0. O smoke Electron e a auditoria de
  processos tambem ficaram limpos; nao ha orfaos openCate/E2E/runtime/hygiene.
- O release local atual permanece consistente: `openCate-Setup-1.6.1-beta.2.exe`,
  blockmap, ZIP e `latest.yml`; o hash/tamanho do instalador conferem com o
  manifesto e o ZIP contem `openCate.exe`, `resources/app.asar` e
  `resources/runtime-host.tgz`.
- Permanecem abertos somente itens que nao podem ser declarados concluídos
  neste Windows sem autorização/recursos adicionais: identidade do produto,
  macOS/Linux nativos, host SSH externo, Podman/Docker daemon, deployment/TLS,
  hosting e wrappers nativos do companion, revisão pública de privacidade/DSN,
  sign-off cross-platform e artefatos assinados.

## Review - 2026-09-01 (invariantes de docking e regressao completa)

- A auditoria encontrou cinco falhas esperadas que ainda eram implementacao
  local: uma no restore de janela destacada e quatro no dock store. O restore
  agora poda referencias de paineis ausentes; o store evita duplicacao entre
  zonas, nao perde paineis com alvo stale, faz fallback de split e limita
  `activeIndex`/indices de insercao.
- Os antigos `it.fails` foram convertidos em regressao normal: restore de dock
  **10/10**, dock store **43/43** e modulos relacionados **26/26**.
- A matriz E2E completa passou **73/73**, com **4 skips esperados**; `build`,
  typecheck, lint, `verify:hygiene`, smoke Electron e `git diff --check`
  tambem passaram. A auditoria posterior confirmou zero processos
  openCate/E2E/runtime/hygiene orfaos.
- O pacote Windows foi regenerado apos a correcao: `openCate-Setup-1.6.1-beta.2`
  continua alinhado ao `latest.yml`, com hash/tamanho conferidos e sem os
  artefatos antigos com espacos.
- Os gates complementares `build:sdk`, `build:runtime` e `npm audit
  --omit=dev --audit-level=high` tambem passaram; o audit reportou 0
  vulnerabilidades.
- A busca de marcadores de trabalho local nao encontrou mais `it.fails`,
  `TODO`, `FIXME` ou `XXX` em codigo. Permanecem apenas validacoes manuais,
  decisoes de identidade e dependencias de outros hosts/servicos.

## Review - 2026-09-01 (activeIndex e gates apos retomada)

- A revisao adicional encontrou e corrigiu tres invariantes de selecao que
  ainda podiam mudar a aba ativa silenciosamente: remocao/movimento de uma
  aba anterior a ativa e insercao de aba em background antes da ativa.
- Os novos testes elevaram o `dockStore` para **46/46**; o bloco combinado de
  docking e restauracao passou **68/68**. Os E2Es afetados por drag, split,
  detach e search passaram **16/16**.
- Apos a alteracao, `typecheck`, lint direcionado, `build`, `build:companion`,
  smoke Electron, `build:sdk` e `build:runtime` passaram. O `npm audit
  --omit=dev --audit-level=high` continua com 0 vulnerabilidades conforme a
  validacao anterior.
- O pacote Windows foi regenerado a partir desses artefatos: instalador,
  ZIP, blockmap e `latest.yml` existem; o SHA-512 e o tamanho do instalador
  conferem com o manifesto (`595886671` bytes).
- Duas observacoes iniciais da execucao serial foram interrompidas enquanto
  o Vitest ainda processava os 412 arquivos; a execucao diagnostica com
  `hanging-process` terminou com exit 0 e a repeticao oficial de
  `verify:hygiene` tambem terminou com exit 0. Os processos filhos foram
  auditados depois, sem sobras openCate/E2E/runtime.
- A regressao de compatibilidade da persistencia/migracao passou **57/57**:
  arquivo ausente/corrompido, edicao externa, lock orfao, fallback atomic e
  round-trip separado de `workspace.json`/`session.json`.
- A distribuicao local do companion web agora inclui manifest PWA, icone openCate
  e service worker com cache seguro do app shell; o smoke confirmou pairing,
  persistencia IndexedDB e reload offline, e o tarball contem esses artefatos.

## Review - 2026-09-01 (companion PWA e asset distribuido)

- O companion web passou a ter manifest instalavel, escopo PWA, metadata,
  icone openCate e service worker. O worker cacheia apenas navegacao e ativos
  estaticos, aguarda a gravacao no cache e nunca persiste respostas dinamicas
  do relay.
- O smoke `test:companion:web` confirmou pairing, identidade IndexedDB,
  registro/controle do service worker e reload offline; `typecheck`, lint e
  `verify:hygiene` passaram depois da alteracao.
- O tarball `release/opencate-companion-web-1.6.1-beta.2.tgz` foi regenerado e
  contem `index.html`, `manifest.webmanifest`, `opencate-logo.svg`, `sw.js` e os
  bundles versionados.

## Review - 2026-09-01 (integridade do pacote companion)

- `scripts/package-companion.mjs` agora valida antes do tarball o manifesto PWA,
  o service worker, o icone e os arquivos obrigatorios; depois do `tar` tambem
  inspeciona o arquivo final para garantir que os mesmos artefatos chegaram ao
  pacote distribuivel.
- Verificacao: build companion, `package:companion`, smoke browser offline,
  typecheck, lint e `git diff --check` passaram; o tarball versionado foi
  regenerado com os bundles e assets PWA esperados.
- O CI Linux agora executa `package:companion` depois do build web, mantendo a
  mesma validação do artefato ativa em PRs/pushes e no workflow de release.
- A reauditoria do host confirmou cliente Docker sem daemon, ausência de Podman,
  WSL Ubuntu parado e nenhum host SSH externo ou macOS/Linux nativo disponível;
essas validações continuam abertas sem marcar caixas por inferência.

## Review - 2026-09-01 (fixture live de proxy TLS)

- O teste opt-in `test:companion:proxy` inicia relay e Caddy temporários, usa
  TLS interno com CA confiada somente pelo cliente de teste, autenticação de
  header, reload com rotação de token e restart do proxy antes de repetir o
  round-trip criptografado.
- O cenário passou **1/1** no Caddy real disponível neste host. Durante a
  validação foi corrigido o rastreamento de polling do `CompanionRelayResponder`:
  rejeições de rede agora limpam a promessa interna sem gerar unhandled
  rejections, preservando o erro para o chamador.
- O fixture não encerra a pendência de deployment público: continuam necessários
  certificado/credenciais operacionais, rede não-loopback, reconnect externo e
  revisão do operador.

## Ponto exato de parada - 2026-09-01

- O código local, os testes disponíveis e os artefatos Windows estão em estado
  verificável após as remediações de segurança descritas acima.
- O objetivo geral continua aberto por dependências externas e decisões ainda
  não fornecidas; nenhum desses itens foi marcado como concluído por inferência.

## Review - 2026-08-31 (profiler de monitoramento e gates finais)

- A metrica de performance foi separada corretamente: `subprocess spawns/s`
  continua representando forks observados pelo profiler, enquanto
  `monitorWorkPerSec` representa trabalho logico do process monitor, inclusive
  scans hospedados no daemon e scans baseados em `/proc` que nao criam filho.
  O HUD e o E2E agora exibem/medem o campo apropriado.
- A primeira repeticao completa do profiler falhou em cascata porque o Electron
  carregou `dist` anterior a mudanca e `monitorWorkPerSec` ainda nao existia no
  snapshot. Depois de `npm run build`, o teste isolado passou **1/1** e a
  bateria completa passou **12/12**, com **1 skip esperado no Windows** para o
  cenario de cadencia em background POSIX-only; duracao total **55,5 s**.
- A bateria tambem confirmou os cenarios opt-in de **50+ terminais** e resize
  concorrente. O cenario de 50+ reportou 144 FPS, 0 long tasks e 21 nos
  montados; resize reportou 144 FPS, 0 long tasks e 16 nos montados.
- Apos essa execucao, a auditoria encontrou **0** Electron/daemon runtime,
  agentes ConPTY, workers Playwright ou launchers E2E orfaos. `typecheck`,
  `lint` e `npm test -- --no-file-parallelism` passaram; o teste unitario
  completo terminou com exit code 0.
- O pacote Windows foi regenerado depois do build atual: NSIS, ZIP, blockmap e
  `latest.yml` foram produzidos; o ZIP contem `openCate.exe`, `resources/app.asar`
  e `resources/runtime-host.tgz`, e o SHA-512 do instalador confere com o
  digest publicado em `latest.yml`. O smoke Electron tambem passou.
- A consistencia do updater foi corrigida em `electron-builder.yml`: o nome
  explicito `openCate-Setup-${version}.${ext}` evita que o arquivo fisico use
  espacos enquanto `latest.yml` aponta para a variante segura com hifens. O
  pacote foi regenerado e os tres artefatos antigos incompatíveis foram
  removidos do diretorio `release`; eles sao regeneraveis pelo mesmo comando.
- A revisao de seguranca encontrou e corrigiu a allowlist compartilhada de
  popups `file:`/`data:` do BrowserPanel; popups agora aceitam somente HTTP(S)
  ou `about:blank`. O teste focado passou 6/6 e os E2Es reais de browser/CDP
  passaram 2/2 em 2026-09-01. A navegacao explicita `file:`/`data:` continua
  disponivel no painel e a revisao manual empacotada permanece aberta.
- A mesma revisao isolou o ambiente do processo nativo `agent-browser`: a
  allowlist remove credenciais, tokens, `NODE_OPTIONS` e `SSH_AUTH_SOCK`, com
  teste focado incluido; o E2E real de browser/CDP continuou passando 2/2.
- A tentativa atual de `npm run test:container:runtime` permanece bloqueada
  apenas por ambiente: o cliente Docker existe, mas o daemon/pipe
  `dockerDesktopLinuxEngine` nao esta disponivel. A ultima validacao real de
  Docker registrada anteriormente continua preservada; nao foi marcado novo
  checkbox por causa dessa indisponibilidade.

## Ponto exato de parada - 2026-08-31 (apos profiler)

- Implementacao e gates locais sem dependencia externa continuam concluidos;
  o bundle atual foi recompilado e a medicao de performance agora tem contrato
  coerente entre fonte, Electron e E2E.
- Nenhum requisito externo foi inferido como concluido. Restam as decisoes de
  identidade, benchmarks nativos macOS/Linux, host SSH externo, Podman,
  deployment/TLS/rotacao/reconnect, hosting e wrappers do companion, revisao
  publica de privacidade/DSN, sign-off e artefatos assinados do RC.

## Review - 2026-09-01 (smoke empacotado de consentimento)

- Foi adicionado `test:smoke:telemetry`, que inicia o executável Windows
  unpacked com dois perfis temporários e captura o tráfego em um coletor HTTP
  loopback. O endpoint de teste só pode substituir produção quando
  `CATE_SMOKE_TEST=1` e aponta para `127.0.0.1`/`::1`.
- A execução real passou: telemetria desligada produziu **0 requests**;
  telemetria ligada produziu **2 requests**, incluindo `app_start`.
- A regressão focada de analytics + boundary de worktree passou **28/28**;
  typecheck, lint e empacotamento Windows unpacked também passaram.
- O workflow de release Windows agora executa esse smoke após empacotar. A
  política pública, DSN/Sentry, retenção e alternância durante a mesma sessão
  continuam como revisão humana/operacional, sem fechamento por inferência.

## Review - 2026-09-01 (boundaries de segredo e estado local)

- `verify:repository-boundaries` passou sobre **1125 arquivos rastreados** sem
  encontrar `.env`, chaves/certificados privados, credenciais, estado `.cate`
  ou arquivos machine-local proibidos.
- O scanner também procura assinaturas de segredo de alta confiança. Um header
  de chave SSH deliberadamente inválido em teste foi classificado como fixture;
  a regra foi estreitada para exigir corpo base64 plausível, sem ignorar testes.
- O gate agora roda na matriz de CI. O item de confirmar segredos e estado local
  fora do commit foi fechado; provisionamento e permissões dos secrets reais de
  assinatura continuam pendentes no ambiente do GitHub.

## Plano de retomada - 2026-09-02 (smoke empacotado de migração/restore)

- [x] adicionar smoke opt-in de round-trip no executável empacotado, usando
      perfil e projeto temporários;
- [x] verificar que o app grava/restaura `workspace.json` e `session.json` sem
      alterar as versões de schema;
- [x] verificar encerramento do app e ausência de processos openCate/daemon órfãos;
- [x] executar typecheck, lint, smoke focado e atualizar o RC com a evidência;
- [ ] manter pendentes as validações manuais de instalador, macOS/Linux, SSH
      externo, Podman, deployment público e sign-off.

## Review - 2026-09-02 (round-trip empacotado de sessão)

- `test:smoke:packaged-restore` passou contra `release/win-unpacked/openCate.exe`:
  criou um terminal, redimensionou para **677x423**, salvou os dois arquivos
  `.cate`, encerrou o primeiro processo, reabriu o mesmo perfil e confirmou a
  geometria restaurada no segundo processo.
- A auditoria pós-execução não encontrou `openCate.exe`, `cate-runtime`, Electron
  ou Node residual associado ao pacote. O workflow de release Windows agora
  executa o smoke após o empacotamento.
- O smoke comprova round-trip no Windows empacotado; não fecha migração manual,
  instalador NSIS, plataformas macOS/Linux ou os hosts externos.
## Plano de retomada - 2026-09-02 (bridge de telemetria)
- [x] localizar o caminho existente de configuração e envio de telemetria, sem
      ampliar a superfície IPC sem necessidade;
- [x] estender o smoke opt-in para validar o toggle na mesma sessão, usando
      apenas o bridge já exposto e um endpoint loopback;
- [x] executar apenas a validação focada necessária e documentar o resultado.

## Review - 2026-09-02 (toggle empacotado de telemetria)

- `test:smoke:telemetry` passou novamente contra o `release/win-unpacked/openCate.exe`:
  o perfil sem consentimento produziu **0 requests**, o perfil com consentimento
  produziu **3 requests** incluindo `app_start`, e a mesma sessão alternou para
  opt-in/opt-out via `settingsSet` sem emitir o evento após o opt-out.
- O override loopback agora é permitido também pelo modo dedicado
  `CATE_TELEMETRY_SMOKE=1`; continua recusado fora dos modos de smoke e para
  endpoints que não sejam HTTP loopback.
- Permanecem abertas apenas as validações humanas/operacionais já listadas:
  instalador e plataformas macOS/Linux, SSH externo, Podman, deployment público,
  política/DSN/retenção e sign-off do release.

## Plano de retomada - 2026-09-02 (cobertura cross-platform de performance)

- [x] adicionar ao CI um passo de performance live em macOS e Linux, usando o
      runtime nativo do runner e `CATE_PERF_50=1`;
- [x] documentar que o passo valida os cenários de 50+ PTYs, resize e território
      com os thresholds já existentes, sem transformar o resultado em medição
      local do Windows;
- [x] validar sintaxe/configuração do workflow e registrar o estado da execução
      local; manter o requisito aberto até haver runs verdes nesses hosts.

## Review - 2026-09-02 (gate cross-platform de performance)

- O CI agora agenda, no job E2E, os specs `perf-stress` e
  `worktree-territory-perf` em macOS e Linux com `CATE_PERF_50=1`; o runtime
  tarball e o app são construídos nativamente no mesmo runner antes da medição.
- A sintaxe YAML passou pelo parser `yaml` local e o comando Playwright listou
  os **18 cenários** esperados. O requisito de produto permanece aberto até um
  run verde real em cada host, pois os números dependem do hardware do runner.

## Plano de retomada - 2026-09-02 (metadados de release)

- [x] criar um verificador bounded de `latest*.yml` que confira existência,
      tamanho e SHA-512 dos artefatos listados dentro de `release/`;
- [x] executar o verificador após cada empacotamento no workflow de release;
- [x] validar o artefato Windows atual, documentar a evidência e manter abertas
      as partes que exigem secrets de assinatura e publicação GitHub.

## Review - 2026-09-02 (metadados e checksums de release)

- `npm run verify:release-metadata` passou no artefato Windows atual:
  **1 metadata file / 1 artifact entry**, com versão, tamanho e SHA-512
  conferidos contra `package.json` e `release/latest.yml`.
- O workflow de release roda o mesmo verificador após cada empacotamento de
  Windows, macOS e Linux. Isso fecha a checagem local de integridade; assinatura,
  notarização, upload/canal beta-stable e rollback continuam operacionais.

## Plano de retomada - 2026-09-02 (runbook do relay público)

- [x] adicionar um `Caddyfile.example` sem segredos reais para servir o companion
      web e proxyar `/health`/`/v1/*` por TLS para o relay loopback, preservando o
      bearer efêmero por canal como autenticação do relay;
- [x] documentar TLS automático, limites de exposição e rotação por reload;
- [x] validar a configuração com o binário Caddy local e manter pendentes o
      domínio, certificado operacional, deployment e reconnect em rede pública.

## Review - 2026-09-02 (runbook do relay)

- `deploy/companion/Caddyfile.example` foi criado sem segredo real: serve o
  companion estático, termina HTTPS, encaminha somente `/health` e `/v1/*` para
  o relay loopback e preserva o bearer efêmero por canal.
- `CATE_RELAY_CORS_ORIGIN` passou a ser aceito pelo launcher e validado como
  origem HTTP(S) única; o teste do relay passou **3/3** e o proxy Caddy live
  passou **1/1** com TLS, rotação, reinício e round-trip criptografado.
- `caddy validate --adapter caddyfile` passou localmente. Domínio/certificado
  ACME, deployment não-loopback e reconnect operacional continuam pendentes.
- Após a mudança, typecheck, lint e `verify:hygiene` passaram; o último gate
  terminou com exit 0.

## Plano de retomada - 2026-09-02 (artefato Windows final)

- [x] reconstruir `release/win-unpacked` a partir do código atual;
- [x] repetir integridade de metadata, smoke de telemetria e round-trip de
      restore contra o artefato reconstruído;
- [x] auditar processos residuais e registrar o resultado final.

## Review - 2026-09-02 (artefato Windows final)

- `npm run package:win` reconstruiu o artefato com o código atual e terminou
  com exit 0.
- `npm run verify:release-metadata` passou (**1 metadata file / 1 artifact
  entry**); `test:smoke:telemetry` passou com 0 requests sem opt-in, 3 com
  opt-in e toggle same-session; `test:smoke:packaged-restore` passou salvando e
  restaurando a geometria **677x423**.
- A auditoria pós-smoke não encontrou `openCate.exe`, `cate-runtime`, Electron ou
  Node residual associado ao pacote.

## Plano de retomada - 2026-09-02 (BrowserPanel local)

- [x] adicionar E2E do BrowserPanel com um arquivo `file:` temporário e conteúdo
      conhecido;
- [x] adicionar smoke HTTP loopback para a allowlist de navegação do guest;
- [x] confirmar carregamento via agent-browser/CDP e limpeza do arquivo/processo;
- [x] atualizar o RC/security com a cobertura local, mantendo manualmente abertas
      navegação externa, popups OAuth e extensão server-backed.

## Review - 2026-09-02 (BrowserPanel local)

- `npm run test:e2e -- e2e/browser-background-automation.spec.ts` passou 3/3:
  o guest real cobriu data URL, HTTP loopback e fixture `file:`; os snapshots
  via agent-browser/CDP encontraram os marcadores esperados e as URLs foram
  confirmadas.
- `src/main/webSecurity.test.ts` passou 6/6, incluindo popup HTTPS permitido,
  esquemas inseguros bloqueados e popups recusados em extension webviews.
- O `afterEach` encerrou o app e removeu o diretório temporário; a auditoria
  posterior não encontrou processos openCate/Electron residuais.
- A cobertura local reduz o escopo manual, mas não fecha navegação externa,
  popups OAuth ou extensão server-backed real.
- A primeira execução de `npm run verify:hygiene` após este spec ficou
  inconclusiva no estágio Vitest serial, sem saída ou erro por vários minutos;
  foi interrompida e a árvore de processos do runner foi limpa. A repetição
  acompanhada terminou com exit 0, registrada no review abaixo.

## Plano de retomada - 2026-09-02 (gate Vitest inconclusivo)

- [x] identificar a fase que parecia aguardar: a suíte Vitest serial de mais de
      200 specs de runtime, servidores e UI; o processo permaneceu ativo e a
      saída foi apenas consolidada ao término pelo runner.
- [x] confirmar que não havia falha no escopo do repositório; a repetição
      terminou com exit 0, sem alterar o gate para mascarar a espera.
- [x] repetir os gates necessários e atualizar o review com resultado terminal
      e limpeza de processos.

## Plano de retomada - 2026-09-02 (smoke Podman)

- [x] parametrizar o smoke de container para Docker ou Podman;
- [x] propagar o engine para o itest real e adicionar o job Podman no CI Linux;
- [x] validar syntax/gates locais e registrar que o Podman ainda depende do CI
      ou de um engine instalado neste host.

## Review - 2026-09-02 (smoke Docker/Podman)

- O smoke Docker local passou com Docker Desktop 4.58.0 / Engine 29.1.5:
  tarball, imagem real e itest do transporte passaram em 2/2 cenários; a
  imagem temporária foi removida.
- `npm test -- src/main/runtime/transports/containerTransport.test.ts`,
  `npm run typecheck`, `npm run lint`, `node --check` do verificador,
  parsing de `package.json`/CI YAML e `git diff --check` passaram.
- O gate final `npm run verify:hygiene` também passou com exit 0, incluindo a
  suíte serial, build e as verificações de higiene do repositório.
- O workflow agora instala Podman e exercita Docker/Podman em uma matriz Linux.
  Podman não foi executado neste host Windows; a certificação final permanece
  dependente de um runner Linux ou de um engine Podman instalado.

## Plano de retomada - 2026-09-02 (snapshot v1 legado)

- [x] criar fixture literal do formato v1 anterior aos metadados opcionais;
- [x] provar restore de painel, canvas e caminho relativo sem dados machine-local;
- [x] executar o teste focado e atualizar o RC com o escopo real da cobertura.

## Review - 2026-09-02 (snapshot v1 legado)

- `npm test -- src/renderer/lib/workspace/sessionSerialize.roundTrip.test.ts`
  passou 16/16, incluindo a fixture v1 sem `starred`, `tags`, `accentColor` ou
  `stashed`; painel, canvas e caminho relativo foram restaurados.
- O teste confirma compatibilidade com o formato v1 existente; não inventa nem
  promete migração de uma versão anterior que o repositório nunca definiu.

## Plano de retomada - 2026-09-02 (auditoria de telemetria)

- [x] localizar campos de analytics/Sentry que ainda possam carregar URL,
      caminho ou dados livres;
- [x] corrigir somente os campos comprovadamente fora da politica e adicionar
      regressoes de redacao/consentimento;
- [x] executar testes focados e gates proporcionais, documentando a cobertura
      automatizada sem fechar as decisoes que dependem do owner.

## Review - 2026-09-02 (auditoria de telemetria)

- `src/main/analytics.ts` agora aceita somente rotulos/chaves bounded nos canais
  IPC de promo/uso; URLs, caminhos e texto livre nao chegam aos payloads.
- `src/main/sentryPrivacy.ts` redige URLs/caminhos home em todos os campos de
  evento e descarta objetos nao serializaveis em vez de reverter ao evento cru.
- `npm test -- src/main/analytics.test.ts src/main/sentryPrivacy.test.ts`
  passou **34/34**; typecheck, lint e `git diff --check` passaram apos a
  atualizacao desta documentacao.
- `npm run verify:hygiene` foi repetido no checkout final e terminou com exit 0,
  incluindo typecheck, lint, Vitest serial e builds.
- Revisao do owner, retencao/DSN e observacao manual de logs/breadcrumbs
  continuam pendentes.

## Plano de retomada - 2026-09-02 (smoke empacotado apos redacao)

- [x] reconstruir o pacote Windows com a sanitizacao de analytics/Sentry atual;
- [x] repetir metadata e smoke de telemetria sem contato com o coletor externo;
- [x] auditar a saida e registrar o resultado, mantendo abertas as validacoes
      de instalador, outras plataformas e servicos externos.

## Review - 2026-09-02 (smoke empacotado apos redacao)

- `npm run package:win` reconstruiu `release/win-unpacked` com o codigo atual e
  terminou com exit 0; o verificador de metadata passou com 1 arquivo e 1
  entrada de artefato.
- `npm run test:smoke:telemetry` passou com 0 requests sem opt-in, 3 apos
  opt-in e toggle same-session; `test:smoke:packaged-restore` passou
  restaurando 677x423; `test:smoke:electron` terminou com exit 0.
- A auditoria posterior nao encontrou openCate/Electron/daemon/processos de smoke
  residuais. Instaladores de outras plataformas, deployment externo e
  assinatura continuam pendentes.
- A checagem read-only em Ubuntu WSL confirmou que `podman` nao esta instalado;
  a validacao Podman continua corretamente delegada ao runner Linux da CI.

## Plano de retomada - 2026-09-02 (falha de imagem do container)

- [x] adicionar ao smoke live uma imagem temporaria que deve falhar sem pull;
- [x] cobrir no teste unitario a mensagem de imagem sem runtime;
- [x] executar o smoke Docker e atualizar RC/docs sem fechar o requisito Podman.

## Review - 2026-09-03 (falha de imagem do container)

- `src/main/runtime/transports/containerTransport.test.ts` passou 4/4,
  incluindo o erro acionavel de bootstrap para imagem sem runtime.
- `npm run test:container:runtime` passou contra Docker Desktop 4.58.0 /
  Engine 29.1.5: a imagem inexistente falhou com `code 125` e `--pull never`,
  depois o smoke real passou 2/2 com rede `none`, mount somente leitura e
  boundary de caminho; a imagem temporaria foi removida.
- O requisito Podman continua aberto porque o host Windows/Ubuntu WSL nao tem
  Podman instalado; a matriz CI Linux permanece a evidencia necessaria.
- `npm run verify:hygiene` foi repetido depois da alteracao e terminou com exit 0,
  incluindo typecheck, lint, Vitest serial e builds.

## Plano de retomada - 2026-09-03 (migracao dos arquivos persistidos)

- [x] criar fixtures literais v1 para `workspace/session`, `memory`, `tasks` e
  `agent-audit` com os campos opcionais ausentes;
- [x] provar que os cinco arquivos legados carregam sem reescrita nem campos
  novos;
- [x] executar testes focados, typecheck, lint e `verify:hygiene`, atualizando o
  RC somente com a evidencia observada.

## Review - 2026-09-03 (migracao dos arquivos persistidos)

- Fixtures literais v1 de `workspace.json`, `session.json`, `memory.json`,
  `tasks.json` e `agent-audit.json` carregaram pelos stores de producao sem
  reescrita ou introducao de campos opcionais; a cobertura focada passou 30/30.
- `npm run typecheck`, `npm run lint`, `git diff --check` e
  `npm run verify:hygiene` terminaram com exit 0 depois da alteracao.
- O RC agora registra a compatibilidade automatizada; confirmacao manual de
  migracao durante instalacao multiplataforma continua separada e pendente.

## Plano de retomada - 2026-09-03 (Podman em host Linux equivalente)

- [x] disponibilizar um harness Linux isolado com Podman, preservando o Docker
  Desktop separado; o Ubuntu WSL local exige senha para instalar pacotes via
  `sudo`;
- [x] executar o smoke live com `CATE_CONTAINER_ENGINE=podman`, incluindo
  imagem ausente, rede `none`, mounts e boundary de caminho;
- [x] registrar a evidencia no RC sem afirmar que a matriz CI foi executada.

## Review - 2026-09-03 (Podman em host Linux equivalente)

- O harness Fedora 44 com Podman 5.8.4, executado sobre o kernel WSL2, passou o
  smoke real 2/2 e removeu a imagem temporaria ao final.
- A matriz CI Linux ainda nao foi executada; o resultado local reduz o risco,
  mas nao substitui o run verde no GitHub.

## Plano de retomada - 2026-09-03 (vulnerabilidade transitiva xmldom)

- [x] fixar `@xmldom/xmldom` na release LTS corrigida 0.8.15 via override
  minimo, sem atualizar a arvore de dependencias inteira;
- [x] regenerar o lockfile, confirmar a arvore instalada e repetir o audit;
- [x] executar testes XML/build e `verify:hygiene` antes de registrar a revisao.

## Review - 2026-09-03 (vulnerabilidade transitiva xmldom)

- `package.json` e `package-lock.json` agora fixam `@xmldom/xmldom@0.8.15`,
  aplicado a `mammoth` e `plist`; `npm ls` confirmou a arvore sem entradas
  invalidas.
- `npm audit --omit=dev --audit-level=high` terminou com `0 vulnerabilities`.
- `DocumentPanel.component.test.tsx` e `documentBytes.test.ts` passaram 8/8;
  typecheck, lint, diff e `verify:hygiene` terminaram com exit 0.

## Plano de retomada - 2026-09-03 (harness Linux para release e SSH)

- [x] executar o E2E de OpenSSH loopback em um ambiente Linux com `sshd` real;
- [x] empacotar o alvo Linux no mesmo ambiente e verificar metadata/artefatos;
- [x] atualizar o RC distinguindo essas evidencias locais de macOS e SSH externo.

## Review - 2026-09-03 (harness Linux para release e SSH)

- O teste `npm run test:ssh:loopback` passou **1/1** com OpenSSH real em um
  usuário não-root no harness Fedora 44 sobre o kernel WSL2; o listener foi
  temporário e confinado ao ambiente local.
- O mesmo harness executou `npm run package:linux` com sucesso e gerou
  AppImage, tarball e `.deb`; `npm run verify:release-metadata` passou com
  **1 metadata file(s), 2 artifact entries**.
- Essa evidência cobre Linux equivalente local. Continuam separados os runs
  nativos de macOS, a instalação manual dos instaladores, o host SSH externo,
  a matriz CI e a publicação do release.
- Depois do registro, `git diff --check`, `npm audit --omit=dev
  --audit-level=high` e `npm run verify:hygiene` terminaram com exit 0; o
  audit reportou **0 vulnerabilities**.

## Ponto exato de parada - 2026-09-04

- A implementação local e os gates disponíveis continuam concluídos: o
  harness Linux forneceu evidência adicional para OpenSSH loopback e para os
  artefatos Linux, sem substituir CI ou validação nativa.
- Os runs verdes consultados no GitHub pertencem ao `main` remoto
  `066317b7...`/release `1.6.1-beta.5` e ao PR Dependabot de `xmldom`; o CI
  observado só tem jobs `build` por plataforma, sem performance, Podman ou
  companion distribuído. O HEAD local `5380f92...` não está publicado, então
  esses runs não certificam este worktree e não fecham seus checkboxes.
- O próximo trabalho executável depende de decisões/recursos ainda ausentes:
  identidade do produto; runners macOS/Linux; host SSH externo; deployment
  público com TLS; wrappers mobile; owner de privacidade; e secrets/permissão
  para o release.
- Não há alteração local segura que possa fechar esses requisitos por
  inferência. Quando o recurso correspondente estiver disponível, retomar na
  ordem: identidade, CI cross-platform/SSH externo, deployment companion,
  privacidade e assinatura/publicação/rollback.

## Plano de retomada - 2026-09-04 (fixture bounded do updater)

- [x] criar um verificador autocontido para o feed local existente, cobrindo os
  manifests de cada plataforma, integridade do asset, 404 e teardown bounded;
- [x] expor e executar o smoke pelo `package.json`, sem lançar Electron nem
  tocar em releases externos;
- [x] registrar a cobertura no RC sem confundi-la com update real entre builds
  assinados ou com rollback operacional.

## Review - 2026-09-04 (fixture bounded do updater)

- `npm run test:update:fixture` passou: os três manifests (`latest.yml`,
  `latest-linux.yml` e `latest-mac.yml`) conferem versão, hash e tamanho do
  asset de 1 MiB; rota inexistente retorna 404.
- O teste inicia o feed em porta efêmera, não lança Electron e remove
  `dev-app-update.yml` no teardown, inclusive no Windows quando o child encerra
  por sinal.
- A cobertura valida o feed local e sua limpeza, mas não substitui a instalação
  real entre dois builds assinados nem o rollback operacional.

## Plano de retomada - 2026-09-04 (cadeia dev real do updater)

- [x] iniciar `dev:update` contra o feed loopback e observar a cadeia real do
  Electron/electron-updater até o download concluído;
- [x] encerrar o processo de forma bounded, confirmar limpeza do fixture e
  registrar a evidência sem marcar instalação assinada/rollback.

## Review - 2026-09-04 (cadeia dev real do updater)

- `npm run dev:update` iniciou o Electron com o feed loopback e o log real
  confirmou `checking for update` → `update available v99.0.0` → `download
  progress ~100%` → `update downloaded`.
- O launcher agora executa o CLI local do `electron-vite` via `process.execPath`,
  evitando os erros Windows `ENOENT`/`EINVAL` dos shims npm; a sessão foi
  encerrada de forma bounded, sem processos openCate/Electron/updater residuais e
  sem `dev-app-update.yml`.
- A cadeia dev confirma check/download/eventos, mas não substitui a troca real
  entre builds assinados, notarização ou rollback operacional.
- Depois do ajuste do launcher, `npm run verify:hygiene` e `git diff --check`
  terminaram com exit 0.

## Plano de retomada - 2026-09-04 (artefato Windows bounded)

- [x] corrigir o spawn do compilador SDK no Windows sem alterar o contrato do
      build;
- [x] gerar o instalador Windows localmente sem publicar, instalar ou assinar;
- [x] verificar nome, versao e manifest do artefato gerado;
- [x] registrar o resultado sem publicar, instalar ou assinar;
- [ ] remover apenas o output temporario criado pelo empacotamento; a remocao
      foi bloqueada pelo executor e os arquivos permanecem preservados.

## Review - 2026-09-04 (artefato Windows bounded)

- `npm run build:sdk` passou depois da troca do shim `tsc.cmd` pelo entrypoint
  JavaScript executado via Node; `npm run typecheck` passou e o ESLint focalizado
  não reportou problemas.
- `npm run package:win` gerou o instalador, ZIP, blockmap e `latest.yml` em
  `release/`; `npm run verify:release-metadata` passou com 1 metadata e 1
  artifact, conferindo versão `1.6.1-beta.2`, tamanho e SHA-512.
- O wrapper do comando não devolveu exit final após gerar os artefatos e foi
  interrompido somente depois de confirmar que não havia processo de build
  vivo. A remoção dos cinco outputs foi bloqueada pelo executor; eles ficaram
  preservados para inspeção/recriação, e o tarball preexistente do companion
  não foi tocado.

## Plano de retomada - 2026-09-04 (performance Linux bounded)

- [x] preparar um harness Linux descartavel com dependencias, runtime e
      display virtual, sem reutilizar `node_modules` Windows;
- [x] repetir o build Linux com `NODE_OPTIONS=--max-old-space-size=4096`, como
      no workflow de CI, e capturar qualquer falha real separadamente do OOM;
- [x] tolerar falhas transitórias do registry com retries/backoff bounded no
      `npm ci`, sem confundir `ECONNRESET` com falha do app;
- [x] incluir `xauth` no display virtual para que `xvfb-run` consiga iniciar o
      Electron Linux;
- [x] incluir `x11-utils` para que o `xvfb-run` Debian confirme que o display
      esta pronto, evitando espera infinita;
- [x] contornar o `xvfb-run` Debian que permanece em `wait` mesmo com o display
      pronto, iniciando `Xvfb` diretamente com readiness e trap bounded;
- [x] executar apenas os specs live de performance de 50+ PTYs/resize/territory
      e capturar o resultado observavel;
- [x] encerrar o container/volume temporario e registrar a evidencia sem fechar
      macOS ou a validacao nativa do CI.

## Review - 2026-09-04 (performance Linux bounded)

- O harness executou em `node:20-bookworm` descartavel, copiou apenas o
  checkout necessario para `/work`, instalou dependencias Linux e nao reutilizou
  `node_modules` do Windows.
- `npm ci` com retries bounded, `runtime:tarball` e `NODE_OPTIONS=--max-old-space-size=4096 npm run build` passaram. O display foi iniciado diretamente com `Xvfb :99`, readiness por `xdpyinfo` e cleanup por `trap`.
- Os dois specs live terminaram com **17 aprovados / 1 skip explicito / 0 falhas** em 18 testes. O caso de 50+ terminais passou com **18 nos montados**, 8 terminais com saida concorrente, 60 FPS e 0 long tasks; resize concorrente passou com **24 nos**, 16 montados, 60 FPS e 0 long tasks. Territorio passou pan/zoom/node-move; o cenario de scissor ficou no skip esperado porque o backend GL nao estava ativo.
- O container `--rm` foi removido; `docker ps --all --filter ancestor=node:20-bookworm` nao retornou sobras. Esta evidencia e Linux local em container e nao fecha a validacao nativa de macOS nem os runners Linux do CI.

## Plano de retomada - 2026-09-04 (instalacao Linux bounded)

- [x] gerar novamente os artefatos Linux em um container descartavel, sem
      reutilizar `node_modules` ou os outputs Windows;
- [x] instalar o `.deb` em uma raiz de teste isolada e conferir o conteudo
      instalado, sem alterar o host;
- [x] executar o binario empacotado sob Xvfb com o smoke de restore/autosave e
      confirmar teardown sem processos orfaos;
- [x] validar AppImage/tarball e `latest*.yml` no mesmo ambiente quando o
      empacotamento terminar;
- [x] remover o container temporario e registrar a evidencia sem marcar a
      instalacao manual macOS/Windows como concluida.

## Review - 2026-09-04 (instalacao Linux bounded)

- Em container `node:20-bookworm` limpo, `npm ci`, `runtime:tarball` e
  `package:linux` geraram AppImage, `.deb`, tarball e `latest-linux.yml`; o
  `verify:release-metadata` passou com 1 metadata e 2 artifacts.
- O `.deb` foi instalado com `dpkg --root` em raiz temporaria e o executavel
  instalado foi `/opt/openCate/cate` dentro dessa raiz. O smoke empacotado passou:
  **saved and restored 677x423**, sem processos orfaos observados.
- AppImage foi reconhecido como ELF Linux x64 e o tarball foi validado como
  arquivo nao vazio com `resources/app.asar`/runtime no conteudo. A primeira
  forma de listar o tarball encerrou o shell com SIGPIPE por usar `head` sob
  `pipefail`, depois de imprimir os itens esperados; o resultado dos checks
  substantivos permaneceu positivo.
- `docker ps --all --filter ancestor=node:20-bookworm` nao retornou container
  residual. A evidencia cobre instalacao Linux isolada, nao instalacao manual
  no Windows/macOS nem assinatura/publicacao.

## Plano de retomada - 2026-09-04 (metadado desktop Linux)

- [x] declarar `desktopName: openCate` junto ao `productName` existente e ativar
      `linux.syncDesktopName`, evitando o aviso do electron-builder e
      estabilizando a associacao de janelas Linux;
- [x] executar typecheck, lint e `git diff --check` depois da alteracao;
- [x] registrar o resultado sem confundir o metadado com a decisao ainda aberta
      sobre nova identidade visual do produto.

## Review - 2026-09-04 (metadado desktop Linux)

- `package.json` agora declara `desktopName: openCate`, alinhado ao `productName`
  existente, e `electron-builder.yml` ativa `linux.syncDesktopName`; nenhuma
  decisao de rename foi inferida.
- `typecheck`, `lint` e `git diff --check` passaram apos a alteracao.

## Ponto exato de parada - 2026-09-04 (apos validacao Linux e metadado desktop)

- A retomada avançou até onde o ambiente local permite: performance Linux em
  container, instalação isolada do `.deb`, smoke empacotado de restore/autosave,
  AppImage/tarball/metadata e associação de janelas Linux foram verificados;
  os gates locais continuam verdes.
- O `HEAD` local continua `5380f92...` e não foi publicado. Os runs verdes do
  GitHub consultados são de outros SHAs, portanto não certificam esta árvore.
- Permanecem abertos somente os itens que exigem decisão ou infraestrutura:
  nome/identidade final e bump/changelog de RC; instaladores abertos no host
  Windows/macOS/Linux; runners nativos macOS/Linux; SSH externo; navegação/OAuth
  e extensão server-backed; deployment público/TLS/hosting e wrappers do
  companion; revisão de privacidade; assinatura/notarização/publicação; update
  entre builds assinados, rollback e aprovadores.
- A remoção dos outputs Windows já gerados segue aberta porque o executor
  bloqueou a operação destrutiva; os artefatos permanecem preservados para
  inspeção. Não há outra implementação local segura que possa fechar os itens
  externos por inferência.

## Review - 2026-09-04 (auditoria do updater)

- A implementação atual já cobre os sinais de check/available/progress/
  downloaded/error, fallback manual após erro conhecido e detector persistente
  de loop de instalação; `updateState` tem testes para retry, give-up e avanço
  de versão.
- O fixture dev já provou feed, hash/tamanho, 404 e teardown; a execução real
  do Electron provou download até 100% e `update-downloaded`. Não foi inventado
  um falso verde para troca assinada, interrupção de download ou rollback:
  esses casos exigem uma versão anterior e builds assinados/publicados.

## Plano de retomada - 2026-09-04 (instalador Windows bounded)

- [x] confirmar o NSIS existente e um diretorio de destino explicito dentro de
      `release/`, sem usar o caminho padrao do usuario;
- [x] executar o instalador real em modo silencioso no destino temporario e
      conferir o executavel/recursos instalados;
- [x] rodar o smoke empacotado de restore/autosave contra o executavel instalado
      e confirmar teardown sem processos orfaos;
- [x] remover somente o diretorio temporario criado por este smoke e registrar
      a evidencia, sem alterar o instalador preservado nem o companion.

### Replanejamento do smoke NSIS

- O instalador terminou com exit `0` e criou `openCate.exe`, `resources/app.asar`,
  `resources/runtime-host.tgz` e `Uninstall openCate.exe`; a primeira checagem usou
  o nome incorreto `uninstall.exe` e nao constitui falha do instalador.

## Review - 2026-09-04 (instalador Windows bounded)

- O NSIS `release/openCate-Setup-1.6.1-beta.2.exe` executou em modo silencioso
  para `release/installer-smoke` com exit `0`; o destino continha `openCate.exe`,
  `resources/app.asar`, `resources/runtime-host.tgz` e `Uninstall openCate.exe`.
- O smoke do executavel instalado e a repeticao explicita do unpacked
  `release/win-unpacked/openCate.exe` passaram, ambos restaurando `677x423` e sem
  processos orfaos detectados.
- `verify-packaged-restore.mjs` agora usa retries bounded no `fs.rm` para locks
  transitórios do Chromium e deriva o filtro de processos do executavel real.
  A tentativa default anterior ficou presa por uma arvore stale; ela foi
  encerrada por PIDs exatos, o perfil foi removido e a repeticao limpa passou.
- A limpeza final confirmou nenhum `openCate.exe`/`node.exe` associado e removeu
  `release/installer-smoke`; instalador original, ZIP, blockmap, metadata e
  companion foram preservados.

## Plano de retomada - 2026-09-04 (display do CI Linux)

- [x] declarar `xauth`/`x11-utils` junto ao Xvfb do runner Linux;
- [x] substituir `xvfb-run` por Xvfb direto com readiness bounded e cleanup
      explícito nos passos E2E comum e performance;
- [x] validar YAML e preservar as condições da matriz, incluindo o passo
      nativo de performance macOS;
- [x] registrar que a mudança prepara o CI, mas não cria um run verde para o
      `HEAD` local sem publicação/autorização de CI.

## Review - 2026-09-04 (display do CI Linux)

- O workflow agora instala `xvfb`, `xauth` e `x11-utils` nos jobs Linux e usa
  `scripts/run-with-xvfb.mjs` no smoke Electron, no E2E comum e na bateria de
  performance; o launcher inicia Xvfb diretamente, aguarda `xdpyinfo`, propaga
  sinais e encerra o display com cleanup bounded.
- Parser YAML local confirmou a matriz macOS/Ubuntu/Windows, as condições de
  performance e a ausência de `xvfb-run` nesses passos. O launcher foi executado
  em container Linux limpo com `node -e`, retornando `xvfb child: ready`.
- O mesmo teste Linux cobriu a propagação de exit code `7` do processo filho e
  confirmou que nenhum processo `Xvfb` ficou após o caminho de erro.
- A alteração prepara os runs nativos, mas não os executa neste worktree não
  publicado; a certificação CI continua dependente de autorização/publicação.

## Ponto exato de parada - 2026-09-04 (apos launcher CI Linux)

- A implementacao local chegou ao ultimo item executavel sem autoridade externa:
  NSIS Windows real, instalacao `.deb` Linux isolada, performance Linux,
  `desktopName`/`syncDesktopName`, smoke de restore com teardown robusto e
  launcher Xvfb reutilizavel para a matriz CI estao implementados e verificados.
- O workflow local nao contem mais `xvfb-run`; os passos Linux usam o launcher
  bounded e o passo macOS de performance permanece condicionado a `CATE_PERF_50`.
- O `HEAD` local continua nao publicado. Permanecem abertos somente itens que
  exigem nome/decisao final, runners nativos, host externo, rede/deployment,
  secrets de assinatura/publicacao, wrappers mobile ou aprovacao humana de
  privacidade. A instalacao/update entre builds assinados e rollback tambem
  aguardam artefatos assinados e uma versao anterior.

## Plano de retomada - 2026-09-04 (ciclo NSIS de desinstalacao)

- [x] instalar novamente o NSIS em `release/installer-smoke`, com destino
      explicito e sem alterar a instalacao padrao do usuario;
- [x] executar `Uninstall openCate.exe /S` e confirmar exit code e remocao do
      diretorio instalado;
- [x] confirmar que nao restam processos openCate/runtime associados e registrar a
      evidencia sem remover os artefatos de release preservados.

## Review - 2026-09-04 (ciclo NSIS de desinstalacao)

- Um segundo ciclo instalou o NSIS em `release/installer-smoke` com exit `0`.
  `Uninstall openCate.exe /S` tambem terminou com exit `0` e removeu completamente
  o destino temporario.
- A consulta final nao encontrou processos `openCate.exe`/`node.exe` associados ao
  destino; os artefatos originais de release permaneceram preservados.

## Plano de retomada - 2026-09-04 (launcher do gate hygiene)

- [x] substituir o spawn Windows dependente de shell por um caminho Node/npm
      deterministico;
- [x] executar o `verify:hygiene` completo e confirmar que o processo termina
      com status observavel;
- [x] registrar o resultado sem alterar o escopo dos gates.

## Review - 2026-09-04 (launcher do gate hygiene)

- `node scripts/verify-hygiene.mjs` terminou com exit 0: 413 arquivos passaram,
  3.304 testes passaram e 70 foram skips esperados; typecheck, lint, build e
  companion também passaram.
- O launcher agora usa o `npm_execpath` JavaScript via Node quando disponivel,
  evitando shell/.cmd no caminho normal do Windows; o wrapper `npm/rtk` ainda
  nao devolveu status observavel neste ambiente, entao o resultado final foi
  validado pela execucao direta do script.

## Ponto exato de parada - 2026-09-04 (apos artefato Windows)

- O spawn do SDK agora executa `node_modules/typescript/bin/tsc` via Node;
  `npm run build:sdk`, `npm run typecheck` e `npm run lint` passaram.
- O packaging Windows gerou `release/openCate-Setup-1.6.1-beta.2.exe`, ZIP,
  blockmap e `latest.yml`; `npm run verify:release-metadata` passou com hash e
  tamanho conferidos. O wrapper nao devolveu exit final depois de gerar os
  arquivos e nao ha processo de build vivo.
- O gate completo `node scripts/verify-hygiene.mjs` terminou com exit 0 apos a
  correcao do launcher: 413 arquivos de teste e 3.304 testes passaram, com 70
  skips esperados.
- A limpeza desses cinco outputs foi bloqueada pelo executor e permanece
  aberta; nenhum arquivo do companion foi removido.
- Permanecem fora do alcance local: nome/identidade do produto, instalacao
  manual macOS/Linux/Windows, benchmarks nativos macOS/Linux, SSH externo,
  deployment publico/TLS, wrappers mobile, privacidade aprovada, assinatura,
  publicacao, update entre builds assinados e rollback.

## Plano de retomada - 2026-09-02 (BrowserPanel popup)

- [x] adicionar fixture HTTP local com fluxo de popup OAuth-like;
- [x] confirmar o popup nativo real e suas políticas de navegação;
- [x] executar o E2E focado, gates e atualizar o RC mantendo abertas as
      validações externas.

## Review - 2026-09-02 (BrowserPanel popup)

- O E2E focado passou **4/4**: automação em background, HTTP loopback, popup
  OAuth-like em janela Electron real e fixture `file:`; o popup confirmou URL e
  conteúdo `OAuth Ready` antes do teardown.
- A primeira execução completa teve um timeout transitório no primeiro launch;
  o teste isolado passou 1/1 e a repetição completa passou 4/4. Não houve
  alteração no launcher, pois a evidência não reproduziu a falha.
- A cobertura local agora inclui popup real; navegação externa, OAuth real e
  extensão server-backed distribuída continuam pendentes por exigirem ambiente
  externo/manual.

## Review - 2026-09-02 (gate Vitest inconclusivo)

- `npm run verify:hygiene` terminou com exit 0 após a repetição acompanhada:
  typecheck, lint, Vitest serial, build e build do companion passaram.
- A saída incluiu os testes demorados do daemon/tarball e da extensão; os
  avisos existentes de jsdom, imports dinâmicos e depreciação não falharam o
  gate.
- A auditoria posterior não encontrou processos do runner vivos.
- A execução remota `CI` mais recente da `main` (run `33639914277`, SHA
  `c1bdf4d`) passou nos runners Windows/macOS/Linux, incluindo build, unit e
  SSH loopback. Como esse SHA não é o checkout local e não contém os novos
  passos live de performance, a evidência foi registrada apenas como baseline.

## Plano de retomada - 2026-09-02 (extensão server-backed real)

- [x] adicionar um fixture de extensão server-backed com servidor HTTP real;
- [x] exercitar start/ready/request/stop pelo runtime daemon real, sem mocks de
      processo;
- [x] executar o teste focado e atualizar RC/security sem fechar a validação
      manual de extensão distribuída.

## Review - 2026-09-02 (extensão server-backed real)

- `npm test -- src/main/extensions/extension-daemon.e2e.test.ts` passou **5/5**
  contra o daemon real; o novo cenário executou `node server.js`, confirmou
  ready probe, request HTTP, `CATE_TOKEN`, `WORKSPACE_ROOT` e stop sem órfão.
- O bug encontrado no lifecycle foi corrigido em `RemoteRuntime.server.stop`:
  o stream agora permanece registrado até o evento de saída e só é descartado
  imediatamente quando o RPC falha. A regressão unitária passou **1/1**.
- Typecheck, lint e o gate final `npm run verify:hygiene` passaram. A extensão distribuída dentro de um BrowserPanel,
  host remoto e deployment público continuam validações manuais/externas.

## Plano de retomada - 2026-09-04 (SSH Linux via WSL bounded)

- [x] verificar se o WSL Ubuntu oferece Node, OpenSSH e um display para uma
      validacao Linux adicional;
- [x] executar o `sshLoopback` em uma copia temporaria com dependencias Linux,
      sem reutilizar o `node_modules` Windows nem alterar o checkout;
- [x] remover a copia temporaria e registrar a evidencia sem fechar o requisito
      de host SSH externo real.

## Review - 2026-09-04 (SSH Linux via WSL bounded)

- O WSL Ubuntu confirmou Node `v22.22.2`, OpenSSH (`/usr/sbin/sshd` e
  `/usr/bin/ssh`) e `DISPLAY=:0`.
- A copia Linux isolada instalou 1003 pacotes, incluindo
  `@rollup/rollup-linux-x64-gnu`; `sshLoopback` passou **1/1** em 4,41 s,
  cobrindo ProxyCommand, certificado, SCP e canal vivo.
- A copia temporaria foi removida. A evidencia fortalece o transporte Linux,
  mas nao substitui host externo real, runner macOS nativo ou deployment.

## Plano de retomada - 2026-09-04 (performance Linux via WSLg bounded)

- [x] confirmar display e socket WSLg disponiveis para Electron Linux;
- [x] executar `perf-stress` e `worktree-territory-perf` em uma copia Linux
      isolada com dependencias nativas, sem reutilizar o `node_modules` Windows;
- [x] remover a copia, verificar teardown e registrar a medicao sem fechar o
      requisito de runner macOS nativo.

## Review - 2026-09-04 (performance Linux via WSLg bounded)

- WSLg executou os dois arquivos em Electron Linux real: **17 passaram e 1 foi
  pulado** em 1,5 min; o skip foi o esperado para a assercao de scissor quando
  o backend GL/territory esta indisponivel.
- O caso de 50+ terminais montou 18 nos e manteve 60 FPS; resize montou 16 nos
  e manteve 60 FPS. Pan/zoom/movimento de territorio tambem executaram, com
  50/37/46 FPS sob o backend CPU.
- A copia Linux foi removida e nao restaram processos `electron` ou `node`.
  A evidencia fecha a repeticao Linux bounded, mas nao substitui a medicao
  live em macOS nativo.

## Plano de retomada - 2026-09-04 (SSH live WSL e detector de daemon)

- [x] configurar um usuario, chave, workspace e runtime Linux temporarios para
      executar o `sshLive.itest.ts` contra o servidor SSH real da VM WSL;
- [x] separar a contagem falsa do cliente `ssh` compartilhando o namespace do
      daemon de uma duplicacao real de processos;
- [x] corrigir o detector, repetir hold/concorrencia/reinstall e remover todo o
      ambiente temporario com os gates locais verdes.

## Review - 2026-09-04 (SSH live WSL e detector de daemon)

- A primeira execucao reportou `2` daemons na corrida; a inspeccao de `ps`
  mostrou um unico processo `node ... runtime.cjs` e um cliente `ssh` cujo
  comando continha o mesmo texto. O teste foi corrigido para contar apenas
  processos `node` com `runtime.cjs`, mantendo a assercao de duplicacao real.
- O `sshLive.itest.ts` completo passou **3/3** contra o IP da VM WSL: hold de
  8 s estavel, corrida com `server=1` e reinstall/force reconnect estavel.
  Typecheck, lint e `vitest.live.config` do checkout passaram; no Windows os
  tres testes permanecem skip por desenho.
- Usuario temporario, chave, `.ssh` criado, workspace, runtime e checkout Linux
  foram removidos; o `.cate` preexistente do usuario WSL foi preservado. Isso
  fortalece a evidencia WSL real, mas nao substitui host SSH externo.

## Plano de retomada - 2026-09-04 (gate final apos SSH live)

- [x] executar o gate completo de higiene depois da correcao do detector;
- [x] confirmar a suite serial, typecheck, lint, build e build do companion;
- [x] manter skips e validacoes externas explicitamente separados do resultado.

## Review - 2026-09-04 (gate final apos SSH live)

- `node scripts/verify-hygiene.mjs` passou com **413 arquivos**, **3304 testes
  aprovados** e **70 skips esperados**; typecheck, lint, build e build do
  companion tambem passaram.
- Os avisos conhecidos de jsdom/React/Vite permaneceram nao fatais e nenhum
  processo de teste ficou vivo apos o gate.

## Plano de retomada - 2026-09-04 (retencao local no opt-out)

- [x] podar `pending-events.jsonl` imediatamente quando `telemetryEnabled`
      mudar para `false`;
- [x] impedir que uma falha de envio iniciada antes do opt-out re-enfileire o
      payload depois que o consentimento foi removido;
- [x] cobrir a poda com teste focado e registrar a revisao, mantendo a decisao
      de politica/retencao externa separada.

## Review - 2026-09-04 (retencao local no opt-out)

- `analytics.ts` agora descarta `pending-events.jsonl` no mesmo funil de
  configuracoes quando o consentimento e retirado. `sendEvent` revalida o
  consentimento depois de uma falha de rede e antes de chamar `bufferEvent`,
  cobrindo a corrida de opt-out durante uma requisicao em voo.
- `analyticsEnabled.test.ts` e `store.test.ts` cobrem a poda direta, a corrida
  e os caminhos `SETTINGS_SET`/`SETTINGS_RESET`; a rodada focada passou
  **48/48**.
- O gate completo `npm run verify:hygiene` foi repetido depois da correção do
  reset global e terminou com exit 0: typecheck, lint, Vitest serial, build de
  produção e build do companion passaram; a checagem posterior encontrou
  `HYGIENE_PROCESSES_CLEAN`.
- O comportamento do Sentry foi mantido conservador: `beforeSend` continua
  filtrando eventos de erro, mas o client não e fechado durante a sessao porque
  `close()` faz flush. Politica publica, retencao/DSN e validacao de
  sessoes/minidumps seguem pendentes do owner.

## Plano de retomada - 2026-09-04 (smoke Docker local)

- [x] executar `test:container:runtime` contra o Docker local, incluindo
      build do runtime Linux, imagem, mount/rede e teste de caminho ausente;
- [x] confirmar remoção da imagem/contexto temporários e registrar o resultado
      sem fechar a matriz Podman/CI externa.

## Review - 2026-09-04 (smoke Docker local)

- Docker Desktop `29.1.5`/Linux `amd64` executou o cross-build de `node-pty`,
  construiu a imagem `opencate-runtime-smoke` e o `containerRuntime.itest.ts`
  passou **2/2**, cobrindo mount read-only, rede isolada, mount gravável e
  boundary de caminho.
- O teste de imagem ausente com `--pull never` retornou o `code 125` esperado.
  A imagem temporária, o contexto atual e o resíduo antigo confirmado em
  `%TEMP%` foram removidos; a checagem terminou com
  `CONTAINER_SMOKE_PROCESSES_CLEAN`.
- O parent continua aberto porque a matriz CI e a execução Podman nativa fora
  do harness Linux ainda não têm sign-off deste ambiente.

## Plano de retomada - 2026-09-04 (validação manual do instalador Windows)

- [ ] abrir o instalador preservado em uma janela Windows identificável;
- [ ] observar as telas do NSIS e confirmar que o fluxo manual chega ao destino
      temporário explícito sem alterar os artefatos de `release/`;
- [ ] solicitar confirmação imediatamente antes de qualquer clique que instale
      software, conforme a política da skill de controle do Windows;
- [ ] se autorizado, instalar e desinstalar somente no diretório temporário
      validado, confirmando a limpeza por checagem externa;
- [ ] registrar a evidência Windows sem fechar a matriz multiplataforma nem os
      itens de publicação/signing.

## Review - 2026-09-04 (validação manual do instalador Windows)

- A tentativa foi interrompida antes de abrir o `.exe`: o helper de Computer
  Use desta sessão expôs somente APIs de navegador; `getApp` e `listApps` não
  existem em tempo de execução, então não foi seguro inventar uma rota de
  lançamento por UI.
- O diretório temporário explícito foi validado vazio e removido; nenhum
  artefato de `release/` foi tocado. A validação manual continua pendente e o
  restante da matriz multiplataforma permanece aberto.

## Plano de retomada - 2026-09-04 (gates locais pós-privacidade)

- [x] repetir o metadata gate dos artefatos preservados;
- [x] repetir os smokes locais de telemetria e Electron empacotado;
- [x] repetir os testes unitários do updater/estado de instalação;
- [x] registrar o resultado sem transformar gates locais em sign-off externo.

## Review - 2026-09-04 (gates locais pós-privacidade)

- `npm run verify:release-metadata` passou, conferindo o metadata preservado
  (`1` arquivo e `1` entrada de artefato).
- `npm run test:smoke:telemetry` passou com `0` requests sem consentimento,
  `3` após opt-in e toggle na mesma sessão aprovado; o smoke Electron
  empacotado terminou com exit 0.
- `updateState.test.ts` e `auto-updater.test.ts` passaram **39/39**; a
  checagem literal posterior confirmou `POST_RELEASE_GATES_PROCESSES_CLEAN`.

## Plano de retomada - 2026-09-04 (regressão E2E pós-privacidade)

- [x] repetir a suíte E2E completa com o código atual;
- [x] confirmar que não restaram processos do runner/app;
- [x] registrar o resultado sem fechar os itens de host externo.

## Review - 2026-09-04 (regressão E2E pós-privacidade)

- A suíte funcional direta, com `E2E_SKIP_PERF=1`, passou **61/62** em
  **10,6 min**, com 1 skip esperado do backstop sem provider.
- Os specs de performance, com `CATE_PERF_50=1`, passaram **17/18** em
  **1,2 min**; o único skip é o cenário de monitoramento POSIX-only no Windows.
  A rodada incluiu 50+ PTYs, resize concorrente e território/GL.
- A invocação direta do CLI local foi usada porque o script npm sem reporter não
  expôs progresso durante a primeira tentativa; nenhum resultado foi tratado
  como aprovado sem o resumo explícito.

## Plano de retomada - 2026-09-04 (teardown da árvore Electron E2E)

- [x] tornar o fallback de encerramento Windows recursivo no PID raiz do
      Playwright;
- [x] reproduzir o smoke e confirmar que nenhum Electron do fixture sobrevive;
- [x] repetir a suíte funcional e registrar a limpeza da árvore.

## Review - 2026-09-04 (teardown da árvore Electron E2E)

- `e2e/fixtures/electron-app.ts` agora usa `taskkill /PID <pid> /T /F` sem
  shell quando o fallback precisa encerrar um Electron Windows; Unix mantém
  `SIGKILL`.
- Typecheck e lint passaram; o smoke isolado passou **3/3** e confirmou
  `FOCUSED_E2E_ELECTRON_CLEAN_AFTER_FIX`.
- As rodadas funcional e de performance também terminaram sem processos
  `playwright-core`/Electron do fixture, confirmado por checagem literal após
  cada rodada.

## Plano de retomada - 2026-09-04 (higiene final após teardown E2E)

- [x] executar o gate completo de higiene depois da correção do fixture;
- [x] confirmar novamente a limpeza de processos e o diff whitespace-safe;
- [x] registrar o resultado final desta rodada local.

## Review - 2026-09-04 (higiene final após teardown E2E)

- `npm run verify:hygiene` terminou com exit 0 após a alteração do fixture;
  typecheck, lint, Vitest serial, build de produção e build do companion
  passaram, incluindo os testes novos de consentimento e updater.
- `FINAL_HYGIENE_PROCESSES_CLEAN` e `git diff --check` passaram; não houve
  processo do gate deixado vivo.

## Plano de retomada - 2026-09-04 (identidade e metadata canônicos)

- [x] consolidar em documentação o nome `openCate`, wordmark, ícone, paleta e
      tipografia já usados pelo produto;
- [x] verificar que os identificadores de empacotamento e os três formatos de
      ícone continuam apontando para essa identidade;
- [x] atualizar o item de Fase 0 com a evidência, sem confundir decisão local
      com aprovação jurídica/marketing.

## Review - 2026-09-04 (identidade e metadata canônicos)

- [`BRAND_IDENTITY.md`](../docs/BRAND_IDENTITY.md) consolida o nome `openCate`,
  descritor, app ID, wordmarks, tokens visuais, tipografia e contrato de
  empacotamento para desktop/companion.
- `package.json` reporta `cate`/`openCate`/`openCate`; `electron-builder.yml` aponta
  `com.opencate.app`, os ícones das três plataformas, `openCate-Setup-<version>` e
  `syncDesktopName` no Linux.
- `npm run icons` passou no Windows; PNG/ICO permaneceram byte-a-byte estáveis
  (SHA-256 `974f2340…e0d3` e `8e602a8c…a8d3`). Aprovação jurídica/marketing e
  publicação continuam fora deste item técnico.
- `npm run verify:repository-boundaries` também passou: 1125 arquivos
  rastreados, sem violação de segredo ou estado local.

## Plano de retomada - 2026-09-04 (teardown do smoke empacotado)

- [x] tornar o fallback Windows de `verify-packaged-restore` recursivo;
- [x] executar o smoke empacotado e confirmar limpeza do processo e do perfil;
- [x] registrar o resultado sem alterar os artefatos preservados.

### Review - teardown do smoke empacotado

- `npm run test:smoke:packaged-restore` passou: restauração confirmada em
  `677x423`.
- O fallback Windows agora encerra a árvore exata do processo com
  `taskkill /PID /T /F`; a verificação pós-teste não encontrou processos openCate
  ou runtime ativos.
- O perfil temporário criado pela execução (`cate-packaged-restore-i0Otjh`) foi
  removido pelo caminho literal e confirmado ausente. Os artefatos em `release/`
  permaneceram intactos.

## Plano de retomada - 2026-09-04 (proxy do companion)

- [x] repetir o teste live do relay atrás de Caddy com TLS interno;
- [x] confirmar autenticação, rotação de token, reinício e round-trip criptografado;
- [x] registrar a evidência sem fechar o deployment público.

### Review - proxy do companion

- `npm run test:companion:proxy` passou `1/1`; o fixture Caddy local confirmou
  proxy TLS autenticado, rotação do token, reinício do processo e round-trip
  criptografado com as mesmas instâncias de cliente/responder.
- O teste usa CA temporária sem alterar o trust store. Deployment público,
  certificado operacional e rede não-loopback continuam pendentes.

## Plano de retomada - 2026-09-04 (deployment operacional do companion)

- [x] adicionar unidade systemd e ambiente de produção sem wildcard CORS;
- [x] documentar instalação, hardening, restart/rotation e reconnect esperado;
- [x] validar estaticamente os artefatos e registrar o resultado sem fechar o
      deployment público.

### Review - deployment operacional do companion

- `deploy/companion/relay.env.example` fixa bind em `127.0.0.1`, porta explícita
  e uma origem HTTPS única; a checagem rejeita wildcard CORS.
- [`deploy/companion/README.md`](../deploy/companion/README.md) documenta o
  layout real do tarball, instalação do unit/env com modos não executáveis,
  health check, rotação e o reconnect que exige novo pairing após restart.
- `deploy/companion/cate-relay.service.example` passou `systemd-analyze verify`
  em cópia temporária `.service` no Ubuntu/WSL; a unidade usa usuário dedicado,
  `NoNewPrivileges`, filesystem protegido, famílias de endereço limitadas e
  restart bounded.
- O Caddyfile público foi restringido a `/health` e `/v1/channels/*`; a criação
  de canais permanece no desktop pareado, reduzindo a superfície de emissão.
- `caddy validate --adapter caddyfile` retornou `Valid configuration`; o Caddy
 continua sendo a fronteira TLS e o relay permanece loopback-only.
- `npm run verify:companion-deployment` passou; o contrato estático agora roda
 também no build de cada runner da CI.
- `npm run verify:hygiene` terminou com exit 0 após os artefatos de deployment;
 typecheck, lint, Vitest serializado, build e companion permaneceram verdes.
- Parser YAML/contrato da CI confirmou a matriz completa de três sistemas, o
  smoke de deployment e os dois passos de performance POSIX.
- O deployment público, certificado operacional, gestão do usuário/grupo e
  reconnect em rede não-loopback continuam dependentes do operador.

## Plano de retomada - 2026-09-04 (smoke tmux POSIX)

- [x] criar um smoke real e autocontido para sessão tmux, cliente PTY,
      desconexão, sobrevivência e teardown;
- [x] adicioná-lo à matriz CI nativa macOS/Linux com instalação explícita do
      tmux quando necessário;
- [x] executar no host disponível, limpar todos os recursos e registrar a
      evidência sem fechar a validação de hosts externos.

### Review - smoke tmux POSIX

- `scripts/verify-tmux-live.mjs` usa um socket e uma sessão `cate-*` temporários,
  cria o pane com `tmux`, conecta um cliente por PTY real (`python3` +
  `pty.fork()`), envia detach, confirma que a sessão e o processo sobreviveram
  e mata a sessão/socket no teardown.
- `npm run test:tmux:live` passou no Ubuntu/WSL (`tmux 3.4`) e limpou o diretório
  temporário; no Windows retornou o skip POSIX esperado.
- O workflow instala `tmux` no runner Linux (ou via Homebrew no macOS quando
  ausente) e executa o smoke em ambos os runners nativos. A execução pública da
  CI e a repetição em Linux fora do WSL/macOS continuam pendentes.

- `npm run verify:hygiene` também terminou com exit 0 depois da inclusão do
  smoke; o gate não deixou processos do Vitest, Electron ou runtime ativos.

## Plano de retomada - 2026-09-04 (contratos no workflow de release)

- [x] executar os contratos de fronteira do repositório e deployment no job de release antes do build;
- [x] validar a estrutura YAML e os gates localmente sem disparar publicação;
- [x] registrar o resultado e manter pendentes os passos que exigem CI pública ou operador.

### Review - 2026-09-04 (contratos no workflow de release)

- `.github/workflows/release.yml` executa `verify:repository-boundaries` e
  `verify:companion-deployment` em cada runner, após `npm ci` e antes do build.
- O parser YAML confirmou os dois gates antes de `Build app` e preservou a
  validação posterior de metadados/checksums.
- Os dois verificadores passaram localmente; `git diff --check` também passou.
- O `npm run verify:hygiene` completo passou e a checagem posterior confirmou
  que não restaram processos do gate.
- Nenhum release foi disparado; CI pública, assinatura/publicação e deployment
  operacional permanecem pendentes por dependerem de autoridade externa.

## Plano de retomada - 2026-09-04 (contrato versionado do workflow de release)

- [x] criar verificador determinístico da estrutura do workflow de release;
- [x] executá-lo na CI e antes dos builds matriciais de release;
- [x] validar o verificador com o YAML atual e registrar a evidência.

### Review - 2026-09-04 (contrato versionado do workflow de release)

- `scripts/verify-release-workflow.mjs` valida jobs obrigatórios, matriz macOS/
  Linux/Windows, ordem dos gates antes do build, metadados antes do upload e
  dependências dos tarballs runtime/pi e da publicação.
- `npm run verify:release-workflow` passou; o lint focalizado, as fronteiras
  do repositório, typecheck e `git diff --check` também passaram.
- O contrato foi conectado aos workflows de CI e release após `npm ci`; o gate
 completo de higiene passou e não deixou processos ativos.

## Plano de retomada - 2026-09-04 (commit e push da implementação)

- [x] revisar o escopo atual e os checks antes do stage;
- [x] criar um commit único com a implementação e documentação pendentes;
- [x] enviar a branch `product/agent-canvas` para `origin`;
- [x] confirmar o SHA remoto e registrar o resultado sem publicar uma release.

### Review - 2026-09-04 (publicação inicial no openCate)

- O clone shallow foi completado a partir do repositório de origem para
  incluir o pai ausente do histórico; `git fsck --full --no-dangling` passou.
- O commit `b4cf963f20e69ba79ae9408d5a334eb97bfd75e1` foi enviado com sucesso
  para `VIDORETTO/openCate` em `product/agent-canvas`.
- A branch remota foi confirmada pelo SHA; nenhuma release ou tag foi criada.

## Plano de retomada - 2026-09-04 (renomeação do produto para openCate)

- [x] mapear ocorrências rastreadas de `openCate/cate` e separar identidade pública,
  nomes técnicos e compatibilidade legada;
- [x] atualizar a identidade pública do produto para `openCate`, incluindo
  metadados, URLs, documentação e superfícies visíveis;
- [x] validar que o código continua compilando e que só permanecem referências
  técnicas/legadas justificadas;
- [x] registrar a revisão e deixar explícito o estado de publicação da mudança.

### Review - 2026-09-04 (renomeação do produto para openCate)

- A identidade pública foi atualizada para `openCate`: metadados npm/Electron,
  App ID, URLs do repositório, logos, título, textos visíveis, documentação,
  workflows e nomes dos artefatos de distribuição.
- O CLI canônico agora é `opencate`, com launchers `opencate`/`.cmd` e o
  alias `cate` preservado para instalações e automações existentes. O runtime
  usa `opencate/` como layout novo e ainda encontra `cate/` legado.
- `.cate`, `CATE_*`, `cate.*`, `cate-runtime://` e identificadores internos foram
  mantidos como contratos técnicos/compatibilidade. `NOTICE.md` e as URLs do
  repositório externo `0-AI-UG/cate-extensions` também permanecem por origem e
  integração, respectivamente.
- Validações concluídas: typecheck, lint, suíte completa serializada,
  `verify:hygiene`, build desktop, build/test/package do companion, verificações
  de release/deployment/boundaries, bundle runtime e tarball Windows.
- A renomeação foi consolidada no commit `6a9f4c76d0a4c9ca23c193a43f9ec011a3c29ab7`
  (`chore: rename product to openCate`) e enviada com sucesso para
  `VIDORETTO/openCate` em `product/agent-canvas`; o SHA remoto foi confirmado.
- Nenhuma release ou tag foi criada; o working tree ficou limpo após o push.
