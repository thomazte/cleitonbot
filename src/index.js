import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { createMessageHandler } from './handlers/messageHandler.js'
import { ensureDir, cleanDir } from './utils/fileCleaner.js'
import { configureFfmpeg } from './utils/ffmpegPaths.js'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const AUTH_DIR = path.resolve(ROOT, process.env.AUTH_DIR || 'auth_info_baileys')
const TEMP_DIR = path.resolve(ROOT, process.env.TEMP_DIR || 'temp')
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
const STICKER_PACK = process.env.STICKER_PACK || 'Cleiton Bot'
const STICKER_AUTHOR = process.env.STICKER_AUTHOR || 'Cleiton'

const logger = pino({ level: LOG_LEVEL })
const baileysLogger = pino({ level: 'silent' })

/** @type {import('@whiskeysockets/baileys').WASocket | null} */
let sock = null
let isRestarting = false

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException — processo continua ativo')
})

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection')
})

async function assertFfmpegAvailable() {
  const { ffmpegPath, ffprobePath } = configureFfmpeg()
  try {
    await execFileAsync(ffmpegPath, ['-version'])
    await execFileAsync(ffprobePath, ['-version'])
    console.log(`FFmpeg OK: ${ffmpegPath}`)
  } catch {
    console.error(
      '\n[ERRO] FFmpeg/ffprobe não encontrados.\n' +
        'Defina FFMPEG_PATH e FFPROBE_PATH no .env ou instale o FFmpeg.\n' +
        'Figurinhas animadas (GIF/vídeo) não funcionarão sem ele.\n'
    )
  }
}

function printQrHelp() {
  console.log(`
============================================================
  COMO CONECTAR (importante)
============================================================
  1. Abra o WhatsApp no CELULAR
  2. Toque nos 3 pontinhos (Android) ou Ajustes (iPhone)
  3. Aparelhos conectados → Conectar um aparelho
  4. Escaneie o QR que aparece ABAIXO neste terminal

  NÃO use a câmera normal do celular.
  O QR só funciona pela tela "Aparelhos conectados".
============================================================
`)
}

async function startBot() {
  if (isRestarting) return
  isRestarting = true

  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners('connection.update')
        sock.ev.removeAllListeners('creds.update')
        sock.ev.removeAllListeners('messages.upsert')
        sock.end?.(undefined)
      } catch {
        // ignore
      }
      sock = null
    }

    await assertFfmpegAvailable()
    await ensureDir(AUTH_DIR)
    await ensureDir(TEMP_DIR)
    await cleanDir(TEMP_DIR)

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    const { version, isLatest } = await fetchLatestBaileysVersion()
    logger.info({ version, isLatest }, 'Versão do WhatsApp Web')

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      logger: baileysLogger,
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      getMessage: async () => undefined,
    })

    const { handleMessagesUpsert } = createMessageHandler(sock, {
      pack: STICKER_PACK,
      author: STICKER_AUTHOR,
      tempDir: TEMP_DIR,
      logger,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        printQrHelp()
        qrcode.generate(qr, { small: true })
        console.log('Aguardando leitura do QR...\n')
      }

      if (connection === 'connecting') {
        console.log('Conectando ao WhatsApp...')
      }

      if (connection === 'open') {
        logger.info('Conectado ao WhatsApp')
        console.log(
          '\nCleiton Bot online. Comandos: !s (esticada) | !so (proporção) | !fig | !sticker | !menu\n'
        )
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        logger.warn({ statusCode, shouldReconnect }, 'Conexão encerrada')

        if (shouldReconnect) {
          console.log('Reconectando em 3s...')
          setTimeout(() => {
            startBot().catch((err) => logger.error({ err }, 'Falha ao reconectar'))
          }, 3000)
        } else {
          console.log(
            'Sessão encerrada (logged out). Apague a pasta auth_info_baileys e rode npm start de novo.'
          )
        }
      }
    })

    sock.ev.on('messages.upsert', handleMessagesUpsert)
  } finally {
    isRestarting = false
  }
}

startBot().catch((err) => {
  logger.fatal({ err }, 'Falha ao iniciar o bot')
  process.exit(1)
})
