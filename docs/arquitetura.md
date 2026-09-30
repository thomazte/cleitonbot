# Arquitetura

## Visão geral

Em produção o Cleiton usa a **WhatsApp Cloud API**. A Meta entrega as mensagens num webhook HTTPS; o processo responde com texto ou figurinha na mesma conversa individual. O número não entra em grupos.

O cliente **Baileys** (`src/index.js`) continua no repositório, mas fica parado no servidor. Subir esse processo de novo abre sessão por QR no mesmo número e entra em conflito com a API oficial.

```text
WhatsApp  →  Meta Cloud API  →  HTTPS /webhook  →  handleMessage  →  StickerService  →  figurinha
                                      ↑
                               127.0.0.1:3000
                               (atrás do Nginx)
```

## Componentes

| Módulo | Responsabilidade |
|--------|------------------|
| `src/webhook.js` | Servidor HTTP: verificação do webhook, `/health` e recebimento das mensagens |
| `src/cloud/handleMessage.js` | Comandos, boas-vindas e conversão na API oficial |
| `src/cloud/client.js` | Graph API: texto, download de mídia, upload e envio de figurinha |
| `src/services/stickerService.js` | Conversão imagem/vídeo → WebP + metadados EXIF (pacote/autor) |
| `src/services/remoteGif.js` | Download de link de GIF (arquivo direto, Tenor ou Giphy) |
| `src/utils/fileCleaner.js` | Diretórios temporários e limpeza de arquivos intermediários |
| `src/utils/ffmpegPaths.js` | Resolução de caminhos do FFmpeg/ffprobe (PATH ou `.env`) |
| `src/index.js` | Cliente Baileys (legado). Não usar com o número que está na Cloud API |
| `src/handlers/messageHandler.js` | Comandos do caminho Baileys, inclusive reply a mídia citada |

## Fluxo de mensagens (Cloud API)

1. A Meta faz `POST /webhook`. O servidor responde `200` e só então trata o corpo.
2. Se for `!menu` / `!ajuda` → envia o texto de ajuda.
3. Se for texto sem comando e sem link de GIF → envia a boas-vindas pedindo `!ajuda`.
4. Se for `!s` / `!so` (e variantes) na **legenda** da mídia, um comando com link, ou só o link de GIF → segue o fluxo da figurinha.
5. Status de entrega (`sent`, `read`, `failed`) só é registrado no log.

Responder (reply) a uma mídia antiga não dispara figurinha neste caminho. Com arquivo anexado, o comando precisa estar na legenda. Com link, o comando e o endereço vão no texto.

## Fluxo de uma figurinha

1. O usuário envia a mídia com a legenda `!s` ou `!so`, ou manda um link de GIF.
2. O handler define o modo (`fill` ou `contain`) e baixa a mídia pela Graph API, ou o arquivo do link.
3. `StickerService` gera WebP:
   - **Imagem:** Sharp → 512×512 (`fill` estica; `contain` preserva proporção + transparência). Se passar de 100 KB, a Cloud API comprime de novo.
   - **GIF/vídeo:** FFmpeg → 512×512 no mesmo modo, clip ~10 s, fps limitado, tamanho alvo de 500 KB.
4. Metadados de pacote/autor são injetados com `node-webpmux`.
5. O WebP é enviado como figurinha para quem chamou.

## Grupos

A Cloud API não coloca o número num grupo comum do WhatsApp. A API de grupos da Meta cria grupos novos, só para conta comercial oficial, com no máximo 8 pessoas e entrada por link. Não recupera grupos antigos.

## Persistência

| Caminho | Uso |
|---------|-----|
| `.env` | Token, Phone Number ID, segredo do webhook, pacote, autor, logs |
| `temp/` | Arquivos intermediários de conversão (limpos após o uso) |
| `auth_info_baileys/` | Sessão antiga do Baileys (não versionar; não religar em produção) |

## Princípios de desenho

- **Transporte separado da mídia:** o webhook e a Graph API não conhecem FFmpeg; o `StickerService` não conhece a Meta.
- **Resposta dentro da janela de atendimento:** quem manda mensagem primeiro recebe a resposta. Isso não exige pagamento nem verificação da empresa.
- **Compatibilidade WhatsApp:** canvas 512×512, estática até 100 KB na API oficial, animada até 500 KB e no máximo 10 s.

## Estrutura do repositório

```text
cleitonbot/
├── src/
│   ├── webhook.js          # entrada em produção
│   ├── cloud/
│   ├── index.js            # Baileys (legado)
│   ├── handlers/
│   ├── services/
│   └── utils/
├── scripts/                # Validação dos modos fill/contain (local + VPS)
├── docs/
├── assets/                 # QR de contato (wa.me), não é QR de pareamento
├── temp/                   # Runtime
├── auth_info_baileys/      # Runtime legado (sessão Baileys)
├── .env.example
├── package.json
├── LICENSE
└── README.md
```
