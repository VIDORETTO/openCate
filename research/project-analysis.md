# Análise comparativa — Canvas infinito para agentes CLI

> Registro histórico da análise de seleção da base do produto, realizada em
> 2026-08-23. Os clones usados na comparação eram temporários; este documento
> é a cópia versionada que mantém a decisão reproduzível dentro do repositório.

## Requisitos avaliados

1. Canvas infinito/zoomável e organização espacial.
2. Terminais reais redimensionáveis com persistência de layout e scrollback.
3. Execução de agentes CLI no terminal.
4. Múltiplos agentes em paralelo.
5. Nomeação, tags e descoberta de terminais.
6. Contexto/controlado compartilhado entre terminais.
7. Visibilidade de subagentes e orquestração.
8. Worktrees/Git.
9. Durabilidade de sessão.
10. Extensibilidade, CLI/API, remoto/mobile.
11. Comunidade, atividade e licença compatível com fork.

## Matriz resumida

| Projeto | Stars | Licença | Linguagem | Último push | Força principal | Limite para este produto |
|---|---:|---|---|---|---|---|
| **Cate** | 2.088 | MIT | TypeScript | 2026-08-23 | Canvas IDE completo com terminais, editor, browser, agentes e subagentes | Menos maduro em fila de atenção, telemetria rica e companion mobile |
| Paseo | 14.764 | AGPL-3.0 | TypeScript | 2026-08-23 | Daemon multiplataforma, CLI, SDK, relay, mobile/web | Canvas não é o núcleo e AGPL restringe fork fechado |
| Claude Squad | 8.355 | AGPL-3.0 | Go | 2026-08-20 | tmux + git worktrees + TUI simples | Sem canvas gráfico |
| Nimbalyst | 1.550 | MIT | TypeScript | 2026-08-23 | Sessões/tasks kanban, editores visuais, mobile, diffs | Canvas livre não é o centro do produto |
| TermCanvas | 389 | MIT | TypeScript | 2026-05-31 | Canvas dedicado, Hydra, telemetria, replay, headless | Menor adoção/atividade e menos ecossistema geral |

## Avaliação detalhada

### Cate — base recomendada

Evidências na codebase:

- `src/renderer/stores/canvasStore.ts` e slices em `canvas/`: viewport, zoom, seleção, histórico, placement, navegação, arranjo e sanitização de restore.
- `src/renderer/canvas/Canvas.tsx`, `CanvasNode.tsx`, `Minimap.tsx`, `SnapGuides.tsx`: canvas real, não mock.
- `src/renderer/lib/terminal/`: driver, lifecycle, registry, scrollback, keymap, links, busca e captura de buffer.
- `src/main/ipc/terminal.ts`: PTY gerenciado no processo main.
- `src/shared/types.ts`: painéis, canvas aninhado, sessão, worktree, rename e configurações.
- `src/cateAgent/extensions/cate-subagent`: planner/scout/worker.
- `src/cateAgent/extensions/cate-orchestrator` e `cate-canvas-mode`: modos de orquestração e controle do canvas.
- `src/renderer/canvas/worktree/`: territórios visuais por worktree.

Conclusão: melhor ponto de partida porque evita reconstruir o núcleo mais difícil e caro.

### TermCanvas — maior fonte de UX operacional

Ideias aproveitáveis:

- Status dot por terminal: working, waiting, idle, done.
- Heatmap/sparkline de atividade.
- Pan para atividade mais recente.
- Fila/digest de atenção.
- Stash com PTY vivo.
- Star/filtro e ciclo de foco.
- Waypoints e snapshot history.
- Composer para prompt único ou broadcast.
- Replay/resume de sessões Claude/Codex.
- Hydra: contrato de dispatch em arquivos, `result.json` como gate, retry/watch/cleanup.
- Headless HTTP/SSE e runtime em container.

Cuidado: projeto tem apenas 389 stars e último push em maio; usar como inspiração de features, não como base.

### Paseo — melhor plataforma distribuída

Ideias aproveitáveis:

- Daemon separado do client.
- WebSocket API, CLI, SDK e MCP.
- Execução remota/self-hosted.
- Relay E2E opcional.
- Mobile/desktop/web acessando o mesmo estado.
- Skills de handoff/advisor/committee para orquestração.

Cuidado: licença AGPL-3.0 e foco em orquestração, não canvas.

### Nimbalyst — melhor camada colaborativa visual

Ideias aproveitáveis:

- Kanban de sessões e tarefas.
- Link bidirecional sessão <-> arquivo.
- Diff WYSIWYG com aprovação/rejeição.
- Extensões através de contrato comum.
- Mobile para acompanhar e responder agentes.

Cuidado: editor visual/documento é central; canvas livre não substitui o núcleo do Cate.

### Claude Squad — melhor modelo de isolamento simples

Ideias aproveitáveis:

- Uma instância = worktree + tmux session + programa.
- Checkout/pause/resume.
- Perfis nomeados de programa/agente.
- Preview e diff junto à instância.

Cuidado: TUI sem canvas e AGPL-3.0.

## Arquitetura alvo proposta

```text
Renderer React
├─ Canvas engine (nós, viewport, minimap, territórios, arestas de contexto)
├─ Panel host (terminal, editor, browser, documento, chat, dashboard)
├─ Agent observability (status, tokens, subagentes, fila de atenção)
└─ Workspace stores (Zustand + JSON persistente)

Electron Main
├─ PTY manager
├─ Git/worktree manager
├─ Session/store persistence
├─ Secure IPC/preload
└─ Runtime adapters

Serviço opcional
├─ Headless daemon
├─ WebSocket/CLI/SDK
├─ Remote/container runtime
└─ Relay E2E opcional
```

## Riscos principais

1. **Windows:** Cate usa scripts Bash, Electron, `node-pty` e runtime embutido; precisa validação imediata.
2. **Compatibilidade de agentes:** hooks variam por versão; exigir contratos testáveis e fallback.
3. **Contexto entre terminais:** compartilhar tudo cria ruído, custo e risco; usar seleção/contrato explícito.
4. **Performance:** muitos xterm WebGL + canvas podem degradar; manter culling e medir cedo.
5. **Escopo:** priorizar fatias verticais usáveis em vez de reimplementar todas as ideias de uma vez.

## Critério de sucesso

Um usuário abre um projeto, cria vários terminais nomeados com agentes diferentes, vê estados e subagentes, envia contexto selecionado entre eles, acompanha diffs/worktrees, fecha e restaura tudo sem perder processo, scrollback ou layout — no Windows, macOS e Linux, com CLI/headless opcional.

## Baseline da análise original

- Branch do produto: `product/agent-canvas`.
- Commit inicial da fatia vertical: `d6ed840 feat: persist starred, tags and accent color for terminals`.
- A decisão de base está formalizada em [`docs/adr/0001-base-cate.md`](../docs/adr/0001-base-cate.md).
- O estado atual e o próximo item executável ficam registrados em [`tasks/todo.md`](../tasks/todo.md) dentro deste repositório.
