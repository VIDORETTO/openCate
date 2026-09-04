# Diagnostico geral

Auditoria realizada em 2026-08-29 sobre as fronteiras main/preload/renderer,
IPC, runtime local/remoto, filesystem, VCS, extensões, webviews, browser/CDP,
credenciais, logs e telemetria.

O sistema aplica isolamento de contexto no Electron, validação autoritativa de
caminhos no runtime, endpoints locais com bearer efêmero, armazenamento de
segredos via `safeStorage` e comandos externos sem shell quando a API fornece
argv. A auditoria não constitui uma certificação de segurança: os itens
manuais abaixo continuam necessários.

# Vulnerabilidades encontradas

## Critico

Nenhuma vulnerabilidade crítica confirmada nesta passagem.

## Alto

### SEC-001 — alvo de worktree fora do escopo validado

- **Evidência:** os handlers de VCS validavam o repositório, mas recebiam
  `targetPath`/`worktreePath` antes de validar o destino; `worktreeRemove`
  também podia remover o caminho recebido e `worktreeStatus` consultava sua
  existência antes da validação.
- **Impacto:** uma chamada IPC com estado ou argumento adulterado poderia criar,
  remover ou consultar um caminho fora das raízes autorizadas.
- **Correção:** `src/runtime/capabilities/vcs.ts` agora valida destinos com
  `validatePathForCreation`/`validatePathStrict` no daemon antes de qualquer
  operação Git ou filesystem. O status também valida antes do `stat`.
- **Regressão:** `src/runtime/capabilities/vcs.security.test.ts` cobre add,
  add-from-PR, remove e status fora do escopo.
- **Estado:** corrigida; ainda requer smoke manual com worktree real.

## Medio

### SEC-003 — esquemas locais em popups do BrowserPanel

- **Evidencia:** a allowlist de navegacao permitia `file:` e `data:` para o
  BrowserPanel, e a mesma allowlist era usada pelo `setWindowOpenHandler`.
- **Impacto:** uma pagina remota poderia solicitar um popup com esquema local,
  misturando um fluxo de navegacao iniciado remotamente com a sessao do
  BrowserPanel.
- **Correcao:** `src/main/webSecurity.ts` agora usa uma allowlist especifica
  para popups: somente `http:`, `https:` e `about:blank`; `file:` e `data:`
  continuam disponiveis apenas para navegacao explicita do painel.
- **Regressao:** `src/main/webSecurity.test.ts` cobre popups HTTPS permitidos e
  bloqueio de `javascript:`, `file:` e `data:`; os E2Es reais de browser/CDP
  passaram 2/2 em 2026-09-01.
- **Estado:** corrigida; a matriz completa de navegacao ainda requer revisao
  manual em app empacotado.

### SEC-004 — ambiente herdado no processo agent-browser

- **Evidencia:** `src/main/browser/agentBrowser.ts` copiava `process.env` inteiro
  para o executavel nativo de automacao, removendo apenas chaves com prefixo
  `AGENT_BROWSER_`.
- **Impacto:** credenciais, tokens, `NODE_OPTIONS` e handles de SSH presentes
  no ambiente do openCate ficavam acessiveis a um processo de terceiro.
- **Correcao:** o child agora usa `sanitizeServerEnv`, a mesma allowlist de
  plumbing do sistema aplicada a servidores de extensao; socket e timeout sao
  injetados explicitamente.
- **Regressao:** `src/main/browser/agentBrowser.test.ts` cobre a remocao dos
  segredos e a preservacao dos dois parametros necessarios; os E2Es reais de
  browser/CDP passaram 2/2 em 2026-09-01.
- **Estado:** corrigida; permanece a limitacao de que processos da mesma conta
  podem observar memoria do usuario.

### SEC-002 — herança de ambiente sensível para servidores de extensão

- **Evidência:** o capability de servidor mesclava o ambiente do daemon ao
  ambiente do processo filho. O `cleanEnv` anterior removia apenas valores
  `undefined`, não chaves sensíveis.
