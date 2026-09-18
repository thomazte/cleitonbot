# API de comandos

Contrato funcional dos comandos interpretados pelo bot. Entrada: texto da mensagem (ou legenda de mídia). Saída: texto de boas-vindas, ajuda, figurinha ou mensagem de erro amigável.

## Mensagem sem comando (boas-vindas)

Qualquer texto que **não** seja um comando reconhecido dispara uma orientação para usar `!ajuda`.

| Detalhe | Comportamento |
|---------|----------------|
| Gatilho | Texto livre (ex.: `oi`, `olá`) que não casa com `!s` / `!so` / `!menu` / etc. |
| Resposta | `WELCOME_TEXT` — apresenta o bot e indica `!ajuda` |
| Cooldown | 30 minutos por chat (evita spam se o usuário continuar falando) |
| Exceções | Mensagens `fromMe` (do próprio número do bot) são ignoradas |
| Código | `src/handlers/messageHandler.js` (`WELCOME_TEXT`, `welcomeSentAt`) |

## Gatilhos de figurinha

### Esticada (achatada)

| Padrão aceito | Exemplo |
|---------------|---------|
| `!s` | `!s` |
| `!sticker` | `!sticker` |
| `!fig` | `!fig` |
| `s` | `s` (sem `!`) |

Regex: `^(?:!s(?:ticker)?|!fig|s)(?:\s+...)?$` (case-insensitive).

Comportamento: a mídia é **esticada** até preencher 512×512 (`fit: fill`). Sem barras transparentes.

### Proporção original

| Padrão aceito | Exemplo |
|---------------|---------|
| `!so` | `!so` |
| `!soriginal` | `!soriginal` |
| `!prop` | `!prop` |

Regex: `^(?:!so(?:riginal)?|!prop)(?:\s+...)?$` (case-insensitive).

Comportamento: a mídia é redimensionada **mantendo a proporção** dentro de 512×512 (`fit: contain`). O restante fica transparente.

### Metadados opcionais

Após qualquer comando de figurinha, o usuário pode informar pacote e autor separados por `|`:

```text
!s Nome do Pacote | Autor
!so Nome do Pacote | Autor
```

| Entrada | Resultado |
|---------|-----------|
| (vazio) | Usa `STICKER_PACK` e `STICKER_AUTHOR` do `.env` |
| só pacote | Pacote customizado; autor padrão |
| `Pacote \| Autor` | Ambos customizados |

### Fontes de mídia

1. **Legenda:** imagem/GIF/vídeo enviados com o comando na caption.
2. **Reply:** mensagem de texto com o comando respondendo a uma mídia anterior.

Tipos reconhecidos: imagem, vídeo, GIF (via vídeo/documento), sticker estático (reprocessável como imagem) e sticker animado (tratado como vídeo/WebP).

### Formato da figurinha

O canvas final é sempre 512×512 (exigência do WhatsApp). O modo define só o encaixe da mídia nesse quadrado.

## Ajuda

| Comando | Resposta |
|---------|----------|
| `!menu` | Texto de ajuda (`HELP_TEXT`) |
| `!ajuda` | Idem |

O conteúdo da ajuda é definido em `src/handlers/messageHandler.js` (`HELP_TEXT`).

## Erros comuns (resposta ao usuário)

| Situação | Comportamento típico |
|----------|----------------------|
| Texto sem comando | Boas-vindas + pedido para usar `!ajuda` (com cooldown) |
| Comando sem mídia | Orienta a enviar/responder uma mídia com `!s` ou `!so` |
| Vídeo > 30 s | Rejeição com mensagem clara |
| Falha de download/conversão | Mensagem `⚠️` com motivo resumido |
| FFmpeg ausente | Conversão animada pode falhar; estáticas (Sharp) podem seguir |

## Extensão

Para novos comandos:

1. Adicionar reconhecimento no `messageHandler.js`.
2. Documentar aqui o contrato (gatilho, parâmetros, efeitos colaterais).
3. Evitar lógica de mídia no handler — preferir serviços em `src/services/`.
