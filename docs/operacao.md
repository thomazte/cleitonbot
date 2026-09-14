# Operação e deploy

## Pré-requisitos

- Node.js **18+**
- FFmpeg e ffprobe instalados
- Conta WhatsApp dedicada ao bot (recomendado: não usar número pessoal)
- VPS ou máquina sempre ligada para operação 24h (opcional, via PM2)

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
| `FFMPEG_PATH` | Caminho absoluto do ffmpeg (Windows) | — |
| `FFPROBE_PATH` | Caminho absoluto do ffprobe (Windows) | — |

No Linux/VPS, deixe `FFMPEG_PATH` / `FFPROBE_PATH` comentados se os binários estiverem no `PATH`.

## Execução local

```bash
npm start          # produção / processo único
npm run dev        # reinicia ao salvar (node --watch)
```

No primeiro start (ou após logout), o terminal exibe um **QR Code**. No celular:

**WhatsApp → Aparelhos conectados → Conectar um aparelho**

Não use a câmera do sistema fora dessa tela.

## Produção com PM2

```bash
cd ~/cleitonbot
npm install
pm2 start src/index.js --name cleiton-bot
pm2 save
pm2 startup    # seguir o comando sugerido pelo PM2
```

Comandos úteis:

```bash
pm2 status
pm2 logs cleiton-bot
pm2 restart cleiton-bot
```

Atualizar código no servidor após mudanças locais (exemplo com `scp`):

```powershell
scp -i $env:USERPROFILE\.ssh\CHAVE -r .\src .\package.json .\package-lock.json ubuntu@IP:~/cleitonbot/
```

No VPS:

```bash
cd ~/cleitonbot
npm install
pm2 restart cleiton-bot
```

**Não copie** `auth_info_baileys` entre máquinas a menos que saiba o que está fazendo — o pareamento limpo no servidor é mais seguro.

## Validar o esticamento quadrado

Um comando roda a mesma checagem nesta máquina e no VPS ao mesmo tempo: gera uma mídia fora de proporção, converte em figurinha e confirma que o resultado é 512×512 esticado (sem barras transparentes e sem cortar os cantos).

```powershell
npm run validate:square
```

O script envia `src/services/stickerService.js` e o teste para o VPS. Não reinicia o PM2. Depois que os dois passarem, no servidor:

```bash
pm2 restart cleiton-bot
```

Host, usuário, chave e pasta podem ser trocados com `CLEITON_SSH_HOST`, `CLEITON_SSH_USER`, `CLEITON_SSH_KEY` e `CLEITON_REMOTE_DIR`.

## Trocar o número do bot

```bash
pm2 stop cleiton-bot
rm -rf ~/cleitonbot/auth_info_baileys
pm2 start cleiton-bot
pm2 logs cleiton-bot
```

Escaneie o novo QR com o número desejado.

## Segurança e boas práticas

- Trate `auth_info_baileys/` como **segredo** (não versionar; não publicar).
- Prefira número exclusivo para o bot.
- Mantenha dependências atualizadas, especialmente Baileys.
- Monitore `pm2 logs` após deploys e após quedas de conexão.

## Licença

MIT — Copyright © 2026 ZamohtExe. Ver [LICENSE](../LICENSE).
