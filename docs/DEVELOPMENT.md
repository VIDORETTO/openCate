# Desenvolvimento, validação e CI

Este é o guia comum para instalar, executar e validar o openCate. `AGENTS.md`,
`CLAUDE.md` e `CONTRIBUTING.md` apontam para este documento para evitar que os
comandos de desenvolvimento se afastem entre si.

## Gerenciadores e lockfiles

- **Desenvolvimento local:** Bun `1.3.13` é o fluxo principal; use `bun.lock` e
  os scripts `bun run ...`.
- **CI e release:** npm é o fluxo determinístico; `package-lock.json` é o
  lockfile usado por `npm ci` nos workflows do GitHub.
- **Os dois lockfiles são intencionais:** Bun torna o ciclo local mais rápido,
  enquanto npm mantém a instalação de CI/release compatível com os runners e
  com o processo de publicação existente. Não remova um lockfile sem migrar
  também os workflows.
- **Alteração de dependência:** atualize o lockfile do fluxo local com Bun,
  regenere o `package-lock.json` com npm e revise os dois diffs antes de
  commitar. O `package.json` declara Bun como o gerenciador local via
  `packageManager`.

## Pré-requisitos

- Node.js 20 ou 22 LTS, conforme `.nvmrc`.
- Bun 1.3.13 para desenvolvimento local.
- Python 3 e toolchain C/C++ no Linux para a compilação do `node-pty`.

## Ciclo local

```bash
bun run setup       # instala dependências e constrói o runtime local
bun run dev         # inicia o Electron com hot reload
bun run typecheck
bun run lint
bun run test        # suíte unitária Vitest
bun run build
bun run build:companion # bundle web responsivo do companion
bun run package:companion # tarball estático em release/ após o build web
```

Para repetir a gate estática, unitária e de build em uma única execução:

```bash
bun run verify:hygiene
```

Essa gate executa o Vitest com `--no-file-parallelism` porque os fixtures de
daemon real compartilham handles de processo/arquivo no Windows. Para
reproduzir o mesmo teste fora da gate, use `bun run test -- --no-file-parallelism`.

O smoke do Electron usa o mesmo bootstrap do aplicativo e encerra sozinho:

```bash
bun run test:smoke:electron
```

Após gerar `release/win-unpacked` com `npm run package:win -- --dir`, o gate de
consentimento executa o app empacotado duas vezes contra um coletor temporário
restrito a loopback. Ele exige zero requests com telemetria desligada e um
`app_start` somente depois do opt-in:

```bash
npm run test:smoke:telemetry
```

O smoke também alterna o consentimento na mesma sessão pelo bridge existente:
depois do opt-in, um evento de uso chega ao coletor loopback; depois do opt-out,
um segundo evento não é enviado.

Depois de gerar o mesmo `release/win-unpacked`, o round-trip do estado pode ser
validado no executável final. O smoke cria um terminal em projeto temporário,
salva os dois arquivos `.cate`, fecha o app, reabre o perfil e verifica a
geometria restaurada e a ausência de processos openCate/daemon órfãos:

```bash
npm run test:smoke:packaged-restore
```

Em hosts POSIX, execute npm run test:tmux:live para validar uma sessão cate-*
com cliente PTY real, desconexão, sobrevivência e teardown do socket temporário.

Para a suíte de janela real, construa o runtime quando necessário e execute o
gate funcional:

```bash
bun run runtime:tarball
bun run test:e2e:ci
```

No Linux sem servidor gráfico, envolva o comando com `xvfb-run -a`.
O smoke também pode ser executado isoladamente após o build:

```bash
xvfb-run -a bun run test:smoke:electron  # Linux sem display
bun run test:smoke:electron              # macOS/Windows ou Linux com display

As medicoes live de 50+ PTYs, resize e territorio rodam nos runners nativos
macOS/Linux do CI (o Windows ja tem medicao local registrada). Para reproduzir
manualmente em um host POSIX:

```bash
CATE_PERF_50=1 bun run test:e2e -- e2e/perf-stress.spec.ts e2e/worktree-territory-perf.spec.ts
```

No Linux sem display, use `xvfb-run -a` antes do comando. Os thresholds desses
specs sao regressao ampla; os numeros impressos no runner sao a evidencia de
hardware/host, nao uma promessa de latencia fixa.
```

Os scripts npm que precisam de variáveis temporárias (`test:e2e:ci`, SSH
loopback, contratos live e cenários de desenvolvimento) passam por
`scripts/run-command-with-env.mjs`. Isso mantém a atribuição de ambiente
cross-platform e evita depender de sintaxe Unix ou de shell concatenado no
Windows.

## Ordem dos gates

1. teste focado da alteração;
2. `bun run typecheck`;
3. `bun run lint`;
4. `bun run test`;
5. `bun run build`;
6. `bun run build:companion` quando o SDK/companion for alterado;
7. smoke do Electron e E2E quando a alteração tocar bootstrap, preload,
   renderer, runtime ou integração de janela.

Os workflows usam os equivalentes `npm run ...` após `npm ci`. O smoke e os
cenários E2E devem permanecer bounded; uma execução que não termina é uma
falha de infraestrutura a ser investigada, não um gate indefinido.

`npm run verify:repository-boundaries` inspeciona somente arquivos rastreados e
falha se `.env`, chaves/certificados privados, estado `.cate`/machine-local ou
assinaturas de segredo de alta confiança entrarem no repositório. A CI executa
esse gate em todos os sistemas.

## Onde investigar falhas

- Processo principal, IPC e persistência: `src/main/`.
- Bridge seguro: `src/preload/`.
- UI e stores: `src/renderer/`.
- Daemon sem Electron: `src/runtime/`.
- Contratos puros: `src/shared/`.
- Estrutura e limites: [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md).
- Modelo de processos e segurança: [ARCHITECTURE.md](ARCHITECTURE.md).
