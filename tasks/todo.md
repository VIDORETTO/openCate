# Backlog — Canvas de Agentes CLI e Terminais

## Decisão atual

- **Base escolhida:** [`0-AI-UG/cate`](https://github.com/0-AI-UG/cate).
- **Motivo:** maior aderência ao produto desejado, canvas infinito/zoomável nativo, painéis de terminal/editor/browser/documento, agentes CLI integrados, subagentes, orquestrador, worktrees, sessões persistentes e licença MIT.
- **Clone local:** `C:\Users\gabri\Documents\cate`.
- **Estratégia:** manter a arquitetura do Cate e absorver as melhores ideias de TermCanvas, Paseo, Nimbalyst e Claude Squad sem quebrar os contratos existentes.

## Fase 0 — Baseline e governança

- [x] Criar branch própria de produto a partir do snapshot clonado.
- [x] Registrar upstream original, licença MIT e créditos em `NOTICE.md` ou equivalente.
- [x] Rodar `bun install`, runtime tarball e `typecheck` no Windows; documentar falhas específicas.
- [x] Rodar `test` no Windows e registrar baseline: 3.007 aprovados, 0 falhas, 70 skips.
- [x] Rodar `lint` (0 erros / 22 avisos herdados) e `build` com sucesso.
- [x] Corrigir baseline Windows: isolamento de localStorage, symlinks não suportados, home real em teste e escopo do daemon local.
- [ ] Rodar app em modo desenvolvimento e registrar smoke test manual.
- [x] Criar ADR curto confirmando Cate como base e listando integrações prioritárias.
- [ ] Definir novo nome, identidade visual e metadados de empacotamento.
- [ ] Configurar CI com lint, typecheck, unit tests e build em Windows, macOS e Linux.

## Fase 1 — Estabilização da fundação

- [x] Auditar dependências nativas: Electron, `node-pty`, xterm WebGL, watcher e runtime embutido.
- [x] Corrigir scripts incompatíveis com Windows sem remover suporte Unix (commit `7eacf7b`).
- [x] Adicionar teste E2E mínimo: abrir projeto, criar terminal, redimensionar nó, salvar/restaurar canvas (commit `c36b570`).
- [x] Adicionar teste E2E de múltiplos canvases e janelas destacadas (commit `454e5e9`).
- [x] Documentar modelo de processos, IPC, persistência e limites de segurança (commit `2044a6f`).

## Fase 2 — Canvas e terminais de referência

- [ ] Nome customizado por terminal com atalho rápido e persistência.
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
- [ ] Lembrar tamanho preferido por tipo de agente, projeto e worktree.
- [x] Melhorar cadeia de foco: zoom-to-fit, próximo/anterior, ciclo por estrela/worktree.
- [x] Implementar "stash": ocultar tile mantendo PTY vivo e indicador de atividade.
- [x] Adicionar fila de atenção para terminais aguardando input ou concluídos.
- [x] Adicionar heatmap/sparkline de atividade recente por tile.
- [x] Criar status digest compacto com os sinais mais relevantes do canvas.
- [ ] Suportar waypoints nomeados e salto rápido por região.
- [ ] Permitir anotações, setas e agrupamentos visuais fora dos painéis.
- [ ] Snapshot histórico do layout com rollback além do undo local.
- [ ] Garantir desempenho com 50+ nós, culling correto e scrollback preservado.

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
- [x] Criar composer global para um prompt, seleção múltipla, broadcast controlado e tradução opcional de slash commands na primeira versão (commit `e6880b1`); a superfície alcança apenas missões Cate-owned com follow-up suportado.
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
- [ ] Implementar contrato de tarefa em disco: objetivo, restrições, resultado validado, logs e artefatos.
- [ ] Adicionar grafo de dependência entre tarefas com paralelização segura.
- [ ] Adicionar retry, timeout, health check e aprovação humana nos pontos críticos.
- [ ] Registrar auditoria de quem enviou contexto, prompt ou comando a cada agente.

## Fase 5 — Worktrees, Git e durabilidade

- [ ] Criar território visual automático por worktree.
- [ ] Um clique para criar worktree + terminal + agente + tarefa inicial.
- [ ] Inline diff card por agente com aprovação seletiva por hunk ou arquivo.
- [ ] Fila de merge/conflito com checks antes de integrar trabalho.
- [ ] Commit assistido, geração de mensagem, criação de PR e checklist de revisão.
- [ ] Backend opcional de durabilidade com tmux onde disponível.
- [ ] Reconstruir sessão após restart sem matar processos remotos/desanexados.
- [ ] Preservar scrollback, título, tags, geometria e estado do agente por sessão.

## Fase 6 — Plataforma, daemon e acesso remoto

- [ ] Separar serviço headless opcional do desktop.
- [ ] Expor API WebSocket/HTTP com autenticação local primeiro.
- [ ] Criar CLI com paridade: projetos, terminais, agentes, tarefas, contexto, diffs e resultados.
- [ ] Publicar SDK TypeScript para automação e integrações.
- [ ] Reforçar caminho SSH/WSL existente com telemetria e reconexão estáveis.
- [ ] Adicionar runtime remoto/container com workspace montado e segredos isolados.
- [ ] Notificações nativas quando agente pedir input, terminar ou falhar.
- [ ] Companion mobile/web somente leitura primeiro, depois respostas aprovadas.
- [ ] Relay E2E opcional e self-hosted; nunca exigir conta para uso local.

## Fase 7 — Qualidade, segurança e release

- [ ] Suite de contratos para cada adaptador de agente.
- [ ] Testes de concorrência: muitos PTYs, eventos simultâneos e restore de sessão.
- [ ] Testes de performance: pan/zoom, resize, 50+ terminais e canvas aninhado.
- [ ] Revisão de segurança: IPC, path traversal, comandos injetados, credenciais, webviews e runtime remoto.
- [ ] Auditoria de privacidade: sem telemetria obrigatória e dados sensíveis fora de logs.
- [ ] Empacotar Windows, macOS e Linux com auto-update seguro.
- [ ] Documentação de usuário em português e inglês.
- [ ] Guia de contribuição, arquitetura e troubleshooting.
- [ ] Release candidate com checklist de migração a partir de workspaces do Cate.

## Próximos passos imediatos

> **INSTRUÇÃO PARA PRÓXIMA SESSÃO DE IA:** O repositório do produto está em `C:\Users\gabri\Documents\cate`. A **Fase 1** está concluída (`7eacf7b`, `c36b570`, `454e5e9`, `2044a6f`). Os itens 1–6 da **Fase 4** também estão concluídos (`647d60e`, `21dc550`, `0a59817`, `089bf25`, `0595375`, `f6bcdbe`). Na **Fase 3**, o registro declarativo, o fallback hooks+tela e a taxonomia canônica de estados já estão concluídos (`29a0595`, `f559e01`, `de654f8`). A memória por projeto/worktree também está concluída (`9f370a6`). A sessão mais recente parou antes de implementar o contrato de tarefa em disco; a próxima tarefa funcional é objetivo, restrições, resultado validado, logs e artefatos. A organização documental/higienização de baixo risco já foi aplicada no repositório: leia `docs/README.md`, `docs/PROJECT_STRUCTURE.md` e `docs/maintenance/hygiene-backlog.md` antes de novas refatorações. Não compartilhar scrollback implicitamente; novas relações devem nascer apenas de seleção/contrato explícito e entrega confirmada.

### Ponto de parada confirmado — 2026-08-27

- **Pasta canônica:** `C:\Users\gabri\Documents\cate`.
- **Branch:** `product/agent-canvas`.
- **Último commit funcional:** `9f370a6 feat(memory): persist project and worktree notes`.
- **Estado do código:** nenhum arquivo versionado pendente; somente diretórios temporários de testes E2E podem existir localmente e agora estão cobertos pelo `.gitignore`.
- **O que foi interrompido:** a implementação do contrato de tarefa ainda não começou; a última execução estava em auditoria/desenho e foi interrompida antes de editar código funcional.
- **Ordem de retomada:** contrato compartilhado e normalização → persistência main/IPC/preload → store/UI do renderer → associação com missões/subagentes → testes focados → typecheck/lint/suíte completa → marcar o item no backlog.
- **Higienização concluída nesta sessão:** análise comparativa trazida para `research/project-analysis.md`, link do ADR corrigido, mapa de documentação criado, caminhos de skills corrigidos em `AGENTS.md`/`CLAUDE.md`, instruções de Bun/npm alinhadas e resíduos `cate-exte2e-*` adicionados ao ignore.

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

- O registro compartilhado agora declara também `screenFallback`; Aider é o único agente habilitado enquanto os demais permanecem hook-first. A identidade pode vir do processo monitorado ou de um lançamento Cate-owned confiável.
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
- Métricas de execução adicionadas para missões de agentes CLI (commit `191d201`): duração calculada com início/fim real e atualizada enquanto o processo está ativo; uso estruturado opcional (`inputTokens`, `outputTokens`, cache, total, custo reportado, modelo, contexto usado/janela) é normalizado a partir de payloads de hooks e persistido no `codingAgentRun` em `session.json`. O cartão do Cate Agent e os detalhes de `inspect`/`wait` mostram tokens, duração, contexto restante e custo; quando o CLI não reporta usage, a UI mostra `tokens unavailable`/`Unavailable` sem estimar a partir de texto. Pi agora envia usage/contexto disponível no evento `agent_end`. Verificação: typecheck, lint sem erros (**23 avisos herdados**) e suíte completa — **3.064 testes aprovados / 0 falhas / 70 skips**.
- Histórico unificado de sessões implementado na primeira versão (commit `f1918d9`): contrato canônico provider-neutral, índice machine-local em `.cate/agent-sessions.json`, registro idempotente a partir dos hooks, busca por metadados e conteúdo de transcripts conhecidos e replay somente leitura no Cate Agent. A chave composta inclui runtime, agente e sessão; caminhos de transcript são validados no processo principal e não são lidos diretamente pelo renderer. Retomada não é acionada pelo replay. A versão atual indexa sessões observadas enquanto o Cate está ativo; varredura retroativa global e leitura de transcripts externos em runtimes remotos ficam documentadas como próxima evolução. Verificação: typecheck passou; lint sem erros (**23 avisos herdados**); testes focados passaram; suíte completa terminou com **3.074 testes aprovados / 70 skips**, mas 2 suítes falharam em cleanup de infraestrutura no Windows (`extension-daemon.e2e.test.ts` por timeout do `afterAll` e `local-daemon-tarball.test.ts` por `EBUSY` ao remover diretório temporário).
- Composer global de agentes implementado na primeira versão (commit `e6880b1`): botão no toolbar do canvas, lista reativa de missões Cate-owned, seleção múltipla, confirmação obrigatória para broadcast, envio por driver com validação de prompt e tradução opt-in somente para `/status`, `/plan` e `/review`. Sessões arbitrárias de terminal, missões encerradas e CLIs sem follow-up ficam indisponíveis. Verificação: typecheck passou; lint sem erros (**23 avisos herdados**); testes focados — **36 aprovados / 0 falhas**; suíte completa — **3.080 aprovados / 70 skips / 0 falhas**.
- Perfis estruturados de lançamento implementados (commit `ad68522`): o registro canônico agora traduz modelo, níveis suportados de reasoning e posturas explícitas de permissão por agente; overrides e perfis nomeados aceitam essas preferências além de variáveis de ambiente adicionais. O ambiente é validado antes do spawn — chaves reservadas `CATE_*` são bloqueadas, valores com NUL são rejeitados e há limite de entradas/tamanho. A resolução mantém argv fechado, injeta permissões antes do prompt quando o agente define posição conhecida e usa `strictUnsupported: false` no spawn de produção para ignorar preferência não suportada sem quebrar o lançamento. Verificação: typecheck limpo; lint sem erros (**23 avisos herdados**); testes focados passaram; suíte completa — **3.082 aprovados / 70 skips / 0 falhas**.

### Review — Fase 1 (auditoria de dependências nativas)

| Componente | Pacote | Estado no Windows | Risco | Observações |
|---|---|---|---|---|
| Electron | `electron@41.2.0` | ✅ binário presente (`node_modules/electron/dist/electron.exe`) | Baixo | `patch-electron-name.sh` roda no `postinstall` via Git Bash; só afeta macOS (PlistBuddy), no-op no Windows exceto chmod de binários POSIX. |
| PTY | `node-pty@^1.0.0` (devDep) | ✅ prebuild `win32-x64/pty.node` presente | Médio | Carregado lazy no daemon (`src/runtime/capabilities/process.ts:142`). Runtime tarball já contém prebuild por target (`scripts/build-runtime-tarball.mjs:stageNodePty`). Empacotado via `asarUnpack`. |
| Terminal render | `@xterm/addon-webgl@^0.18.0` | ✅ JS puro (WebGL via browser) | Baixo | Budget de contexts gerenciado por `src/main/webglBudget.ts`; fallback DOM renderer quando budget excedido. |
| Watcher | `@parcel/watcher@^2.5.1` + `@parcel/watcher-win32-x64` | ✅ prebuild presente | Baixo | Usado apenas no daemon (`src/runtime/capabilities/fileWatcher.ts:26`); externalizado no esbuild bundle. |
| Ripgrep | `@vscode/ripgrep@^1.18.0` + `ripgrep-win32-x64` | ✅ binário `rg.exe` (5.4 MB) | Baixo | Daemon resolve via sibling do node (`daemonRgPath()`); tarball local `dist-runtime/cate-runtime-1.6.1-beta.2-win32-x64.tgz` presente (73 MB). |
| Runtime tarball | `cate-runtime-1.6.1-beta.2-win32-x64` | ✅ buildado em `dist-runtime/` | Baixo | Instalação local em `~/.cate/runtime/<ver>/<target>` ainda não criada (será criada no primeiro `bun run dev` ou smoke test). |
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
