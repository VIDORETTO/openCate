# Runtime em container

O runtime `container` é um adaptador explícito para Docker ou Podman. Ele não
é um modo genérico de executar imagens arbitrárias: a imagem precisa trazer o
runtime do Cate nos caminhos fixos abaixo.

```text
/opt/cate/runtime/bin/node
/opt/cate/runtime/runtime.cjs
```

## Contrato atual

- A conexão declara `engine`, `image`, um único caminho do workspace no host e
  o caminho correspondente dentro do container.
- O root do daemon precisa ser absoluto e estar dentro do mount do workspace.
- A execução usa `run --rm --init --interactive --pull never`, um nome de container derivado
  do `runtimeId` e `--workdir` no root declarado.
- O workspace é o único mount criado pelo adaptador. Ele pode ser somente
  leitura (`workspaceReadOnly: true`). O adaptador não cria, remove ou altera a
  imagem; `bootstrap` apenas verifica se os dois caminhos fixos existem e são
  executáveis/arquivos válidos.
- A rede padrão é `none`. `bridge` só é aceito quando a conexão o declara
  explicitamente.
- Variáveis de ambiente são nomes allowlisted; os valores são lidos do
  ambiente do host no lançamento. O padrão não injeta segredos e nenhum valor
  de ambiente é colocado na linha de comando.

O container é descartável: o workspace do host permanece, mas processos
interativos dentro do container não constituem uma sessão durável. Para
durabilidade de terminal, use o backend tmux em um host POSIX compatível.

## Imagem e segurança operacional

A imagem é uma entrada confiável do administrador do workspace. A escolha de
uma imagem ou do modo `bridge` pode executar código e permitir acesso de rede;
isso não é um boundary de tenant hostil contra o daemon Docker/Podman. A
origem, o digest e o processo de atualização da imagem devem ser controlados
fora deste adaptador.

O caminho do host é validado antes da criação do transporte, e o caminho
montado é passado como argumento separado. Ainda assim, o usuário que concede
o mount está concedendo à imagem acesso ao conteúdo daquele diretório; prefira
mount somente leitura quando a missão não precisar escrever.

## Validação

O contrato e os argumentos exatos têm cobertura em
`src/main/runtime/transports/containerTransport.test.ts`, além dos testes de
conexão/serialização do runtime. Typecheck e lint cobrem a integração.

O smoke reproduzível do Docker é executado por:

```bash
npm run test:container:runtime
```

Por padrão, esse comando constrói o tarball Linux com `--docker`, cria uma
imagem mínima a partir de `docker/cate-runtime/Dockerfile`, executa o teste E2E
opt-in contra o daemon real e remove a imagem temporária. O teste confirma
handshake, leitura e escrita no workspace, mount somente leitura com escrita
recusada e rejeição de caminhos fora da raiz.

O smoke tambem confirma que uma tag temporaria inexistente falha com `--pull
never` antes da imagem real ser construida. Assim, o teste cobre a falha de
imagem sem depender de pull ou de uma imagem remota.

O mesmo smoke pode ser executado com Podman em Linux:

```bash
CATE_CONTAINER_ENGINE=podman npm run test:container:runtime
```

Neste host Windows, o smoke equivalente foi executado em um harness Fedora 44
privilegiado sobre o kernel WSL2, com Podman 5.8.4. Isso valida o runtime real,
mas nao substitui a matriz Docker/Podman do CI Linux.

ou:

```bash
npm run test:container:runtime:podman
```

Com Podman, o tarball é construído nativamente (sem `--docker`) para usar o
runtime Linux local. O CI Linux instala Podman e executa a matriz Docker/Podman;
em hosts Windows ou macOS, a validação Podman deve ser feita em um runner Linux
ou VM Linux. O engine continua dependendo de um daemon instalado no host; os
contratos compartilhados não
assumem diferenças entre os dois engines.
