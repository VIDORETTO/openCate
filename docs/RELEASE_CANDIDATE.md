# Checklist de release candidate

Este é o checklist de execução do RC. A existência do documento não significa
que a release esteja aprovada.

## Conteúdo e compatibilidade

- [ ] atualizar `package.json`/versão e adicionar a entrada completa no
      `CHANGELOG.md` antes de tag ou bump final;
- [x] revisar migração de workspaces existentes sem alterar o formato legado:
      `.cate/workspace.json` (estado compartilhável), `.cate/session.json`
      (estado local), `memory.json`, `tasks.json` e `agent-audit.json`;
      - [x] fixtures literais v1 dos cinco arquivos carregaram sem reescrita ou
            campos opcionais novos; a suíte focada passou 30/30 e
            `verify:hygiene` terminou com exit 0;
- [x] testar restore de snapshot antigo, arquivo ausente, arquivo corrompido,
      edição externa e lock órfão;
      - [x] regressão automatizada dos caminhos de ausência/corrupção, edição
            externa, lock órfão e round-trip de workspace passou 57/57;
      - [x] fixture literal de snapshot v1 anterior aos metadados opcionais
            passou no round-trip de painel, canvas e caminho relativo (16/16);
- [x] confirmar que segredos e estado machine-local continuam fora do commit;
      - [x] `npm run verify:repository-boundaries` examinou 1125 arquivos
            rastreados e não encontrou nomes de credenciais/estado local nem
            assinaturas de segredo de alta confiança; o gate roda na CI.

## Gates automatizados

No checkout limpo instalado com `npm ci`, executar e guardar os logs:

```bash
npm run build:sdk
npm run build:runtime
npm run typecheck
npm run lint
npm run verify:repository-boundaries
npm run verify:companion-deployment
npm run verify:release-workflow
npm test -- --no-file-parallelism
npm run verify:hygiene
npm run build
npm run test:smoke:electron
npm run test:smoke:telemetry # após gerar release/win-unpacked no Windows
npm run verify:release-metadata # apos empacotar uma plataforma
npm audit --omit=dev --audit-level=high
```

O workflow de release executa também `verify:repository-boundaries` e
`verify:companion-deployment` logo após `npm ci`, antes de gerar e empacotar o
aplicativo; os dois contratos devem passar no checkout usado para a tag.
O contrato `verify:release-workflow` também deve passar, garantindo que a
matriz, a ordem dos gates, os artefatos e as dependências de publicação não
sejam alterados acidentalmente.

Com Docker disponível, executar também `npm run test:container:runtime`; esse
smoke reconstrói a imagem Linux, valida o daemon real e remove a imagem
temporária ao final. O mesmo comando aceita `CATE_CONTAINER_ENGINE=podman` em
Linux, e o CI agora inclui uma matriz Docker/Podman; marcar o item Podman só
depois de um run verde dessa matriz ou de um smoke equivalente em Linux.

Quando aplicável, executar também `npm run test:e2e:ci` e o teste SSH loopback.
Os workflows de CI/release continuam sendo a matriz de referência para
Windows, macOS e Linux; o empacotamento usa `npm run package:win`,
`npm run package:mac` ou `npm run package:linux` no runner correspondente.

## Validação manual obrigatória

- [ ] abrir o instalador empacotado em Windows, macOS e Linux;
      - [x] harness Linux Fedora 44 local gerou AppImage, tarball e `.deb` com
            `npm run package:linux`; isso valida empacotamento/artefatos, não a
            instalação manual nem um runner Linux do GitHub.
      - [x] harness Debian descartável instalou o `.deb` com `dpkg --root` em
            raiz isolada e executou o smoke de restore/autosave do binário;
            isso não substitui abrir o instalador no host Linux.
      - [x] NSIS Windows executado em modo silencioso para diretório temporário
            explícito; `Cate.exe`, `app.asar`, runtime e `Uninstall Cate.exe`
            foram conferidos, o smoke de restore passou e o destino foi removido;
            isso não substitui a abertura manual em todos os hosts.
