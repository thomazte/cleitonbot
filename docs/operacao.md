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
| `LOG_LEVEL` | Nível do Pino | `info` |
| `FFMPEG_PATH` | Caminho absoluto do ffmpeg (se não estiver no `PATH`) | — |
| `FFPROBE_PATH` | Caminho absoluto do ffprobe (se não estiver no `PATH`) | — |

No Linux/VPS, deixe `FFMPEG_PATH` / `FFPROBE_PATH` comentados se os binários estiverem no `PATH`.

## Execução local

```bash
npm start          # produção / processo único
npm run dev        # reinicia ao salvar (node --watch)
```

No primeiro start (ou após logout), o terminal exibe um **QR Code**. No celular:

**WhatsApp → Aparelhos conectados → Conectar um aparelho**

Não use a câmera do sistema fora dessa tela.

## Produção com PM2 (VPS)

Layout típico no servidor: `/root/cleitonbot` (ou `~/cleitonbot`).

```bash
cd /root/cleitonbot
npm install
pm2 start src/index.js --name cleiton-bot --cwd /root/cleitonbot
pm2 save
pm2 startup    # seguir o comando sugerido pelo PM2
```

Comandos úteis:

```bash
pm2 status
pm2 logs cleiton-bot
pm2 restart cleiton-bot
```

### Atualizar código a partir do Linux local

```bash
rsync -avz -e "ssh -i ~/.ssh/CHAVE" \
  --exclude node_modules --exclude auth_info_baileys --exclude temp --exclude .git \
  ./ root@IP:/root/cleitonbot/
```

No VPS:

```bash
cd /root/cleitonbot
npm install
pm2 restart cleiton-bot
```

**Não copie** `auth_info_baileys` entre máquinas a menos que saiba o que está fazendo — o pareamento limpo no servidor é mais seguro.

### QR de sessão no VPS

```bash
ssh -i ~/.ssh/CHAVE root@IP 'pm2 logs cleiton-bot --lines 60'
```

Para forçar novo QR (troca de número / sessão inválida), veja a seção abaixo.

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
pm2 restart cleiton-bot
```

Sem as variáveis, o script usa os padrões definidos em `scripts/validate-square-both.mjs`.

## Trocar o número do bot

```bash
pm2 stop cleiton-bot
rm -rf /root/cleitonbot/auth_info_baileys
pm2 start cleiton-bot
pm2 logs cleiton-bot
```

Escaneie o novo QR com o número desejado.

## Segurança e boas práticas

- Trate `auth_info_baileys/` como **segredo** (não versionar; não publicar).
- Prefira número exclusivo para o bot.
- Mantenha dependências atualizadas, especialmente Baileys.
- Monitore `pm2 logs` após deploys e após quedas de conexão.
- Guarde a chave SSH privada (`~/.ssh/...`) com permissão `600`; sem ela o acesso ao VPS se perde.

## Licença

MIT — Copyright © 2026 ZamohtExe. Ver [LICENSE](../LICENSE).
