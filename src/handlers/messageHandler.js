import { downloadMediaMessage } from '@whiskeysockets/baileys'
import pino from 'pino'
import { StickerService } from '../services/stickerService.js'

const TRIGGER_RE = /^(?:!s(?:ticker)?|!fig|s)(?:\s+([\s\S]+))?$/i
const HELP_RE = /^!(?:menu|ajuda)$/i

const HELP_TEXT =
  '*Como criar figurinhas*\n' +
  '1. Envie uma imagem/GIF/vídeo com legenda `!s` (ou responda a uma mídia com `!s`)\n' +
  '2. Opcional: `!s Nome do Pacote | Autor`\n' +
  '3. Vídeos: até 30s (a figurinha usa ~4,5s)'

const WELCOME_TEXT =
  'Olá! Eu sou o *Cleiton*, bot de figurinhas.\n' +
  'Digite `!ajuda` para ver como me usar.'

/**
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {{ pack: string, author: string, tempDir: string, logger?: import('pino').Logger }} options
 */
export function createMessageHandler(sock, options) {
  const logger = options.logger || pino({ level: 'silent' })
  const stickerService = new StickerService(options.tempDir)
  const defaultMeta = {
    pack: options.pack || 'Cleiton Bot',
    author: options.author || 'Cleiton',
  }

  /** Evita processar a mesma mensagem duas vezes (notify + append). */
  const processedIds = new Set()

  /** Evita spam da mensagem de boas-vindas no mesmo chat (cooldown 30 min). */
  const welcomeSentAt = new Map()
  const WELCOME_COOLDOWN_MS = 30 * 60 * 1000

  /**
   * @param {import('@whiskeysockets/baileys').BaileysEventMap['messages.upsert']} upsert
   */
  async function handleMessagesUpsert({ messages, type }) {
    // Mensagens suas (do celular) costumam chegar como "append", não só "notify"
    if (type !== 'notify' && type !== 'append') return

    for (const msg of messages) {
      try {
        await processMessage(msg)
      } catch (err) {
        logger.error({ err }, 'Erro ao processar mensagem')
        console.error('Erro ao processar mensagem:', err?.message || err)
      }
    }
  }

  /**
   * @param {import('@whiskeysockets/baileys').WAMessage} msg
   */
  async function processMessage(msg) {
    if (!msg?.message || msg.key?.remoteJid === 'status@broadcast') return
    if (msg.message.protocolMessage || msg.message.reactionMessage) return

    const msgId = msg.key?.id
    if (msgId) {
      if (processedIds.has(msgId)) return
      processedIds.add(msgId)
      if (processedIds.size > 2000) {
        const oldest = processedIds.values().next().value
        processedIds.delete(oldest)
      }
    }

    const content = unwrapMessage(msg.message)
    if (!content) return

    const text = extractText(content)
    if (!text) return

    const trimmed = text.trim()
    const jid = msg.key.remoteJid

    console.log(
      `[msg] "${trimmed.slice(0, 80)}" | de=${jid} | fromMe=${Boolean(msg.key.fromMe)} | type=text`
    )

    if (HELP_RE.test(trimmed)) {
      console.log(`[ajuda] de ${jid}`)
      await sock.sendMessage(jid, { text: HELP_TEXT }, { quoted: msg })
      return
    }

    const match = trimmed.match(TRIGGER_RE)
    if (!match) {
      // Não responde às próprias mensagens do número do bot
      if (msg.key.fromMe) return

      const last = welcomeSentAt.get(jid) || 0
      if (Date.now() - last >= WELCOME_COOLDOWN_MS) {
        welcomeSentAt.set(jid, Date.now())
        console.log(`[boas-vindas] enviando para ${jid}`)
        try {
          await sock.sendMessage(jid, { text: WELCOME_TEXT })
          console.log(`[boas-vindas] ok → ${jid}`)
        } catch (err) {
          console.error('[boas-vindas] falhou:', err?.message || err)
          welcomeSentAt.delete(jid)
        }
      } else {
        console.log(`[boas-vindas] cooldown ativo para ${jid}`)
      }
      return
    }

    const meta = parseMeta(match[1], defaultMeta)
    const mediaInfo = resolveMedia(msg, content)

    console.log(
      `[comando] ${trimmed.split(/\s+/)[0]} | tipo=${mediaInfo?.kind || 'sem-mídia'} | de=${jid} | fromMe=${Boolean(msg.key.fromMe)}`
    )

    if (!mediaInfo) {
      await sock.sendMessage(
        jid,
        {
          text:
            'Envie uma *imagem*, *GIF* ou *vídeo* com a legenda `!s`, ou *responda* a uma mídia com `!s`.',
        },
        { quoted: msg }
      )
      return
    }

    try {
      await sock.sendPresenceUpdate('composing', jid)
      console.log('[sticker] baixando mídia...')

      const buffer = await downloadMediaMessage(
        mediaInfo.message,
        'buffer',
        {},
        {
          logger,
          reuploadRequest: sock.updateMediaMessage,
        }
      )

      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Não consegui baixar a mídia. Tente reenviar.')
      }

      console.log(`[sticker] convertendo (${mediaInfo.kind}, ${buffer.length} bytes)...`)

      let stickerBuffer
      if (mediaInfo.kind === 'image') {
        stickerBuffer = await stickerService.fromImage(buffer, meta)
      } else {
        stickerBuffer = await stickerService.fromVideo(buffer, mediaInfo.ext, meta)
      }

      await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg })
      console.log('[sticker] enviada com sucesso')
    } catch (err) {
      const friendly =
        err instanceof Error
          ? err.message
          : 'Não foi possível criar a figurinha. A mídia pode estar corrompida.'

      logger.warn({ err }, 'Falha na criação da figurinha')
      console.error('[sticker] falhou:', friendly)
      await sock.sendMessage(jid, { text: `⚠️ ${friendly}` }, { quoted: msg })
    } finally {
      try {
        await sock.sendPresenceUpdate('paused', jid)
      } catch {
        // ignore
      }
    }
  }

  return { handleMessagesUpsert }
}