- [ ] confirmar migração, autosave, restore e encerramento sem daemon órfão;
      - [x] smoke do executável Windows empacotado criou um terminal, salvou
            `.cate/workspace.json`/`.cate/session.json`, fechou, reabriu o mesmo
            perfil e restaurou a geometria; nenhuma sobra de `Cate.exe` ou
            `cate-runtime` foi observada.
      - [x] smoke do binário Linux instalado em raiz temporária salvou e
            restaurou a geometria `677x423` sob Xvfb, sem processos órfãos.
      - [x] E2E funcional Windows pós-privacidade passou 61/62, com 1 skip
            esperado; a rodada terminou sem Electron do fixture ou daemon
            residual após o teardown.
- [ ] repetir o benchmark live de 50+ terminais e resize em macOS/Linux;
      - [x] harness Linux local descartavel, com Xvfb direto e runtime Linux
            nativo, passou os specs de 50+ PTYs, resize e territorio: 17/18
            testes aprovados e 1 skip esperado do backend GL; isso nao substitui
            os runners nativos macOS/Linux do CI.
      - [x] WSLg executou Electron Linux real com os mesmos specs: 17/18
            testes aprovados, 1 skip esperado, 60 FPS no caso de 50+ e 60 FPS
            no resize; isso reforca a evidencia Linux, mas nao substitui o
            runner macOS nativo.
      - [x] Windows executou os specs de performance com `CATE_PERF_50=1`:
            17/18, incluindo 50+ PTYs, resize concorrente e território/GL; o
            skip POSIX-only e a ausência de runner macOS mantêm o parent aberto.
- [ ] validar SSH/WSL real: autenticação, queda, backoff, reconexão, escopo e
      teardown;
      - [x] WSL2 Ubuntu neste host: E2E IPC passou INSTALL, ENSURE/reconexão e
            DELETE (5/5), incluindo o boundary do tarball executável;
      - [x] harness Linux Fedora 44 com `sshd` real: `npm run test:ssh:loopback`
            passou 1/1, incluindo autenticação por certificado, canal live,
            queda/teardown e limpeza do fixture;
      - [x] WSL Ubuntu executou o mesmo `sshLoopback` em dependencias Linux
            isoladas e passou 1/1, cobrindo ProxyCommand, certificado, SCP e
            canal live; isso nao substitui host externo real.
      - [x] WSL Ubuntu tambem executou `sshLive.itest.ts` contra seu `sshd`
            socket-activado por IP: os cenarios hold, concorrencia (`server=1`)
            e reinstall/force reconnect passaram 3/3; isso nao substitui host
            SSH externo.
      - [ ] host SSH externo e validação manual de teardown;
- [ ] exercitar BrowserPanel, `file:`, navegação externa, popups, CDP local e
      extensão server-backed;
      - [x] E2E local do BrowserPanel cobriu HTTP loopback e um fixture `file:`
            pelo guest real, confirmando snapshot, URL e teardown via
            agent-browser/CDP;
      - [x] E2E adicional abriu um popup OAuth-like em janela Electron real e
            confirmou URL, conteúdo e fechamento após o fluxo;
      - [x] E2E do daemon executou um servidor server-backed real, confirmou
            ready probe, request HTTP, env isolado e stop sem órfão;
      - [x] `src/main/webSecurity.test.ts` confirmou popup HTTPS permitido,
            esquemas inseguros bloqueados e popups recusados em extension webviews;
      - [ ] navegação externa, popups OAuth e extensão server-backed real;
