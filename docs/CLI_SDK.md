# CLI e SDK

## Escopo

Cada terminal recebe um endpoint `CATE_API` temporário, ligado ao workspace
que o criou, com `CATE_TOKEN` bearer. O endpoint aceita apenas `127.0.0.1` no
host do runtime e os métodos de projeto são first-party-only. O token não é
um token de conta nem deve ser copiado para logs.

## CLI

```text
cate project get
cate task list
cate task get <id>
cate task create <objetivo...>
cate task update <id> --data '<json object>'
cate task delete <id>
cate context list
cate context get <id>
cate context create <título> <conteúdo...>
cate context update <id> --data '<json object>'
cate context delete <id>
cate result list [task-id]
cate result get <result-id>
```

`--data` é um objeto JSON. Em `task create` e `context create`, ele pode
fornecer o draft completo; sem ele, a CLI cria um task planejado ou uma nota
de contexto de projeto com uma citação manual. Os resultados são uma projeção
read-only da tarefa (`result.id === task.id`) e não criam um segundo estado.

Todos os listados novos retornam:

```json
{ "items": [], "total": 0 }
```

Os limites são bounded pelo contrato persistente: no máximo 200 tasks/notas,
com conteúdo e evidências limitados por campo. Nenhuma operação de contexto ou
resultado inclui scrollback de terminal sem uma referência explícita já salva.

## SDK TypeScript

Depois de `bun run build:sdk`, o pacote expõe `cate/sdk` com ESM e declarações:

```ts
import { createCateApiClient } from 'cate/sdk'

const cate = createCateApiClient({
  baseUrl: process.env.CATE_API!,
  token: process.env.CATE_TOKEN!,
  timeoutMs: 30_000,
})

const project = await cate.project.get()
const openTasks = await cate.tasks.list({ status: 'in-progress' })
const result = await cate.results.get('task-id')
```

O cliente não depende de Electron e aceita um `fetch` injetado para testes. Os
erros de transporte (`CateApiTransportError`) são distintos dos erros de API
(`CateApiError`, com `method`, `status` e `code`).

As permissões da CLI se aplicam também ao SDK: **Project data → Read** cobre
project/tasks/context/results de leitura; **Control** cobre criação, alteração
e remoção de tasks/notas. O master switch `cliEnabled` continua sendo
obrigatório.

## SDK do companion

O mesmo pacote também exporta `CompanionClient`, `createCompanionIdentity` e
os tipos de convite. A aplicação web/mobile deve guardar a identidade privada
no armazenamento seguro da plataforma e receber o convite por um canal
out-of-band; o convite não contém o bearer da sessão do desktop.

```ts
import { CompanionClient, createCompanionIdentity } from 'cate/sdk'

const identity = await createCompanionIdentity()
const companion = await CompanionClient.fromInvitation(invitation, identity)
const workspace = await companion.read('cate.workspace.get')
```

O cliente só aceita métodos da allowlist, cifra os requests/respostas antes do
relay e expira por sessão/request. Ações como `cate.tasks.update` exigem o
`approvalId` emitido pelo host; o SDK não pode autoaprovar mutações.
