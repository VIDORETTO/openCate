# Estrutura do repositório

## Visão de alto nível

| Caminho | Responsabilidade | Regra de dependência |
|---|---|---|
| `src/shared/` | Tipos, contratos, normalizadores e lógica pura compartilhada | Não importar Electron, React ou assets do renderer |
| `src/main/` | Processo Electron principal, IPC, persistência, janelas e integrações nativas | Pode usar Node/Electron; não renderiza UI |
| `src/preload/` | API mínima e tipada exposta via `contextBridge` | Não vazar `ipcRenderer` cru |
| `src/renderer/` | React, canvas, painéis, sidebar, stores e interação | Usar `window.electronAPI` para atravessar o processo |
| `src/runtime/` | Daemon Node independente para PTYs, arquivos, Git, busca e hooks | Não importar Electron ou componentes React |
| `src/cateAgent/` | Agente embutido, chats, extensões e orquestração | Reutilizar contratos de `src/shared/` |
| `src/skills/` | Instalação, catálogo e gestão de skills | Manter alvos declarados no registro compartilhado |
| `src/cli/` | Comandos da CLI `cate` e formatação de resultados | Usar somente APIs públicas/contratos tipados |
| `src/test/` | Fixtures e utilitários compartilhados de teste | Não virar depósito de lógica de produção |
| `e2e/` | Cenários Playwright de janela real | Artefatos temporários devem ser ignorados |
| `docs/` | Arquitetura, ADRs, estrutura e manutenção | Decisões comportamentais devem ter ADR quando necessário |
| `research/` | Pesquisas e análises comparativas | Registrar data e separar fatos de hipóteses |
| `tasks/` | Backlog funcional e lições operacionais da execução | Atualizar o ponto de retomada após cada fatia validada |

## Arquivos de entrada importantes

- `src/main/index.ts` — bootstrap do processo principal e registro dos handlers.
- `src/preload/index.ts` — superfície pública do bridge.
- `src/renderer/App.tsx` — composição principal do renderer.
- `src/shared/types.ts` — tipos de estado e contratos transversais existentes.
- `src/shared/ipc-channels.ts` — nomes canônicos dos canais IPC.
- `src/runtime/index.ts` — entrada do daemon independente.
- `package.json` — scripts e dependências.

## Persistência e artefatos gerados

- `<projeto>/.cate/workspace.json` — layout compartilhável do workspace.
- `<projeto>/.cate/session.json` — estado local da máquina, sessões e preferências de painéis.
- `<projeto>/.cate/memory.json` — notas curadas por projeto/worktree, com citações explícitas.
- `dist/`, `dist-runtime/`, `release/` e `build/` — saídas de build/empacotamento.
- `test-results/`, `cate-daemon-ws-*` e `cate-exte2e-*` — resíduos ou saídas temporárias de testes.
- `tasks/todo.md` e `tasks/lessons.md` — controle de continuidade do produto, versionado junto ao código.

Arquivos gerados não devem ser movidos para `src/`, `docs/` ou `research/`.
Quando uma execução deixar resíduos, a limpeza deve usar caminhos exatos e
validar que nenhum processo ainda os mantém abertos.

## Regras para novos módulos

1. Comece pelo contrato puro em `src/shared/` se mais de um processo consumir o dado.
2. Coloque validação de entrada junto ao contrato; o main deve validar novamente antes de persistir.
3. Para persistência de projeto, separe o store do main, o bridge/preload e o store do renderer.
4. Coloque testes unitários junto ao módulo e adicione teste de conformance quando houver IPC.
5. Evite arquivos genéricos como `utils.ts`; dê ao helper um nome que expresse seu domínio.
6. Não divida arquivos grandes apenas por estética: primeiro identifique uma fronteira de responsabilidade e cubra-a com teste.
