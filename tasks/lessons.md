# Lessons

## 2026-08-23 — Ordem de fases do backlog

- **Erro:** Sessão anterior avançou para Fase 2/3 (features de produto) sem executar Fase 1 (estabilização da fundação). Continuei sem questionar a ordem.
- **Regra:** Antes de iniciar qualquer item, verificar se fases anteriores têm itens pendentes que bloqueiam ou deveriam preceder o trabalho atual. Se houver pulo de fase, perguntar ao usuário explicitamente.
- **Ação corretiva:** Confirmar com usuário qual prioridade: voltar para Fase 1 ou continuar Fase 3 com dívida técnica registrada.

## 2026-08-24 — Comandos E2E longos

- **Problema:** A suíte E2E completa foi executada sem limite operacional e ficou sem output por vários minutos no Windows, exigindo interrupção manual.
- **Regra:** Rodar primeiro os specs focados; para a suíte completa, usar timeout/monitoramento periódico e registrar explicitamente quando um teste pré-existente depender de timing/GPU.
- **Ação corretiva:** Esta feature foi validada com testes focados e a suíte unitária será o gate principal; a suíte E2E completa permanece um job separado e bounded.

## 2026-08-25 — Mocks que apagam identidade persistida

- **Problema:** O mock de `workspaceCreate` retornava um objeto sem `id`. O store aplicou esse resultado e substituiu o ID real do workspace por `undefined`; na segunda renderização, a árvore não encontrava o workspace e os painéis desapareciam.
- **Regra:** Mocks que representam criação ou atualização devem preservar campos de identidade recebidos (especialmente `id`) e retornar o mesmo contrato da API real. Ao simular um resultado aplicado por um reducer/store, validar o ciclo completo de renderização, não apenas a primeira montagem.

## 2026-08-25 — Prevenção de loops e uso eficiente de ferramentas

- **Problema:** Em sessões anteriores, leituras idênticas ou semanticamente equivalentes foram repetidas sem mudança de estado, nova hipótese ou evidência nova, consumindo tempo e parecendo execução travada.
- **Regra:** Toda chamada precisa ter informação nova esperada e uma decisão que ela pode alterar. Não reler o mesmo intervalo quando nada mudou; mudar de janela, buscar símbolo/referência relacionada ou executar validação direcionada. Depois de no máximo três ações consecutivas sem nova evidência, replanificar explicitamente. Atividade não é progresso e leitura não substitui gates.
- **Ação corretiva:** A regra permanente está em `C:\Users\gabri\Documents\cate\AGENTS.md` na seção **Tool Loop Prevention**; esta entrada registra o aprendizado no âmbito do workspace.

## 2026-08-27 — Continuidade deve viajar com o projeto

- **Problema:** O repositório foi realocado para `C:\Users\gabri\Documents\cate`, mas o backlog de retomada permaneceu no workspace antigo; uma nova sessão aberta diretamente no projeto poderia perder a ordem das fases.
- **Regra:** `tasks/todo.md` e `tasks/lessons.md` devem ficar dentro da raiz canônica do repositório. Se houver um workspace operacional externo, ele não pode ser a única fonte de continuidade.
- **Ação corretiva:** Os dois arquivos foram movidos para `C:\Users\gabri\Documents\cate\tasks\` e o `todo.md` registra a sequência exata para continuar.
