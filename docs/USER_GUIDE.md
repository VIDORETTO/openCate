# Guia de uso do Cate

O Cate transforma uma pasta em um workspace visual para executar agentes CLI,
terminais, editores e ferramentas lado a lado. O canvas guarda a geometria e
os painéis; o dock organiza painéis em abas e divisões.

## Começo rápido

1. Instale uma versão publicada na página de releases.
2. Abra uma pasta confiável como workspace.
3. Use `Ctrl+K` (Windows/Linux) ou `Cmd+K` (macOS) para procurar comandos,
   painéis e arquivos.
4. Crie um terminal no canvas e execute o CLI de sua preferência, por exemplo
   Claude Code, Codex, Gemini CLI, OpenCode, Pi ou Aider.
5. Arraste painéis para organizar o espaço. O layout é salvo por projeto.

O primeiro uso de uma pasta pode pedir confirmação de confiança. Isso é
intencional: arquivos de configuração do projeto não devem iniciar extensões ou
agentes sem uma decisão explícita do usuário.

## Terminais e agentes

Cada terminal tem um PTY próprio. O Cate acompanha estados como trabalhando,
aguardando resposta, concluído, erro e parado quando o agente fornece sinais
estruturados ou quando o fallback suportado consegue inferi-los.

O terminal pode ser nomeado, marcado com estrela, tags e cor. Esses metadados,
assim como scrollback limitado e dicas de retomada, pertencem à sessão local.
O Cate não copia scrollback inteiro para o barramento de contexto ou para a
auditoria de autoria.

## Worktrees e missões paralelas

Use a ação de missão de worktree para criar, em uma confirmação, um worktree,
um terminal, um agente e uma tarefa inicial. Cada worktree recebe território
visual próprio. Antes de integrar, revise o diff, aprove hunks quando
necessário e passe pela fila de merge.

Commits e pull requests são ações assistidas: o Cate verifica o estado atual,
mostra o que será feito e não deve publicar trabalho sem a confirmação pedida
pela interface.

## Tarefas, contexto e memória

Na árvore do workspace, tarefas podem registrar objetivo, restrições,
dependências, resultado validado, logs curtos e artefatos. A prontidão é
derivada de dependências concluídas; a paralelização é limitada por worktree.

Memória de projeto é curada pelo usuário e exige uma citação de origem. Use o
barramento de contexto para entregar uma seleção, arquivo ou diff específico a
outro terminal. Relações só são desenhadas depois de uma entrega explícita.

Os arquivos `.cate/` relevantes são:

- `workspace.json`: layout compartilhável do projeto;
- `session.json`: estado local da sessão;
- `memory.json`: notas curadas;
- `tasks.json`: contratos de tarefa;
- `agent-audit.json`: metadados bounded de autoria, sem conteúdo de prompt.

## Acesso remoto

Um workspace pode usar um runtime local, SSH ou WSL. O daemon remoto executa
PTYs, Git, busca e leitura/escrita autorizada no host remoto; a interface,
canvas, editor e navegador continuam no desktop. A conexão usa um túnel
autenticado e a reconexão automática tem limite de tentativas.

Uma queda pode restaurar o layout e o scrollback, mas não revive um processo
interativo que morreu com o daemon. Ver [Troubleshooting](TROUBLESHOOTING.md)
para diagnóstico.

## Privacidade e extensões

Telemetria de uso e eventos de crash ficam desligados por padrão e só são
enviados após ativação em Welcome ou Settings. O feedback externo envia apenas
rating e metadados bounded, nunca o texto livre.

Extensões rodam em webviews isoladas e devem ser habilitadas conscientemente.
Não cole tokens em tickets ou capturas de tela. Para os limites conhecidos e o
modelo de ameaça, consulte [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

## Limitações atuais

- Canvas dentro de canvas não é suportado pelo contrato atual; canvases são
  painéis independentes no dock ou no canvas principal.
- Reiniciar o daemon encerra PTYs que não estejam protegidos por uma camada de
  durabilidade externa.
- Hosts remotos precisam de um runtime compatível e, para PTYs, de uma build
  compatível de `node-pty`.

Para automatizar a superfície pública, consulte [CLI_SDK.md](CLI_SDK.md).
