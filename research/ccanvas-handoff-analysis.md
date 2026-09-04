# Handoff — Análise profunda do openCate × ccanvas e plano de absorção

Data: 2026-08-29
Status: Aguardando análise por agente de maior capacidade (ChatGPT 5.6 Sol, modo high).

## Para quem é este documento

Este documento é um **handoff de análise**. Ele conta a história do projeto,
descreve o estado atual do openCate, resume o que já foi comparado com o
[ccanvas](https://github.com/DevoidSloth/ccanvas) e define exatamente o que
queremos que o próximo agente analise e produza.

**Regra para o agente: NÃO alterar nada.** Não editar código, não criar
branches, não commitar, não instalar nada. O produto deste trabalho é um
relatório de análise + plano priorizado de implementação. Edições só acontecem
em um ciclo seguinte, após aprovacao humana deste relatório.

## Contexto do produto

O projeto é um fork/produto (branch `product/agent-canvas`) sobre o **openCate**
(MIT, Electron, TypeScript) com o objetivo: canvas infinito com terminais,
painéis flutuantes (terminal, editor, browser, documento), agentes CLI como
Codex/Claude rodando ao lado, subagentes, worktrees, durabilidade de sessão e
perspectiva de trabalho remoto/cloud.

A decisão de base está formalizada em `docs/adr/0001-base-cate.md` e a matriz
completa de análise comparativa (openCate vs Paseo vs Claude Squad vs Nimbalyst vs
TermCanvas) está em `research/project-analysis.md`. O roadmap executável fica
em `tasks/todo.md`. Próximos rumos já investigados: browser automation
(`research/browser-agent-architecture.md`) e openCate Cloud (`plan.md`).

## Estado atual do nosso projeto

- Branch: `product/agent-canvas` (últimas implementações antes deste doc).
- Últimos marcos (git log recente):
  - `feat(agents): visualize explicit context deliveries` — arestas de
    contexto visual entre agentes no canvas
    (`src/renderer/canvas/AgentContextEdgesOverlay.tsx`).
  - `feat(agents): capture terminal file and diff context` — captura de
    contexto (arquivo/diff) do terminal.
  - `feat(memory): persist project and worktree notes` — notas por projeto e
    worktree (`src/shared/projectMemory.ts`).
  - `refactor(agents): centralize lifecycle state vocabulary`,
    `feat(agents): add visible-screen fallback`,
    `refactor(agents): centralize resume readiness`.
- Já existentes no openCate (não reimplementar):
  - Integração multi-agente via barramento de hooks
    (`src/shared/agentHooks.ts`, `src/runtime/capabilities/agentHooks.ts`):
    eventos de sessão (turn-start/end/idle), permissões, `transcriptPath` por
    sessão — para Claude, Codex, Cursor, Pi, Grok, Gemini, Copilot.
  - FSM de status de agente + fila "Needs attention" na sidebar
    (`src/renderer/sidebar/workspaceDigest.ts`, `useWorkspacePanelTree.ts`).
  - Composer de broadcast de agentes
    (`src/renderer/canvas/GlobalAgentComposer.tsx`,
    `src/renderer/lib/agent/codingAgentBroadcast.ts`).
  - Worktrees/territórios visuais, dock zones, janelas dedicadas, extensões +
    `cate-cli`, browser panels com automação, documentos PDF/docx, Monaco,
    xterm com WebGL, persistência JSON manual, SSH/WSL remoto.
  - Suíte de testes: ~3.082 aprovados, 70 skips (vitest).

## O projeto ccanvas (objeto da análise)

- Repositório: `https://github.com/DevoidSloth/ccanvas` (Apache-2.0,
  v0.5.1, 12 commits, ~14 estrelas, ~15k linhas, autor único).
- Stack: Vite + React + TS + Zustand + xterm + Monaco + **Tauri 2 (Rust)**.
  O mesmo frontend roda como app desktop (Tauri) ou navegador com server
  node-pty opcional (WebSocket).
- Escopo: **focado em Claude Code** — widget de agente é um terminal com
  `claude` rodando; transcrição lida do JSONL em
  `~/.claude/projects/<slug>/<sessionId>.jsonl`.
- Arquitetura mapeada (durante leitura completa do repositório):
  - `src/lib/flow.ts` — engine de "logic arrows" (orquestração executável).
  - `src/lib/transcript.ts` — parser de sessão JSONL do Claude (última
    mensagem do modelo, arquivos tocados, turnos legíveis).
  - `src/lib/tracker.ts` — câmera de rastreamento com órbita de viewers.
  - `src/lib/checkpoints.ts` — checkpoints git via `git stash create` +
    `refs/ccanvas/cp/<id>` (metadados em localStorage).
  - `src/lib/agents.ts` — status por heurística de scraping do tail
    (PROMPT_HINTS) + transporte (registro de sessões vivas, broadcast).
  - `src/store/workspace.ts` — store única Zustand, serializada em `.ccnvs`.
  - `src/canvas/` — camada vetorial (setas com âncoras, curvas, retângulos,
    elipses, frames, freehand), estado de pan/zoom.
  - `src/widgets/` — 17+ widgets: terminal, agente, transcript, file tree,
    diff, editor (Monaco), doc markdown, log tail, runner, data (CSV/Parquet
    via hyparquet), figura, SQL, web preview (URL/HTML live-reload), note,
    e widgets GitHub via `gh` (PR, issues, actions/CI).
  - `src-tauri/src/pty.rs` — PTY in-process Rust (portable-pty/ConPTY) com
    re-anexação por id de widget e replay de scrollback (cap 1MiB).
  - Recursos de UX: palette de comandos (⌘K), search fuzzy do canvas (⌘F),
    quick-insert (`Space`, `/nome`), minimap, tabs de `.ccnvs` por pasta,
    roster de agentes (status/custo/turns/última linha + composer),
    prompt library, apresentação, export PNG/SVG, layout templates.

## O que já foi decidido na leitura comparativa (resumo do estado da arte)

1. **Manter o openCate como base.** O ccanvas é um protótipo com UX muito boa, mas
   infraestrutura inferior: status de agente por heurística de terminal
   (frágil), Claude-only, metadados em localStorage, sem testes, 1 autor.
2. **NÃO adotar** do ccanvas: scraping-heurístico de status (substituir pelos
   hooks/FSM do openCate), persistência em localStorage, troca de Electron por
   Tauri (Electron é justificado por webview/browser automation e isolamento
   de extensões), duplicação de coisas que o openCate já tem.
3. **Candidatos a portar** (prioridade preliminar):
   - P1 `flow engine` — logic arrows com condições (finish/success/failure/
     match + regex), pipe `{{output}}` da última mensagem do modelo, joins
     `all/any`, dedupe por turno, trava anti-runaway. Gatilho deve ser o
     turn-end do barramento de hooks do openCate (mais confiável que o tail do
     terminal). Integração: `AgentContextEdgesOverlay.tsx` (arestas visuais
     já existem) + `agentHooks.ts` + transporte PTY existente.
   - P1 `checkpoints` — `git stash create` + pin em `refs/cate/cp/<id>`,
     restore via `git checkout <sha> -- .` (não-destrutivo), diff-stat e
     label/timestamp/branch. A capability de git já existe no openCate
     (`src/runtime/capabilities/vcs.ts`).
   - P2 `transcript widget` — visão limpa da conversa da sessão (texto +
     chips de tools), seguindo ao vivo. Generalizar o parser do ccanvas para
     todas as fontes que o openCate já coleta via `transcriptPath`/`sessionFile`.
   - P2 `tracking camera` — órbita de viewers para arquivos tocados (só após
     os dois primeiros; requer posicionamento no canvas + enquadrar câmera).
   - P3 `camada de desenho` (freehand, setas com âncoras/curvas, frames,
     notes) + `search fuzzy do canvas` + `quick-insert` — maior mudança
     estrutural; avaliar se cabe no modelo de canvas atual do openCate.
   - P3 widgets de dados (CSV/Parquet/SQL/plot) e widgets `gh` (PR/CI).

## Perguntas abertas para o agente responder

1. O ccanvas tem alguma característica que muda a estratégia de produto do
   openCate (não apenas de implementação)? Por quê?
2. O flow engine deve ser um recurso de **usuário** (usuário desenha setas)
   ou um contrato de **API/agent** (openCate CLI/agente define edges)? O ccanvas
   é desenhável; revisar qual o custo de cada abordagem no modelo atual.
3. Existe risco de incompatibilidade do `on success/failure` com agentes que
   não terminam com sentinelas confiáveis? Como garantir sinal confiável por
   agente (a resposta do openCate parece ser: hooks `session.idle` + transcript).
4. Onde a órbita da tracking camera conflita com worktrees/territórios
   existentes e com a abertura de arquivos por painel?
5. Qual a ordem correta de fatia vertical considerando o roadmap já existente
   em `tasks/todo.md`? (Flow engine exige conversa/status; checkpoints
   exige git; transcript/tracker exige path de sessão por agente.)

## Instruções para o agente executor

- **NÃO modificar código.** Produzir apenas análise + plano.
- Saída esperada (in Portuguese, em arquivo novo em `research/` ou no
  relatório final):
  1. Inspeção do estado atual do openCate no branch `product/agent-canvas`
     (ler, rodar `bun run test` quando útil para medir baseline — nunca
     instalar/alterar).
  2. Leitura completa do ccanvas (clonar em pasta temporária; repositório é
     pequeno: ~15k linhas).
  3. Comparação feature-by-feature com foco nas 5 áreas acima + resposta às
     perguntas abertas.
  4. Plano priorizado de implementação (fatias verticais, pontos de
     integração com arquivos/linhas do openCate, riscos, estimativa relativa).
  5. Veredito: continuar no openCate e portar; ou mudar alguma frente (e por
     quê).
- Critério de sucesso da análise: um leitor com o "contexto do produto"
  acima consegue tomar a decisão de priorizar sem reabrir os dois
  repositórios.
