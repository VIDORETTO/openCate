# Companion e relay

O Cate agora tem um contrato compartilhado para um companion mobile/web e um
relay self-hosted opcional. O contrato, o cliente transport-neutral, a
criptografia do canal, o responder do desktop e o fluxo de pairing estão
implementados. O desktop expõe a seção Companion em Settings e o repositório
inclui um companion web responsivo em `companion-web/`.

## Protocolo companion v1

Cada request carrega versão, `requestId`, `sessionId`, `nonce`, janela de
validade, capability, método e argumentos opcionais. O gateway do desktop
aplica limites de tamanho/tempo, expiração de sessão e anti-replay por nonce.

Leituras permitidas hoje:

- `cate.version`, `cate.workspace.get`, `cate.project.get`;
- `cate.panel.list`;
- `cate.tasks.list` e `cate.tasks.get`;
- `cate.context.list` e `cate.context.get`;
- `cate.results.list` e `cate.results.get`;
- `cate.codingAgent.list` e `cate.codingAgent.inspect`.

Não existe método companion de terminal/scrollback. A leitura é uma lista
explícita, não uma cópia implícita do estado visual ou da saída de um PTY.

As ações inicialmente permitidas são `cate.codingAgent.send` e
`cate.tasks.update`. Elas exigem um `approvalId` criado pelo host desktop,
associado ao método e aos argumentos canônicos, com validade curta e consumo
único. A sessão dura 15 minutos; uma aprovação dura no máximo 60 segundos.
O token bruto é entregue apenas na emissão e o host guarda somente seu digest.

O adapter `createMainCompanionGateway` conecta esse boundary aos handlers
autoritativos do desktop. Invocar diretamente os handlers CATE_API não é uma
forma pública de companion; a allowlist e a aprovação do gateway são a
fronteira de segurança.

## Cliente e criptografia

`src/sdk/companionClient.ts` é o cliente compartilhado para web e wrappers
mobile. `CompanionClient.fromInvitation()` deriva uma chave de sessão a partir
da identidade local e oferece `read()` e `approve()`; o transporte HTTP usa
apenas `fetch`, com timeout, cursor bounded e polling de frames. Leituras que
falham transitoriamente (`408`, `429`, `5xx`, timeout ou erro de rede) têm até
três retries bounded; comandos `POST` nunca são repetidos automaticamente, para
não duplicar uma ação cujo resultado de rede seja ambíguo.

`src/sdk/companionIdentityStore.ts` fornece o armazenamento web padrão: a
identidade é criada uma vez e o private key é importado como `CryptoKey` não
extraível antes de ser salvo em IndexedDB. Wrappers nativos podem implementar
`CompanionIdentityStore` sobre Keychain/Keystore. O companion web buildável em
`companion-web/` usa essa store, permite colar o convite/QR e devolve a prova
JSON para o desktop. O build também é instalável como PWA: inclui manifest,
ícone Cate e service worker com fallback offline apenas para o app shell e
ativos estáticos; chamadas dinâmicas do relay nunca entram no cache.
`npm run package:companion` transforma o build em um tarball estático versionado
em `release/`; antes de escrever o arquivo, valida o manifesto, o service worker,
o ícone e a presença desses artefatos dentro do `.tgz`. O workflow de release
publica esse asset a partir do runner Linux.
`npm run test:companion:web` é autocontido: gera o build, inicia um preview local,
aguarda a porta ficar pronta, exercita a persistência IndexedDB após reload e
verifica registro do service worker e reload offline antes de encerrar o preview,
mesmo quando o smoke falha. Uma URL já hospedada pode ser fornecida por
`CATE_COMPANION_WEB_URL`.

`npm run test:companion:proxy` é um teste live opt-in para hosts que tenham
Caddy instalado. Ele inicia um relay loopback e um proxy Caddy temporário com
TLS interno, autentica por header, recarrega o proxy com um token rotacionado,
reinicia o processo e confirma round-trips criptografados com as mesmas
instâncias do cliente/responder. A CA fica em diretório temporário e não é
instalada no trust store do sistema; isso valida a fronteira local, não substitui
deployment público, certificado operacional ou teste em rede não-loopback.

