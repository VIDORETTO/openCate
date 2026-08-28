# TO-DO DE HIGIENIZACAO E BOAS PRATICAS

Auditoria inicial: 2026-08-27. Os itens marcados foram resolvidos nesta
passagem de organização; os demais permanecem separados do backlog funcional
do produto.

## Prioridade 1 — Corrigir agora
- [x] Ignorar diretórios temporários `cate-exte2e-*` gerados por testes interrompidos.
- [x] Trazer a análise comparativa para `research/project-analysis.md` e corrigir o link do ADR.
- [x] Corrigir caminhos inválidos das skills em `AGENTS.md` e `CLAUDE.md`.
- [x] Documentar a estrutura vigente e os limites entre main, preload, renderer, runtime e shared.
- [x] Registrar no backlog operacional o ponto exato de retomada da próxima sessão.

## Prioridade 2 — Proxima etapa
- [ ] Decidir formalmente se o fluxo local deve usar Bun ou npm como gerenciador principal; manter o lockfile alternativo somente com justificativa documentada.
- [ ] Atualizar `AGENTS.md`, `CLAUDE.md` e `CONTRIBUTING.md` a partir de uma fonte comum ou validar a duplicação periodicamente.
- [ ] Dividir `WorkspaceTab.tsx` por responsabilidade (árvore, missões, ações e menus), preservando testes antes de cada extração.
- [ ] Dividir `src/preload/index.ts` em módulos por domínio sem alterar a superfície `window.electronAPI`.
- [ ] Criar smoke test manual documentado e um gate reproduzível para a inicialização do app em desenvolvimento.

## Prioridade 3 — Backlog tecnico
- [ ] Revisar fronteiras de `src/shared/types.ts` e separar contratos por domínio somente após mapear todos os consumidores.
- [ ] Reduzir `any` em integrações centrais sem quebrar os adapters de agentes e extensões.
- [ ] Auditar arquivos com mais de 900 linhas e extrair módulos apenas quando houver responsabilidade independente e cobertura suficiente.
- [ ] Configurar CI explícita para typecheck, lint, testes unitários, build e cenários E2E por sistema operacional.
- [ ] Fazer revisão de imports, nomes e comentários obsoletos após cada fatia funcional, evitando reformatar o repositório inteiro.

## Critério para fechar um item

Toda limpeza deve ter escopo pequeno, diff revisável, teste ou verificação
adequada e nenhuma alteração involuntária em contratos públicos, persistência,
autorização, integrações externas ou comportamento assíncrono.