- **Impacto:** extensões server-backed, que executam código deliberadamente,
  poderiam receber acidentalmente chaves, tokens, opções de runtime ou handles
  de agente presentes no ambiente do processo openCate.
- **Correção:** `sanitizeServerEnv` aplica uma allowlist de variáveis de sistema;
  `CATE_TOKEN`, `WORKSPACE_ROOT`, `CATE_API`, `HOST` e a porta continuam sendo
  injetados explicitamente pelo servidor da extensão.
- **Regressão:** `src/runtime/capabilities/server.test.ts` verifica a remoção
  de API keys, tokens, `NODE_OPTIONS` e `SSH_AUTH_SOCK`.
- **Estado:** corrigida; extensões continuam sendo código de terceiros e não
  recebem isolamento de usuário separado.

### PRIV-001 — telemetria obrigatória e feedback livre

- **Evidência:** builds empacotadas enviavam uso/crash sem gate de consentimento,
  e o comentário de feedback era incluído no payload externo.
- **Impacto:** coleta sem escolha explícita e possibilidade de o usuário incluir
  caminhos, segredos ou dados pessoais no texto enviado.
- **Correção:** `telemetryEnabled` é padrão `false`, aparece no aviso inicial e
  em General Settings; analytics e Sentry consultam o consentimento. Feedback
  envia apenas rating, presença e tamanho do comentário. O buffer offline é
  descartado quando o consentimento está desligado, impedindo o envio posterior
  de eventos legados.
- **Regressão:** testes do analytics, WelcomeDialog e capability de servidor;
  `npm run test:smoke:telemetry` também executa o app empacotado contra um
  coletor loopback e exige 0 requests sem consentimento, `app_start` após
  opt-in e bloqueio de um evento de uso depois do opt-out na mesma sessão. O
  override do coletor só aceita HTTP loopback nos modos de smoke.
- **Estado:** corrigida no código; a política pública e a configuração do DSN
  devem ser revisadas manualmente antes de uma release.

### Telemetria - redacao de campos

- **Evidencia:** o handler IPC de cliques de promocao aceitava qualquer string,
  e o Sentry apenas trocava o diretorio home no evento serializado.
- **Correcao:** o analytics agora aplica allowlist de rotulos/chaves e rejeita
  URLs, caminhos e texto livre nos canais de uso; o Sentry redige URLs/caminhos
  em toda a arvore de strings e descarta eventos que nao podem ser serializados
  com seguranca.
- **Regressao:** `src/main/analytics.test.ts` e
  `src/main/sentryPrivacy.test.ts` passaram 34/34, incluindo URL com token,
  caminho Windows, feature/props inseguros, breadcrumb embutido e objeto
  circular.
- **Estado:** corrigido localmente; a revisao operacional do Sentry e a
  politica publica/retention continuam pendentes.

## Baixo

Nenhuma vulnerabilidade baixa confirmada que exija alteração imediata.

# TO-DO DE SEGURANCA E CORRECAO DE VULNERABILIDADES

- [x] Validar todos os destinos de worktree no runtime antes de Git/filesystem.
- [x] Isolar o ambiente herdado por processos de extensão server-backed.
- [x] Exigir opt-in para analytics e Sentry e não transmitir feedback livre.
- [x] Manter limites de corpo, token bearer efêmero e escopos no endpoint local.
- [x] Restringir popups do BrowserPanel a HTTP(S)/`about:blank`, sem permitir
      `file:` ou `data:` iniciados por conteúdo remoto.
- [x] Isolar o ambiente herdado pelo processo nativo agent-browser usando a
      allowlist de processos de terceiros.
- [x] Rodar `npm audit --omit=dev --audit-level=high` — 0 vulnerabilidades.
- [x] Fixar a vulnerabilidade transitiva de `@xmldom/xmldom` em 0.8.15 via
      override mínimo de `package.json`; `npm ls` confirmou `mammoth` e `plist`
      resolvendo a versão corrigida.
