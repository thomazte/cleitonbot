# Arquitetura

## Visão geral

O Cleiton Bot é um cliente WhatsApp não oficial baseado em **Baileys**. Ele mantém uma sessão persistente (pasta de autenticação), recebe eventos de mensagens, interpreta comandos de texto e, quando há mídia associada, converte a mídia em figurinha WebP compatível com o WhatsApp.

```text
WhatsApp  ←→  Baileys (socket)  →  messageHandler  →  StickerService  →  figurinha
                      ↑
               auth_info_baileys
               (sessão Multi-Device)
```

## Componentes

| Módulo | Responsabilidade |
|--------|------------------|
| `src/index.js` | Bootstrap, socket Baileys, QR no terminal, reconexão, integração com PM2/processo |
| `src/handlers/messageHandler.js` | Parsing de comandos, boas-vindas (texto sem comando), resolução de mídia, download e resposta |
| `src/services/stickerService.js` | Conversão imagem/vídeo → WebP + metadados EXIF (pacote/autor) |
| `src/utils/fileCleaner.js` | Diretórios temporários e limpeza de arquivos intermediários |
| `src/utils/ffmpegPaths.js` | Resolução de caminhos do FFmpeg/ffprobe (Windows e Linux) |

## Fluxo de mensagens

1. Chega texto ou mídia via `messages.upsert` (Baileys).
2. Se for `!menu` / `!ajuda` → envia `HELP_TEXT`.
3. Se for texto sem comando → envia boas-vindas (`WELCOME_TEXT`) com cooldown de 30 min por chat.
4. Se for comando de figurinha (`!s` / etc.) → segue o fluxo abaixo.

## Fluxo de uma figurinha

1. Usuário envia mídia com legenda `!s` (ou responde a uma mídia com `!s`).
2. O handler valida o comando e localiza a mídia (mensagem atual ou citada).
3. A mídia é baixada via `downloadMediaMessage` (Baileys).
4. `StickerService` gera WebP:
   - **Imagem:** Sharp (esticada para 512×512, sem preservar a proporção, compressão).
   - **GIF/vídeo:** FFmpeg (esticado para 512×512, clip ~4,5 s, fps limitado, tamanho alvo).
5. Metadados de pacote/autor são injetados com `node-webpmux`.
6. O bot responde com a figurinha na mesma conversa (mensagem citada).

## Persistência

| Caminho | Uso |
|---------|-----|
| `auth_info_baileys/` | Credenciais e chaves da sessão Multi-Device (não versionar) |
| `temp/` | Arquivos intermediários de conversão (limpos após o uso) |
| `.env` | Configuração local (pacote padrão, autor, logs, paths) |

## Princípios de desenho

- **Separação de camadas:** transporte (Baileys) ≠ regras de comando ≠ conversão de mídia.
- **Idempotência parcial:** IDs de mensagem processados são lembrados em memória para evitar figurinha duplicada em eventos `notify`/`append`.
- **Resiliência:** reconexão automática no socket; sessão invalidada exige novo pareamento por QR.
- **Compatibilidade WhatsApp:** canvas 512×512, limites de tamanho e duração alinhados ao que o app aceita bem.

## Estrutura do repositório

```text
cleitonbot/
├── src/
│   ├── index.js
│   ├── handlers/
│   ├── services/
│   └── utils/
├── scripts/              # Validação do esticamento quadrado
├── docs/                 # Documentação técnica
├── docs/assets/          # Assets públicos (ex.: QR do contato)
├── temp/                 # Runtime
├── auth_info_baileys/    # Runtime (sessão)
├── .env.example
├── package.json
├── LICENSE
└── README.md             # Guia do usuário final
```
