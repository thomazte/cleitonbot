# Stack e tecnologias

## Runtime e linguagem

| Tecnologia | Versão / uso | Papel |
|------------|--------------|--------|
| **Node.js** | ≥ 18 (recomendado 20 LTS) | Runtime JavaScript no servidor |
| **ES Modules** | `"type": "module"` | Import/export nativos, sem CommonJS |
| **dotenv** | dependência | Carrega variáveis de ambiente a partir de `.env` |

## WhatsApp e sessão

| Tecnologia | Papel |
|------------|--------|
| **@whiskeysockets/baileys** | Cliente WhatsApp Multi-Device (Web protocol), eventos, download de mídia, envio de stickers |
| **qrcode-terminal** | Exibe QR de pareamento no terminal na primeira autenticação / logout |
| **useMultiFileAuthState** | Persiste credenciais e chaves Signal em arquivos sob `auth_info_baileys/` |

Baileys não usa a API oficial do WhatsApp Business Cloud. A operação depende de sessão válida (aparelho conectado) e das políticas da plataforma.

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

### Limites aplicados no código

| Parâmetro | Valor |
|-----------|--------|
| Tamanho do canvas | 512 × 512 px |
| Alvo figurinha estática | ≤ ~200 KB |
| Alvo figurinha animada | ≤ ~500 KB |
| Duração máxima do vídeo de entrada | 30 s |
| Trecho usado na figurinha animada | ~4,5 s |

## Observabilidade

| Tecnologia | Papel |
|------------|--------|
| **pino** | Logger estruturado (níveis configuráveis via `LOG_LEVEL`) |

Logs do Baileys interno costumam ser silenciados para reduzir ruído; o processo da aplicação registra eventos de comando, falhas de conversão e estado de conexão.

## Operação em produção

| Tecnologia | Papel |
|------------|--------|
| **PM2** | Process manager (reinício, logs, persistência após reboot) |
| **Linux (Ubuntu)** | Ambiente típico de VPS (Hetzner Cloud ou equivalente) |

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

1. **Baileys em vez de Cloud API oficial** — menor atrito para bot pessoal/grupo; exige gestão de sessão e aceite do risco de instabilidade/banimento da conta.
2. **Sharp + FFmpeg** — Sharp cobre estáticas com qualidade e performance; FFmpeg cobre animação, onde o WhatsApp é sensível a fps, duração e tamanho.
3. **Dois modos de fit** — `fill` para figurinha “achatada”; `contain` para respeitar a proporção original.
4. **EXIF via webpmux** — permite que o app mostre pacote/autor customizados (`!s Pacote | Autor` / `!so Pacote | Autor`).
5. **Arquivos multi-auth** — facilita backup/restauração da sessão e troca de número (apagando a pasta de auth).
