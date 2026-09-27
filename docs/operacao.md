# Operação e deploy

## Pré-requisitos

- Node.js **18+** (recomendado 20 LTS)
- FFmpeg e ffprobe instalados
- Conta WhatsApp dedicada ao bot (recomendado: não usar número pessoal)
- VPS Linux (Ubuntu) sempre ligada para operação 24h, com PM2

## Configuração

```bash
cp .env.example .env
npm install
```

### Variáveis de ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `STICKER_PACK` | Nome do pacote EXIF quando o usuário não informa | `Cleiton Bot` |
| `STICKER_AUTHOR` | Autor EXIF padrão | `Cleiton` |
| `AUTH_DIR` | Pasta da sessão Baileys | `auth_info_baileys` |
| `TEMP_DIR` | Pasta de arquivos temporários | `temp` |
| `LOG_LEVEL` | Nível do Pino (processo Baileys) | `info` |
| `WHATSAPP_TOKEN` | Token permanente da Cloud API. Só no `.env` do servidor | — |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID do número na Meta | — |
| `WEBHOOK_PORT` | Porta local do webhook | `3000` |
| `WEBHOOK_VERIFY_TOKEN` | Segredo que a Meta envia na verificação do webhook | — |
| `FFMPEG_PATH` | Caminho absoluto do ffmpeg (se não estiver no `PATH`) | — |
| `FFPROBE_PATH` | Caminho absoluto do ffprobe (se não estiver no `PATH`) | — |

No Linux/VPS, deixe `FFMPEG_PATH` / `FFPROBE_PATH` comentados se os binários estiverem no `PATH`.

## Execução local do webhook

```bash
npm run webhook    # Cloud API (produção)
npm start          # Baileys, só se o número NÃO estiver na Cloud API
npm run dev        # Baileys com reinício ao salvar
```

O webhook escuta em `127.0.0.1` e exige `WEBHOOK_VERIFY_TOKEN`. Sem `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` ele recebe a Meta, mas não responde.

## Produção (Cloud API)

O processo no ar é o `cleiton-webhook`. O `cleiton-bot` (Baileys) fica **parado**: um restart dele tenta parear de novo o número que já está na API oficial.

URL pública do webhook: `https://cleitonbot.duckdns.org/webhook`  
Nginx encaminha `/webhook` e `/health` para `127.0.0.1:3000`.

```bash
cd /root/cleitonbot
npm install
pm2 start src/webhook.js --name cleiton-webhook --cwd /root/cleitonbot
pm2 save
```

Comandos úteis:

```bash
pm2 status
pm2 logs cleiton-webhook
pm2 restart cleiton-webhook --update-env
```

Não rode `pm2 restart cleiton-bot`.

### Atualizar código a partir do Linux local

```bash
rsync -avz -e "ssh -i ~/.ssh/CHAVE" \
  --exclude node_modules --exclude auth_info_baileys --exclude temp --exclude .git --exclude .env \
  ./ root@IP:/root/cleitonbot/
```

No VPS:

```bash
cd /root/cleitonbot
npm install
pm2 restart cleiton-webhook --update-env
```

O `.env` do servidor não vai no git nem nesse rsync. Token, Phone Number ID e o segredo do webhook ficam só lá, com permissão `600`.

Na Meta, o app precisa estar inscrito no WhatsApp Business Account (`subscribed_apps`) e o número com **Assinar webhooks** ligado. Resposta a quem manda mensagem primeiro não usa pagamento nem verificação da empresa.

## Produção antiga (Baileys)

Estes comandos valem só para um número que **não** esteja registrado na Cloud API.

```bash
cd /root/cleitonbot
pm2 start src/index.js --name cleiton-bot --cwd /root/cleitonbot
pm2 logs cleiton-bot
```

No primeiro start o terminal mostra um QR de pareamento: **WhatsApp → Aparelhos conectados → Conectar um aparelho**. Esse QR não é o do README. O do README abre a conversa (`https://wa.me/556284818765`).

## Validar modos fill / contain

Um comando roda a mesma checagem nesta máquina e no VPS: gera mídia fora de proporção, converte em figurinha e valida:

- **`fill` (`!s`)**: 512×512 esticado, sem barras transparentes
- **`contain` (`!so`)**: 512×512 com proporção original e transparência nas bordas

```bash
export CLEITON_SSH_HOST=IP_DO_VPS
export CLEITON_SSH_USER=root
export CLEITON_SSH_KEY=$HOME/.ssh/CHAVE
export CLEITON_REMOTE_DIR=/root/cleitonbot

npm run validate:square
```

O script sincroniza `stickerService.js` e o teste para o VPS. **Não** reinicia o PM2. Depois que os dois passarem:

```bash
pm2 restart cleiton-webhook --update-env
```

Sem as variáveis, o script usa os padrões definidos em `scripts/validate-square-both.mjs`.

## Trocar o número (só no Baileys)

Não use isto no número que já está na Cloud API.

```bash
pm2 stop cleiton-bot
rm -rf /root/cleitonbot/auth_info_baileys
pm2 start cleiton-bot
pm2 logs cleiton-bot
```

## Segurança e boas práticas

- Não versione `.env`, `WHATSAPP_TOKEN` nem `auth_info_baileys/`.
- O webhook só escuta em localhost; o HTTPS fica no Nginx.
- Monitore `pm2 logs cleiton-webhook` depois de cada deploy.
- Guarde a chave SSH privada (`~/.ssh/...`) com permissão `600`.

## Licença

MIT — Copyright © 2026 ZamohtExe. Ver [LICENSE](../LICENSE).
