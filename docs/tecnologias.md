# Stack e tecnologias

## Runtime e linguagem

| Tecnologia | Versão / uso | Papel |
|------------|--------------|--------|
| **Node.js** | ≥ 18 (recomendado 20 LTS) | Runtime JavaScript no servidor |
| **ES Modules** | `"type": "module"` | Import/export nativos, sem CommonJS |
| **dotenv** | dependência | Carrega variáveis de ambiente a partir de `.env` |

## WhatsApp

| Tecnologia | Papel |
|------------|--------|
| **WhatsApp Cloud API** (Graph `v23.0`) | Caminho de produção: recebe mensagens no webhook e envia texto ou figurinha |
| **Node `http`** | Servidor do webhook em `127.0.0.1:3000`; o Nginx publica o HTTPS |
| **@whiskeysockets/baileys** | Cliente antigo, por QR. O processo fica parado para não disputar o número com a API oficial |
| **qrcode-terminal** | QR de pareamento do Baileys. O QR do README é só o link de contato (`wa.me`) |

## Processamento de mídia

| Tecnologia | Papel |
|------------|--------|
| **sharp** | Pipeline de imagem: rotate, resize 512×512 (`fill` ou `contain`), export WebP com controle de qualidade |
| **fluent-ffmpeg** | Orquestra chamadas ao FFmpeg para GIF/vídeo → WebP animado |
| **FFmpeg / ffprobe** | Binários de sistema: corte de duração, fps, escala (`fill` / `contain` + pad transparente) e compressão |
| **node-webpmux** | Injeta EXIF de figurinha (nome do pacote, autor, emoji) no WebP final |

### Modos de encaixe

| Modo | Comando | Comportamento |
|------|---------|---------------|
| `fill` | `!s` / `!fig` / `!sticker` / `s` | Estica até preencher 512×512 |
| `contain` | `!so` / `!soriginal` / `!prop` | Mantém proporção; preenche o resto com transparência |

Link de GIF usa o mesmo modo do comando (`!s` = `fill`, `!so` = `contain`). Um link sozinho entra como `fill`. O download está em `src/services/remoteGif.js` (HTTP do Node, sem biblioteca extra).

### Limites aplicados no código

| Parâmetro | Valor |
|-----------|--------|
| Tamanho do canvas | 512 × 512 px |
| Alvo figurinha estática (serviço) | ≤ ~200 KB |
| Alvo figurinha estática (Cloud API) | ≤ 100 KB (recompressão extra se passar) |
| Alvo figurinha animada | ≤ 500 KB |
| Duração máxima do vídeo de entrada | 30 s |
| Trecho usado na figurinha animada | ~10 s |
| Tamanho máximo do arquivo baixado por link | 15 MB |
| Portas aceitas no link | 80 e 443 |

## Observabilidade

| Tecnologia | Papel |
|------------|--------|
| **pino** | Logger estruturado (níveis configuráveis via `LOG_LEVEL`) |

O webhook escreve no stdout do PM2 quem chamou, o comando e o status de entrega. O logger Pino fica no processo Baileys.

## Operação em produção

| Tecnologia | Papel |
|------------|--------|
| **PM2** | Processo `cleiton-webhook` (produção). `cleiton-bot` é o Baileys e permanece parado |
| **Nginx + Let's Encrypt** | HTTPS público do webhook |
| **Linux (Ubuntu)** | VPS (Hetzner Cloud ou equivalente) |

## Dependências diretas (`package.json`)

```text
@whiskeysockets/baileys
dotenv
fluent-ffmpeg
node-webpmux
pino
qrcode-terminal
sharp
```

Dependências de sistema **obrigatórias** fora do npm: **FFmpeg** e **ffprobe** no `PATH` (ou caminhos explícitos em `FFMPEG_PATH` / `FFPROBE_PATH`).

## Decisões técnicas relevantes

1. **Cloud API em produção** — o número fica dentro das regras da Meta. A resposta a quem chama o bot não exige pagamento nem verificação da empresa. O Baileys permanece no código, desligado.
2. **Sharp + FFmpeg** — Sharp cobre estáticas; FFmpeg cobre a animação, em que o WhatsApp limita fps, duração (10 s) e tamanho (500 KB).
3. **Dois modos de fit** — `fill` para figurinha esticada; `contain` para a proporção original.
4. **EXIF via webpmux** — o app mostra pacote e autor (`!s Pacote | Autor` / `!so Pacote | Autor`).
5. **Só conversa individual** — a API oficial não entra em grupo comum do WhatsApp.