- [x] Rodar smoke empacotado de telemetria desligada/ligada sem contato com o
      coletor externo — 0 requests sem consentimento, 3 após opt-in, incluindo
      `app_start`, e bloqueio do evento seguinte após opt-out na mesma sessão.
- [x] Impedir na CI arquivos rastreados de chave/credencial, `.env`, estado
      machine-local e assinaturas de segredo de alta confiança.
- [ ] Executar testes manuais de webview com navegação externa, `file:` e
      popups, incluindo uma extensão server-backed real.
      - [x] E2E local cobriu HTTP loopback e `file:` no guest real, snapshot/URL
            via CDP e limpeza dos fixtures temporários.
      - [x] E2E local abriu um popup OAuth-like em janela Electron real e
            confirmou URL, conteúdo e teardown.
      - [x] E2E do daemon executou um servidor server-backed real, confirmou
            ready probe, request HTTP, ambiente isolado e stop sem órfão.
      - [ ] navegação externa, popups OAuth e extensão server-backed real.
- [ ] Validar em host SSH/WSL real a reconexão, escopo de caminhos e teardown.
      - [x] Ubuntu WSL2 local: E2E IPC cobriu instalação, ENSURE/reconexão e
            DELETE em 2026-08-30;
      - [ ] host SSH externo e observação manual dos eventos/teardown.
- [ ] Revisar a política pública de privacidade e o DSN/retention do Sentry.

# Vulnerabilidades potenciais a investigar

- **CDP local sem autenticação de aplicação:** o backend agent-browser usa uma
  porta loopback efêmera. Isso reduz exposição de rede, mas um processo local
  com acesso ao perfil pode tentar conectar; avaliar `remote-debugging-pipe` ou
  uma camada de autenticação sem quebrar o agente.
- **Allowlist `file:` em webviews:** é intencional para previews locais, mas a
  combinação com páginas remotas precisa ser validada em Electron empacotado
  para excluir navegação ou leitura cruzada não desejada.
- **Execução de extensões:** `manifest.server.command` é código deliberado da
  extensão. Catálogos remotos exigem URL HTTP(S) e SHA-256, mas a confiança das
  fontes de catálogo e o processo de revisão de artefatos devem permanecer
  explícitos.
- **Segredos no processo do usuário:** `safeStorage` protege dados em repouso,
  mas qualquer código executado com a mesma conta do usuário pode observar
  memória/ambiente; não tratar isso como isolamento forte.

# Revisao manual necessaria

- O gate automatizado já confirma analytics desligado/ligado entre dois perfis
  empacotados e o smoke empacotado também habilita/desabilita durante a mesma
  sessão. Ainda observar o Sentry antes da release.
- Exercitar BrowserPanel, extensão frontend-only, extensão server-backed e
  WebSocket com origem/navegação inválida.
- Criar/aplicar/remover worktree em raiz permitida e tentar destino fora dela;
  confirmar que nenhuma pasta externa é criada ou removida.
- Repetir conexão, queda e reconexão em SSH e WSL reais, observando logs e os
  eventos de telemetria sem valores sensíveis; o ciclo WSL2 local já tem E2E
  automatizado, faltando o host SSH externo e a observação manual.
- Confirmar permissões do `userData`, arquivos de secrets e rotação/retention
  nos serviços externos antes do release candidate.

# Resumo executivo

Foram corrigidos cinco achados confirmados: mutação VCS fora do escopo,
ambiente sensível herdado por extensões e agent-browser, coleta sem
consentimento com feedback livre e esquemas locais em popups. O gate de
dependências de produção
está limpo. Permanecem
itens de validação manual e decisões de threat model para CDP local,
webviews, extensões e infraestrutura remota; portanto este documento não deve
ser interpretado como garantia de ausência de vulnerabilidades.
