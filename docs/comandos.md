# API de comandos

Contrato funcional dos comandos interpretados pelo bot. Entrada: texto da mensagem (ou legenda de mídia). Saída: texto de boas-vindas, ajuda, figurinha ou mensagem de erro amigável.

## Mensagem sem comando (boas-vindas)

Qualquer texto que **não** seja um comando reconhecido dispara uma orientação para usar `!ajuda`.

| Detalhe | Comportamento |
|---------|----------------|
| Gatilho | Texto livre (ex.: `oi`, `olá`) que não casa com `!s` / `!menu` / etc. |
| Resposta | `WELCOME_TEXT` — apresenta o bot e indica `!ajuda` |
| Cooldown | 30 minutos por chat (evita spam se o usuário continuar falando) |
| Exceções | Mensagens `fromMe` (do próprio número do bot) são ignoradas |
| Código | `src/handlers/messageHandler.js` (`WELCOME_TEXT`, `welcomeSentAt`) |

## Gatilhos de figurinha

| Padrão aceito | Exemplo |
|---------------|---------|
| `!s` | `!s` |
| `!sticker` | `!sticker` |
| `!fig` | `!fig` |
| `s` | `s` (sem `!`) |

Regex de referência (simplificada): `^(?:!s(?:ticker)?|!fig|s)(?:\s+...)?$` (case-insensitive).

### Metadados opcionais

Após o comando, o usuário pode informar pacote e autor separados por `|`:

```text
!s Nome do Pacote | Autor
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

A mídia é esticada até preencher 512×512. A proporção original não é mantida: não há barras transparentes e os cantos da mídia original entram na figurinha.

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
| Comando sem mídia | Orienta a enviar/responder uma mídia com `!s` |
| Vídeo > 30 s | Rejeição com mensagem clara |
| Falha de download/conversão | Mensagem `⚠️` com motivo resumido |
| FFmpeg ausente | Conversão animada pode falhar; estáticas (Sharp) podem seguir |

## Extensão

Para novos comandos:

1. Adicionar reconhecimento no `messageHandler.js`.
2. Documentar aqui o contrato (gatilho, parâmetros, efeitos colaterais).
3. Evitar lógica de mídia no handler — preferir serviços em `src/services/`.
