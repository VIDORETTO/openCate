# Rascunho de privacidade e telemetria

Este arquivo registra o comportamento técnico atual. Não é uma política
pública nem substitui a revisão jurídica/produto antes de uma release.

## Consentimento e canais

- `telemetryEnabled` tem padrão `false` e é escolhido no onboarding/configurações.
- Builds não empacotadas não enviam analytics. Builds empacotadas só enviam
  depois do opt-in explícito.
- Sentry só inicializa com consentimento e DSN. `sendDefaultPii` é `false`,
  tracing/replay estão desligados e o hook de envio remove o diretório home de
  strings e reduz URLs de navegação a protocolo + host.
- O contexto comum contém um `install_id` aleatório persistido, versão,
  plataforma/arquitetura, versões de Electron/Chrome/Node, locale, release do
  sistema e indicação de build empacotada. O `install_id` deve ser tratado na
  política como identificador pseudônimo, mesmo sem derivação de hardware.

## Eventos e dados excluídos

Analytics envia nomes de eventos e campos primitivos bounded. O código não
envia por esse canal caminhos, nomes/conteúdo de projeto, hostname, IP,
informação de conta ou texto livre de feedback. Feedback externo reduz a
resposta a rating, presença/tamanho do comentário e versões.

O buffer offline fica em `<userData>/pending-events.jsonl`, é limitado a 256
KiB e é descartado imediatamente quando o consentimento passa para desligado.
Quando está ligado, eventos que falham permanecem até uma tentativa posterior
bem-sucedida; ao atingir o limite, a metade mais antiga é removida. Uma falha
de uma requisição que começou antes do opt-out também é rechecada antes de
gravar o evento, portanto não cria uma nova cópia local após a retirada. Não há
hoje uma expiração por idade implementada. Esse comportamento precisa ser
aceito ou alterado antes da política final.

## Destinos configurados no código

- Analytics: `https://analytics.cero-ai.com/api/app-events`.
- Sentry: `SENTRY_DSN` do ambiente ou valor de build; o script de empacotamento
  atualmente fornece um DSN fallback (`analytics.cero-ai.com`) quando nenhum é
  informado.

O owner da release deve confirmar domínio/controlador, finalidade, base legal,
retention no serviço externo, exclusão/rotação, acesso aos dados e se o DSN
fallback deve continuar existindo. Nenhum desses fatos deve ser inferido pelo
cliente a partir do código.

## Cobertura automatizada de redacao

- Os canais `promo_link_clicked` e `feature_used` aceitam apenas rotulos/chaves
  bounded; URLs, caminhos e texto livre enviados por IPC sao rejeitados antes
  do payload. Props string tambem precisam ser tokens seguros.
- O hook `beforeSend` do Sentry redige diretorios home e reduz URLs em todos os
  campos serializaveis do evento a protocolo + host; eventos nao serializaveis
  sao descartados.
- Os testes focados de analytics e redacao passaram 34/34; as regressões de
  consentimento/buffer e dos caminhos `SETTINGS_SET`/`SETTINGS_RESET` passaram
  14/14 em
  2026-09-04. Isso comprova o comportamento local, mas nao substitui a revisao
  do owner sobre logs, breadcrumbs e os campos introduzidos por novas features.
- A inicializacao do Sentry continua sendo decidida no boot. Um opt-in feito em
  Configuracoes depois de um boot sem Sentry só habilita o crash reporting na
  proxima inicializacao; um opt-out de uma instancia ja inicializada e filtrado
  por `beforeSend`. O client não é fechado ao vivo porque `close()` do SDK faz
  flush, e esse ciclo de vida (incluindo sessoes/minidumps) requer validacao do
  owner antes de uma promessa de desligamento imediato.

## Gate antes de publicar

- [ ] aprovar texto público e fluxo de consentimento;
- [ ] aprovar retenção local e externa, incluindo `pending-events.jsonl`;
- [ ] confirmar DSN, projeto Sentry, permissões e política de acesso;
- [x] executar o smoke empacotado com telemetria desligada e ligada,
      observando que nenhum request ocorre no primeiro caso;
      - [x] `npm run test:smoke:telemetry` executou o app Windows unpacked
            contra um coletor HTTP exclusivamente loopback: 0 requests sem
            consentimento e 3 requests após opt-in, incluindo `app_start`; o
            mesmo smoke confirmou que um opt-out na sessão bloqueia o evento de
            uso seguinte.
- [ ] revisar novamente logs, breadcrumbs de webview e campos adicionados por
      novas features.