/**
 * Desembrulha mensagens efêmeras / view-once / documento com legenda.
 * @param {import('@whiskeysockets/baileys').proto.IMessage} message
 */
function unwrapMessage(message) {
  if (!message) return null
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  )
}

/**
 * @param {import('@whiskeysockets/baileys').proto.IMessage} content
 */
function extractText(content) {
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    ''
  )
}

/**
 * @param {string|undefined} raw
 * @param {{ pack: string, author: string }} defaults
 */
function parseMeta(raw, defaults) {
  if (!raw || !raw.trim()) return { ...defaults }

  const parts = raw.split('|').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { ...defaults }
  if (parts.length === 1) {
    return { pack: parts[0], author: defaults.author }
  }
  return { pack: parts[0], author: parts.slice(1).join(' | ') }
}

/**
 * @param {import('@whiskeysockets/baileys').WAMessage} msg
 * @param {import('@whiskeysockets/baileys').proto.IMessage} content
 */
function resolveMedia(msg, content) {
  const direct = classifyContent(content)
  if (direct) {
    return {
      ...direct,
      message: { key: msg.key, message: content },
    }
  }

  const contextInfo =
    content.extendedTextMessage?.contextInfo ||
    content.imageMessage?.contextInfo ||
    content.videoMessage?.contextInfo ||
    content.documentMessage?.contextInfo

  const quoted = contextInfo?.quotedMessage
  if (!quoted) return null

  const quotedUnwrapped = unwrapMessage(quoted) || quoted
  const quotedInfo = classifyContent(quotedUnwrapped)
  if (!quotedInfo) return null

  const quotedMsg = {
    key: {
      remoteJid: msg.key.remoteJid,
      id: contextInfo.stanzaId || msg.key.id,
      fromMe: Boolean(contextInfo.participant ? false : msg.key.fromMe),
      participant: contextInfo.participant,
    },
    message: quotedUnwrapped,
  }

  return { ...quotedInfo, message: quotedMsg }
}

/**
 * @param {import('@whiskeysockets/baileys').proto.IMessage | null | undefined} content
 */
function classifyContent(content) {
  if (!content) return null

  if (content.imageMessage) {
    return { kind: 'image', ext: '.jpg' }
  }

  if (content.stickerMessage && !content.stickerMessage.isAnimated) {
    return { kind: 'image', ext: '.webp' }
  }

  if (content.videoMessage) {
    return { kind: 'video', ext: '.mp4' }
  }

  if (content.stickerMessage?.isAnimated) {
    return { kind: 'video', ext: '.webp' }
  }

  if (content.documentMessage) {
    const mime = content.documentMessage.mimetype || ''
    if (mime.startsWith('image/')) {
      const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg'
      return { kind: 'image', ext }
    }
    if (mime.startsWith('video/') || mime === 'image/gif') {
      return { kind: 'video', ext: mime === 'image/gif' ? '.gif' : '.mp4' }
    }
  }

  return null
}