- [ ] executar uma imagem real em Docker/Podman com mount somente leitura e
      rede `none`, além de testar falha de imagem/caminho;
      - [x] Docker local (2026-09-04): `npm run test:container:runtime` passou
            com os 2 testes do `containerRuntime.itest.ts`, validando imagem
            real, rede `none`, mount gravável, mount somente leitura e boundary
            de caminho;
      - [x] o mesmo smoke exige falha `code 125` para uma imagem temporária
            ausente com `--pull never`, sem acesso à rede;
      - [x] Podman local em harness Linux equivalente (Fedora 44 sobre kernel
            WSL2) passou 2/2, incluindo imagem ausente, `--pull never`, rede
            `none`, mounts, boundary de caminho e remoção da imagem temporária;
            a matriz CI Linux continua não executada.
- [ ] testar pairing/relay/cripto E2E com a UI/client companion distribuída e
      deployment atrás do proxy TLS;
      - [x] companion web local empacotado com manifest PWA, ícone e service
            worker; smoke de pairing, persistência IndexedDB e reload offline
            passou;
      - [x] fixture live local com Caddy validou proxy TLS autenticado, rotação
            de token, reinício e round-trip criptografado (`1/1`); deployment
            público e rede não-loopback continuam pendentes.
      - [x] artefatos de deployment local (`relay.env.example`, unidade systemd,
            Caddyfile restrito e runbook) passaram o verificador de contrato;
            isso não substitui instalar o serviço, ACME, acesso externo ou um
            reconnect em rede não-loopback.
- [ ] completar a revisão de privacidade em [`PRIVACY_DRAFT.md`](PRIVACY_DRAFT.md)
      e o relatório de segurança em [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md).
      - [x] smoke do app Windows empacotado confirmou 0 requests de analytics
            sem consentimento e envio para coletor loopback após opt-in;
            política pública, DSN/Sentry e retenção continuam pendentes.
      - [x] revisão técnica local confirmou poda imediata de
            `pending-events.jsonl` no opt-out e nenhuma regravação após falha de
            requisição iniciada antes da troca; o ciclo de vida do Sentry e a
            aprovação do owner continuam pendentes.

## Assinatura, atualização e rollback

- [ ] conferir secrets de assinatura/notarização e permissões do workflow;
- [ ] verificar artefatos, checksums/metadados e canal beta/stable no GitHub;
      - [x] `npm run verify:release-metadata` confere versão, existência,
            tamanho e SHA-512 dos `latest*.yml`; o canal GitHub ainda depende do
            workflow de publicação.
      - [x] no harness Linux local, após `npm run package:linux`, o mesmo
            verificador passou com 1 metadata file e 2 artifact entries;
            isso não substitui CI, assinatura ou publicação.
      - [x] `npm run test:update:fixture` valida os três manifests do feed local,
            hash/tamanho do asset, 404 e teardown; isso não fecha a instalação
            entre builds assinados nem rollback operacional.
      - [x] Windows local gerou instalador, ZIP, blockmap e `latest.yml`; o
            verificador confirmou versao, tamanho e SHA-512 do instalador. O
            wrapper nao devolveu exit final apos gerar os arquivos, portanto
            isso nao substitui publicacao no GitHub.
      - [x] `npm run dev:update` confirmou no log do Electron a cadeia real de
            check, update available, download a 100% e update downloaded contra
            feed loopback; troca assinada e rollback continuam pendentes.
- [ ] instalar uma versão anterior, atualizar para o RC e validar
      `electron-updater`;
- [ ] simular download interrompido e rollback operacional;
      - [x] `auto-updater.test.ts` cobre erro depois de update encontrado,
            limpeza da flag de instalação pendente e fallback manual; `updateState`
            cobre retry e give-up após falhas repetidas. Isso não substitui
            instalar uma versão anterior e atualizar o aplicativo real.
- [ ] registrar aprovadores, data, versão e links dos artefatos antes de
      publicar.

## Evidencia de privacidade local

- [x] Validar que os canais de uso nao carregam URL/caminho/texto livre e que o
      Sentry redige URLs e caminhos nos campos de evento; testes focados
      passaram 34/34.
