# API de comandos

Contrato funcional dos comandos interpretados pelo bot. Entrada: texto da mensagem (ou legenda de mídia). Saída: texto de boas-vindas, ajuda, figurinha ou mensagem de erro amigável.

## Mensagem sem comando (boas-vindas)

Qualquer texto que **não** seja um comando reconhecido nem um link de GIF dispara uma orientação para usar `!ajuda`.

| Detalhe | Comportamento |
|---------|----------------|
| Gatilho | Texto livre (ex.: `oi`, `olá`) que não casa com `!s` / `!so` / `!menu` / etc. e não é um link de GIF |
| Exceções | Link sozinho do Tenor, do Giphy, de um post do X com vídeo/GIF, ou de arquivo `.gif` / `.mp4` / `.webm` / `.webp` vira figurinha esticada (`!s`). No Baileys, mensagens `fromMe` são ignoradas |
| Resposta | `WELCOME_TEXT` — apresenta o bot e indica `!ajuda` |
| Cooldown | Na Cloud API, não há cooldown. No Baileys, 30 minutos por chat |
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

### Link de GIF

O comando pode trazer um endereço no lugar da mídia anexada. Vale para todos os gatilhos de figurinha (`!s`, `!fig`, `!sticker`, `s`, `!so`, `!soriginal`, `!prop`):

```text
!s https://link-do-gif
!so https://link-do-gif
!s https://link-do-gif Meu Pacote | Autor
!so https://link-do-gif Meu Pacote | Autor
https://link-do-gif
```

| Entrada | Comportamento |
|---------|----------------|
| `!s` (e variantes de esticar) + URL | Baixa o arquivo e gera figurinha esticada |
| `!so` (e variantes de proporção) + URL | O mesmo, com proporção original |
| URL sozinha (Tenor, Giphy, post do X com vídeo/GIF, ou arquivo `.gif` / `.mp4` / `.webm` / `.webp`) | Equivale a `!s` |
| URL e depois `Pacote \| Autor` | Metadados opcionais, como na mídia anexada |
| Mídia anexada e URL na legenda | Usa a mídia anexada. A URL não vira nome de pacote |

| Origem do link | O que o bot baixa |
|----------------|-------------------|
| Página do Tenor (`tenor.com/view/...` ou atalho `tenor.com/....gif`) | Vídeo ou GIF das meta tags (`og:video`, `og:image`) |
| Página do Giphy (`giphy.com/gifs/...`) | `https://media.giphy.com/media/<id>/giphy.gif` |
| Post público do X (`x.com/.../status/...`, `twitter.com/.../status/...`, ou espelhos `fxtwitter.com`, `fixupx.com`, `vxtwitter.com`) | MP4 do vídeo ou GIF do post, pela API `api.fxtwitter.com`. Se houver várias qualidades, usa a maior que cabe em 15 MB. `/video/2` escolhe o segundo vídeo. Post sem vídeo/GIF é recusado |
| Arquivo direto (`.gif`, `.mp4`, `.webm`, `.webp`), inclusive `media.giphy.com` e `media.tenor.com` | O próprio arquivo |

O download recusa endereço local, link com usuário/senha, porta diferente de 80/443 e arquivo acima de 15 MB. Código: `src/services/remoteGif.js`.

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
| Comando sem mídia e sem link | Pede uma imagem, GIF ou vídeo, ou um link com `!s` / `!so` |
| Link que não é GIF | Recusa com o motivo (página sem mídia, arquivo grande, download falhou) |
| Vídeo longo | A figurinha usa os primeiros ~10 s |
| Falha de download/conversão | Na Cloud API: `Não consegui criar a figurinha.` + motivo. No Baileys: mensagem `⚠️` com o motivo |
| FFmpeg ausente | Conversão animada pode falhar; estáticas (Sharp) podem seguir |

## Extensão

Para novos comandos:

1. Adicionar reconhecimento em `src/cloud/handleMessage.js` (produção) e, se o Baileys ainda for usado, em `src/handlers/messageHandler.js`.
2. Documentar aqui o contrato (gatilho, parâmetros, efeitos colaterais).
3. Evitar lógica de mídia no handler — preferir serviços em `src/services/`.