`src/shared/companionCrypto.ts` usa P-256 ECDH, HKDF-SHA-256 e AES-256-GCM.
Cada frame tem nonce aleatório e AAD derivada de versão, canal, id, direção e
janela de validade. Alterar metadados ou usar a chave de outro pareamento faz
a abertura falhar. O `CompanionRelayResponder` no desktop descriptografa,
valida o `sessionId` e ainda passa o request pelo `CompanionGateway`; não há
atalho que transforme um frame em dispatch.

O pairing host-side fica em `src/main/companion/pairing.ts`: gera convite sem
o bearer da sessão, código numérico de seis dígitos armazenado apenas como
digest, limite de cinco tentativas, dispositivo read-only por padrão e
revogação que invalida imediatamente a sessão. `CompanionClient.createPairingProof`
produz a chave pública que o host aceita. A seção Companion gera QR, recebe a
prova e lista/revoga dispositivos. A identidade do companion web é
persistentemente protegida pelo IndexedDB/Web Crypto; chaves e sessões do host
continuam em memória, portanto reiniciar o desktop exige novo pairing.

## Relay self-hosted

O servidor pode ser iniciado localmente com:

```bash
bun run companion:relay
```

`CATE_RELAY_HOST` permanece limitado a `127.0.0.1` ou `::1`, e
`CATE_RELAY_PORT` define a porta (padrão `8787`). O servidor:

- cria canais efêmeros com token bearer, armazenando apenas o digest do token;
- expira canais em uma hora;
- aceita no máximo 64 frames por canal e remove frames expirados;
- limita cada frame a 768 KiB e a uma janela curta de validade;
- encaminha apenas `ciphertext` e metadados; não interpreta requests nem
  conhece workspace, conta ou credencial do Cate;
- mantém `Cache-Control: no-store` e autentica cada leitura/escrita do canal.

O relay não conhece a criptografia end-to-end: desktop e companion
criptografam/descriptografam os frames antes de enviá-los, e o relay só
encaminha ciphertext. O bind de loopback é deliberado; uma exposição
pública exige proxy TLS autenticado, rate limiting e uma política de rotação
de tokens decidida pelo operador.

## Exemplo de deployment

[`deploy/companion/Caddyfile.example`](../deploy/companion/Caddyfile.example)
serve o build estatico do companion e encaminha somente `/health` e
`/v1/channels/*`
para `127.0.0.1:8787`. O Caddy termina HTTPS e o relay continua validando o
bearer efemero de cada canal; o exemplo nao inventa um header secreto global
que o client web nao teria como enviar.

Para um host Linux com systemd, `deploy/companion/relay.env.example` fornece
a configuração mínima sem wildcard de CORS e
`deploy/companion/cate-relay.service.example` executa o relay com usuário
dedicado, bind loopback, `NoNewPrivileges`, filesystem protegido e restart
bounded. Instale os exemplos nos caminhos indicados, faça `daemon-reload` e
habilite o serviço somente depois de validar o Caddyfile.

No host, configure o processo com `CATE_RELAY_HOST=127.0.0.1`,
`CATE_RELAY_PORT=8787` e `CATE_RELAY_CORS_ORIGIN=https://<dominio-do-companion>`.
O ultimo valor e uma origem HTTP(S) unica e e validado pelo launcher. O Caddy
faz a emissao/renovacao do certificado ACME; uma alteracao de origem exige
reiniciar o relay, enquanto a troca do arquivo Caddy pode usar `caddy reload`.
Pairings/channel bearers continuam efemeros e devem ser revogados ou
reemitidos pelo desktop quando houver suspeita de exposicao.

## O que ainda falta para produto

- publicação/hosting do companion web e wrappers mobile nativos com adapter
  Keychain/Keystore;
- deployment real atrás de proxy TLS autenticado, rotação operacional de
  tokens e testes de expiração/reconnect em rede não-loopback;
- validação manual de reconnect, expiração e ações aprovadas em uma instalação
  real.
