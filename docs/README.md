# Documentação do openCate

Este diretório concentra a documentação técnica e as decisões de arquitetura.

## Mapa

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — modelo de processos, IPC, persistência, segurança e limites conhecidos.
- [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) — responsabilidades das pastas e regras para adicionar novos módulos.
- [`CLI_SDK.md`](CLI_SDK.md) — comandos de projeto e uso do SDK TypeScript.
- [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) — achados confirmados, correções e revisão manual de segurança/privacy.
- [`adr/0002-runtime-durability-and-remote-boundaries.md`](adr/0002-runtime-durability-and-remote-boundaries.md) — limites aceitos para tmux, containers, companion e relay.
- [`CONTAINER_RUNTIME.md`](CONTAINER_RUNTIME.md) — contrato e limites do runtime em Docker/Podman.
- [`COMPANION_AND_RELAY.md`](COMPANION_AND_RELAY.md) — protocolo companion e relay self-hosted.
- [`PRIVACY_DRAFT.md`](PRIVACY_DRAFT.md) — comportamento técnico de telemetria e decisões ainda pendentes.
- [`RELEASE_CANDIDATE.md`](RELEASE_CANDIDATE.md) — checklist de migração, gates e aprovação de RC.
- [`USER_GUIDE.md`](USER_GUIDE.md) / [`USER_GUIDE.en.md`](USER_GUIDE.en.md) — primeiros passos e uso diário em português e inglês.
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — diagnóstico de instalação, terminais, runtime remoto e validação.
- [`adr/`](adr/) — decisões arquiteturais registradas e suas consequências.
- [`maintenance/hygiene-backlog.md`](maintenance/hygiene-backlog.md) — backlog de higiene, manutenção e refatorações graduais.
- [`../research/`](../research/) — análises comparativas e pesquisas técnicas.
- [`../tasks/todo.md`](../tasks/todo.md) — backlog funcional e ponto de retomada da próxima sessão.
- [`../tasks/lessons.md`](../tasks/lessons.md) — aprendizados operacionais e regras para evitar regressões no processo.
- [`../plan.md`](../plan.md) — desenho separado para a futura camada openCate Cloud.

## Convenções

- Código de domínio compartilhado fica em `src/shared/`.
- Acesso nativo, persistência e handlers IPC ficam em `src/main/`.
- A ponte segura entre Electron e renderer fica em `src/preload/`.
- UI, hooks, stores e integrações de apresentação ficam em `src/renderer/`.
- O daemon sem Electron fica em `src/runtime/`.
- Testes permanecem próximos do módulo que validam, com E2E em `e2e/`.
- Dados locais do usuário (`.cate/`, `dist/`, `test-results/` e diretórios temporários) não são documentação nem fonte versionada.