- [x] Reconstruir o pacote Windows e repetir metadata, telemetry smoke, restore
      empacotado e smoke Electron com o codigo atual; todos terminaram com
      exit 0 e nao houve processo Cate/Electron/daemon residual.
- [x] A tentativa de validação manual Windows em 2026-09-04 foi preparada com
      diretório temporário explícito, mas não executada: o helper Computer Use
      disponível nesta sessão não expõe API para abrir aplicativos nativos.
      O diretório vazio foi removido e os artefatos preservados não foram
      alterados; a abertura manual continua pendente.
- [ ] Revisar os logs/breadcrumbs em um build distribuido e obter aprovacao do
      owner para texto publico, DSN, permissoes, retencao e acesso.

## Estado desta retomada

Em 2026-09-01, a implementacao local tambem corrigiu as cinco falhas esperadas
de docking (restore de janela, duplicacao entre zonas, alvos stale, perda em
moveTab e indices fora do limite). A matriz E2E completa passou 73/73 com 4
skips esperados; na rodada anterior, verify:hygiene, build, smoke Electron e
o pacote Windows tambem passaram. O smoke de telemetria empacotada tambem passou
com 0 requests sem consentimento, `app_start` apos opt-in e bloqueio do evento de
uso apos opt-out na mesma sessao. Validacoes cross-platform, SSH externo, Podman
na matriz CI, TLS, privacidade owner-reviewed, wrappers nativos e assinatura
continuam pendentes. A evidencia local de Podman e do empacotamento/SSH Linux nao
substitui os runs nativos, o host externo ou a matriz CI.
O workflow de CI agora executa as mediÃ§Ãµes live de 50+ PTYs, resize e territÃ³rio
nos runners nativos macOS/Linux; o requisito sÃ³ deve ser marcado apÃ³s esses runs
produzirem evidÃªncia verde.

O workflow de CI também executa o smoke POSIX de tmux em seus runners nativos
macOS/Linux; a execução pública ainda precisa produzir a evidência verde antes
de fechar a validação multiplataforma.
Os contratos de tmux, container e companion/relay têm testes focados; o
companion já inclui SDK, pairing host-side, criptografia E2E, responder HTTP
local, UI/QR no desktop e companion web com identidade IndexedDB/Web Crypto. O
build web também pode ser empacotado como asset estático versionado por
`npm run package:companion` e publicado pelo job Linux do release. O smoke real
de Docker passou neste host por `npm run test:container:runtime` e o E2E WSL2
Ubuntu passou INSTALL/ENSURE/DELETE; a evidencia de Podman no harness local e de
empacotamento/SSH Linux agora existe, mas certificacao cross-platform,
deployment atrás de TLS, wrappers mobile nativos,
revisão do owner de privacidade e assinatura de RC continuam pendentes.

Na validacao final apos a correcao de `activeIndex`, o bloco de docking e
restauracao passou 68/68, os E2Es afetados passaram 16/16, e os builds de
aplicacao, companion, SDK e runtime mais o smoke Electron passaram. O pacote
Windows foi regenerado e o hash/tamanho do instalador conferem com
`latest.yml`. O wrapper `verify:hygiene` foi reexecutado com a suite serial e
terminou com exit 0.

O companion web tambem foi endurecido para distribuicao PWA local: manifest,
icone e service worker com cache restrito ao app shell/ativos estaticos. O
smoke confirmou pairing, persistencia IndexedDB e reload offline; o empacotador
agora valida o manifesto, o service worker, o icone e a presenca desses artefatos
no tarball versionado, que contem `manifest.webmanifest`, `cate-logo.svg` e
`sw.js`. O fixture live opt-in com Caddy tambem validou localmente TLS
autenticado, rotacao do token do proxy, reinicio e round-trip criptografado;
hosting, TLS operacional e wrappers nativos continuam fora do que pode ser
validado neste host.
