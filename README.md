# Cleiton Bot

Bot de figurinhas para WhatsApp — envie uma mídia e receba a figurinha na hora.

## Adicionar o Cleiton

Escaneie o QR Code abaixo com a câmera do celular (ou pelo WhatsApp) para abrir uma conversa:

![QR Code para conversar com Cleiton no WhatsApp](./assets/cleiton-whatsapp-qr.png)

https://wa.me/556284818765

## Como usar

| Comando | O que faz |
|---------|-----------|
| `!s` · `!fig` · `!sticker` · `s` | Figurinha **esticada** (preenche o quadrado) |
| `!so` · `!soriginal` · `!prop` | Figurinha com **proporção original** |
| `!s https://link-do-gif` | Figurinha esticada a partir de um **link** (vale também para `!so`, `!fig`, `!sticker`, `!soriginal` e `!prop`) |
| só o link | Igual a `!s`, se for Tenor, Giphy, um post do X com vídeo/GIF, ou arquivo `.gif`, `.mp4`, `.webm` ou `.webp` |
| `!s Pacote \| Autor` | Define o nome do pacote e o autor (vale também para `!so` e para o link) |
| `!menu` · `!ajuda` | Mostra a ajuda rápida |

### Passo a passo

1. Abra a conversa com o Cleiton (QR acima).
2. Se mandar qualquer texto sem comando (ex.: `oi`), o bot responde pedindo para usar `!ajuda`.
3. Digite `!ajuda` (ou `!menu`) para ver as instruções.
4. Envie uma **imagem**, **GIF** ou **vídeo** com a legenda `!s` ou `!so`.
5. Ou mande o **link** do GIF (arquivo direto, Tenor, Giphy ou um post do X):

```text
!s https://link-do-gif
!so https://link-do-gif
https://link-do-gif
```

O link pode ser uma página do **Tenor** ou do **Giphy**, um post público do **X** com vídeo ou GIF (`x.com` ou `twitter.com`), ou o arquivo direto (`.gif`, `.mp4`, `.webm`, `.webp`). Um link sozinho, sem comando, vira figurinha esticada.

Opcional — personalize o pacote e o autor:

```text
!s Meu Pacote | Meu Nome
!so Meu Pacote | Meu Nome
!s https://link-do-gif Meu Pacote | Meu Nome
!so https://link-do-gif Meu Pacote | Meu Nome
```

### Limites

- Vídeos mais longos entram: a figurinha usa os primeiros **10 segundos**
- Link de GIF de até **15 MB**, em `http` ou `https` nas portas 80 e 443
- Figurinhas estáticas e animadas no formato do WhatsApp (512×512)
- `!s` **estica** a mídia até preencher o quadrado
- `!so` **mantém** a proporção original (o restante fica transparente)
- Só conversa individual. O Cleiton não entra em grupos

Link direto: [https://wa.me/556284818765](https://wa.me/556284818765)

## Apoie

Se o Cleiton te ajuda, você pode apoiar o projeto no [Ko-fi](https://ko-fi.com/zamohtexe).

---

Documentação técnica: [docs/](./docs/) · Licença: [MIT](./LICENSE) · © 2026 ZamohtExe
