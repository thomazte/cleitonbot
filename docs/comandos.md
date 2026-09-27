# API de comandos

Contrato funcional dos comandos interpretados pelo bot. Entrada: texto da mensagem (ou legenda de mídia). Saída: texto de boas-vindas, ajuda, figurinha ou mensagem de erro amigável.

## Mensagem sem comando (boas-vindas)

Qualquer texto que **não** seja um comando reconhecido dispara uma orientação para usar `!ajuda`.

| Detalhe | Comportamento |
|---------|----------------|
| Gatilho | Texto livre (ex.: `oi`, `olá`) que não casa com `!s` / `!so` / `!menu` / etc. |
| Resposta | `WELCOME_TEXT` — apresenta o bot e indica `!ajuda` |
| Cooldown | Na Cloud API, não há cooldown. No Baileys, 30 minutos por chat |
| Exceções | No Baileys, mensagens `fromMe` são ignoradas |
| Código | Cloud API: `src/cloud/handleMessage.js`. Baileys: `src/handlers/messageHandler.js` |

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

Na **Cloud API** a figurinha sai da mídia cuja legenda é o comando (`!s` ou `!so`). Reply a uma mensagem antiga não é lido.

No **Baileys** também vale responder a uma mídia já enviada com o comando no texto.

Tipos reconhecidos na Cloud API: imagem, vídeo e documento (GIF). O Baileys ainda aceita sticker estático (como imagem) e sticker animado (como vídeo).

### Formato da figurinha

O canvas final é sempre 512×512 (exigência do WhatsApp). O modo define só o encaixe da mídia nesse quadrado.

## Ajuda

| Comando | Resposta |
|---------|----------|
| `!menu` | Texto de ajuda (`HELP_TEXT`) |
| `!ajuda` | Idem |

O texto de ajuda da produção está em `src/cloud/handleMessage.js` (`HELP_TEXT`). O do Baileys está em `src/handlers/messageHandler.js`.

## Grupos

A Cloud API não atende grupo. Quem quiser figurinha abre uma conversa individual com o número (QR ou `https://wa.me/556284818765`).

## Erros comuns (resposta ao usuário)

| Situação | Comportamento típico |
|----------|----------------------|
| Texto sem comando | Boas-vindas pedindo `!ajuda` |
| Comando sem mídia | Pede uma imagem, GIF ou vídeo com a legenda `!s` ou `!so` |
| Vídeo > 30 s | Rejeição com mensagem clara |
| Falha de download/conversão | Mensagem `⚠️` com motivo resumido |
| FFmpeg ausente | Conversão animada pode falhar; estáticas (Sharp) podem seguir |

## Extensão

Para novos comandos:

1. Adicionar reconhecimento em `src/cloud/handleMessage.js` (produção) e, se o Baileys ainda for usado, em `src/handlers/messageHandler.js`.
2. Documentar aqui o contrato (gatilho, parâmetros, efeitos colaterais).
3. Evitar lógica de mídia no handler — preferir serviços em `src/services/`.
