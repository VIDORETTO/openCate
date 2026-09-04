# Identidade do openCate

Este documento registra a identidade atualmente adotada pelo produto e o
contrato que deve permanecer estável entre o aplicativo desktop, o companion
web e os artefatos de distribuição.

## Nome e posicionamento

- Nome exibido: **openCate**.
- Identificador npm: `opencate`.
- Descritor: **An infinite zoomable canvas IDE**.
- App ID desktop: `com.opencate.app`.
- Repositório e canal de distribuição: `VIDORETTO/openCate`.

O nome `openCate` é a decisão canônica existente no código, no wordmark e nos
metadados de empacotamento. Alterá-lo exige uma decisão de produto coordenada;
não se deve trocar somente o `productName` ou o `appId`.

## Marca visual

- Wordmark claro: [`assets/opencate-logo.svg`](../assets/opencate-logo.svg).
- Wordmark escuro: [`assets/opencate-logo-light.svg`](../assets/opencate-logo-light.svg).
- Componente React reutilizável: [`OpenCateLogo.tsx`](../src/renderer/ui/OpenCateLogo.tsx).
- Ícone fonte desktop: [`scripts/generate-icons.js`](../scripts/generate-icons.js).
- Ícones gerados: `build/icon.png`, `build/icon.ico` e `build/icon.icns` no
  host macOS.
- Companion: [`companion-web/public/opencate-logo.svg`](../companion-web/public/opencate-logo.svg).

O wordmark usa formas geométricas inclinadas em caixa alta. O ícone quadrado
usa o mesmo wordmark centralizado em fundo escuro; não deve receber uma fonte
ou símbolo diferente em uma plataforma sem atualizar a fonte SVG e regenerar
os formatos derivados.

## Tokens visuais

O renderer usa uma pilha sans nativa e tokens de tema, com fallback dark-warm:

| Uso | Token/valor canônico |
| --- | --- |
| Fonte da interface | `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `Helvetica Neue`, `sans-serif` |
| Canvas | `#161513` |
| Superfície base | `#1d1c1a` |
| Chrome/título | `#232220` |
| Texto primário | `#e8e6e3` |
| Texto secundário | `#a8a49e` |
| Foco/seleção | `#4a9eff` |
| Atividade | `#4dd964` |
| Aviso | `#ff9f0a` |
| Fundo do ícone gerado | `#1e1e24` |

As definições de runtime vivem em `src/shared/themes/` e o fallback precisa
continuar sincronizado com `src/renderer/styles/globals.css`.

## Contrato de empacotamento

`package.json` e `electron-builder.yml` devem manter, em conjunto:

- `productName` e `desktopName` como `openCate`;
- `appId` como `com.opencate.app`;
- `build/icon.icns` para macOS, `build/icon.ico` para Windows e
  `build/icon.png` para Linux;
- o nome de instalador Windows `openCate-Setup-<version>.<ext>`;
- `syncDesktopName: true` no alvo Linux, para o nome exibido acompanhar o
  produto.

Para regenerar os derivados depois de uma alteração deliberada no wordmark:

```bash
npm run icons
```

Esta documentação não substitui aprovação jurídica de marca, revisão de
marketing ou autorização dos owners para publicação.
