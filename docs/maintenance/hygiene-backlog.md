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
- [x] Formalizar Bun como fluxo local e npm como fluxo determinístico de CI/release; manter os dois lockfiles com justificativa em `docs/DEVELOPMENT.md`.
- [x] Atualizar `AGENTS.md`, `CLAUDE.md` e `CONTRIBUTING.md` a partir de uma fonte comum em [`docs/ENGINEERING_GUIDELINES.md`](../ENGINEERING_GUIDELINES.md).
- [x] Dividir `WorkspaceTab.tsx` por responsabilidade (árvore, missões, ações e menus), preservando os testes existentes.
- [x] Dividir `src/preload/index.ts` em módulos por domínio sem alterar a superfície `window.electronAPI`.
- [x] Documentar o roteiro de smoke e criar o gate reproduzível para a inicialização do app (`bun run test:smoke:electron`); a interação manual continua recomendada antes de releases.

## Prioridade 3 — Backlog tecnico
- [x] Revisar fronteiras de `src/shared/types.ts` e registrar a separação por domínio como trabalho sensível, após mapear os consumidores conhecidos.
- [x] Revisar `any` em integrações centrais; manter somente os usos de fronteira sem tipo local seguro e registrar o critério em [`docs/maintenance/code-hygiene-audit.md`](code-hygiene-audit.md).
- [x] Auditar arquivos com mais de 900 linhas e registrar os seams seguros sem extrair módulos especulativamente; ver [`docs/maintenance/code-hygiene-audit.md`](code-hygiene-audit.md).
- [x] Configurar CI explícita para typecheck, lint, testes unitários, build e cenários E2E por sistema operacional.
- [x] Fazer revisão de imports, nomes e comentários obsoletos nesta fatia, sem reformatar o repositório inteiro; resultado registrado no relatório de higiene.

## Critério para fechar um item

Toda limpeza deve ter escopo pequeno, diff revisável, teste ou verificação
adequada e nenhuma alteração involuntária em contratos públicos, persistência,
autorização, integrações externas ou comportamento assíncrono.

## Evidência desta passagem — 2026-08-29

- Typecheck, lint e `git diff --check` passaram.
- Build de produção e smoke Electron passaram com código de saída 0.
- A gate serial completa passou: 398 arquivos, 3.245 testes aprovados e 7 arquivos/70 testes ignorados por condições opt-in.
- A validação de segurança permanece registrada em `docs/SECURITY_AUDIT.md`; `npm audit --omit=dev --audit-level=high` não encontrou vulnerabilidades na última execução.
- A consolidação de instruções e a auditoria de tamanho/`any`/imports estão registradas em `docs/ENGINEERING_GUIDELINES.md` e `docs/maintenance/code-hygiene-audit.md`.

Os itens ainda abertos nesta lista exigem fonte comum para instruções, separação de contratos/`any` com mapeamento adicional ou uma decisão de produto/infraestrutura; não são tratados como resolvidos apenas por uma gate verde.
