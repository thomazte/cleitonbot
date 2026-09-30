import path from 'node:path'
import sharp from 'sharp'
import { StickerService } from '../services/stickerService.js'
import { ensureDir } from '../utils/fileCleaner.js'
import { downloadMedia, sendSticker, sendText, uploadSticker } from './client.js'
import { bareGifLink, downloadRemoteGif, splitCommandArg } from '../services/remoteGif.js'

const STRETCH_RE = /^(?:!s(?:ticker)?|!fig|s)(?:\s+([\s\S]+))?$/i
const CONTAIN_RE = /^(?:!so(?:riginal)?|!prop)(?:\s+([\s\S]+))?$/i
const HELP_RE = /^!(?:menu|ajuda)$/i
const STATIC_STICKER_LIMIT = 100 * 1024

const HELP_TEXT =
  '*Como criar figurinhas*\n' +
  '1. Envie uma imagem, GIF ou vídeo com a legenda do comando\n' +
  '2. Ou mande o link: !s https://link-do-gif (Tenor, Giphy, post do X ou arquivo)\n' +
  '3. !s — estica até ficar quadrada\n' +
  '4. !so — mantém a proporção original\n' +
  '5. Opcional: !s Nome do Pacote | Autor\n' +
  '6. Vídeos longos: a figurinha usa os primeiros 10s'

const WELCOME_TEXT =
  'Olá! Eu sou o *Cleiton*, bot de figurinhas.\n' +
  'Digite !ajuda para ver como me usar.'

const processedIds = new Set()

/**
 * @param {object} body
 * @param {{ token: string, phoneNumberId: string, tempDir: string, pack: string, author: string }} options
 */
export async function handleWebhookPayload(body, options) {
  const value = body.entry?.[0]?.changes?.[0]?.value
  const message = value?.messages?.[0]
  if (!message) return

  if (processedIds.has(message.id)) return
  processedIds.add(message.id)
  if (processedIds.size > 2000) {
    processedIds.delete(processedIds.values().next().value)
  }

  const from = message.from
  const text = extractText(message).trim()
  console.log(`[cloud] "${text.slice(0, 80)}" de=${from} tipo=${message.type}`)

  if (HELP_RE.test(text)) {
    await sendText(options.token, options.phoneNumberId, from, HELP_TEXT)
    return
  }

  const containMatch = text.match(CONTAIN_RE)
  const stretchMatch = containMatch ? null : text.match(STRETCH_RE)
  const match = containMatch || stretchMatch
  const bare = match ? null : bareGifLink(text)
  if (!match && !bare) {
    await sendText(options.token, options.phoneNumberId, from, WELCOME_TEXT)
    return
  }

  const arg = splitCommandArg(bare || match[1])
  const media = mediaOf(message)
  if (!media && !arg.url) {
    await sendText(
      options.token,
      options.phoneNumberId,
      from,
      'Envie uma imagem, GIF ou vídeo com a legenda !s ou !so.\n' +
        'Também vale o link: !s https://link-do-gif\n' +
        '!s = esticada · !so = proporção original'
    )
    return
  }

  try {
    await ensureDir(options.tempDir)
    const stickerService = new StickerService(options.tempDir)
    const meta = parseMeta(arg.metaRaw, { pack: options.pack, author: options.author })
    const fit = containMatch ? 'contain' : 'fill'
    let kind = media?.kind
    let input
    let ext = media?.ext
    if (media) {
      input = await downloadMedia(options.token, media.id)
    } else {
      console.log(`[cloud] baixando link ${arg.url}`)
      const remote = await downloadRemoteGif(arg.url)
      input = remote.buffer
      kind = remote.kind
      ext = remote.ext
    }
    let sticker =
      kind === 'image'
        ? await stickerService.fromImage(input, meta, { fit })
        : await stickerService.fromVideo(input, ext, meta, { fit })

    if (kind === 'image' && sticker.length > STATIC_STICKER_LIMIT) {
      sticker = await shrinkStatic(sticker)
    }

    const mediaId = await uploadSticker(options.token, options.phoneNumberId, sticker)
    await sendSticker(options.token, options.phoneNumberId, from, mediaId)
    console.log('[cloud] figurinha enviada')
  } catch (err) {
    const friendly = err instanceof Error ? err.message : 'Não foi possível criar a figurinha.'
    console.error('[cloud] figurinha falhou:', friendly)
    await sendText(options.token, options.phoneNumberId, from, `Não consegui criar a figurinha. ${friendly}`)
  }
}

/**
 * @param {object} message
 */
function extractText(message) {
  if (message.type === 'text') return message.text?.body || ''
  if (message.type === 'image') return message.image?.caption || ''
  if (message.type === 'video') return message.video?.caption || ''
  if (message.type === 'document') return message.document?.caption || ''
  return ''
}

/**
 * @param {object} message
 */
function mediaOf(message) {
  if (message.image?.id) return { id: message.image.id, kind: 'image', ext: '.jpg' }
  if (message.video?.id) {
    const mime = message.video.mime_type || ''
    return { id: message.video.id, kind: 'video', ext: mime === 'image/gif' ? '.gif' : '.mp4' }
  }
  if (message.document?.id) {
    const mime = message.document.mime_type || ''
    if (mime.startsWith('image/')) {
      const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg'
      return { id: message.document.id, kind: 'image', ext }
    }
    if (mime.startsWith('video/') || mime === 'image/gif') {
      return { id: message.document.id, kind: 'video', ext: mime === 'image/gif' ? '.gif' : '.mp4' }
    }
  }
  return null
}

/**
 * @param {string|undefined} raw
 * @param {{ pack: string, author: string }} defaults
 */
function parseMeta(raw, defaults) {
  if (!raw || !raw.trim()) return { ...defaults }
  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return { ...defaults }
  if (parts.length === 1) return { pack: parts[0], author: defaults.author }
  return { pack: parts[0], author: parts.slice(1).join(' | ') }
}

/**
 * @param {Buffer} buffer
 */
async function shrinkStatic(buffer) {
  let quality = 60
  let current = buffer
  for (let attempt = 0; attempt < 5 && current.length > STATIC_STICKER_LIMIT; attempt++) {
    current = await sharp(buffer).webp({ quality, alphaQuality: 80, effort: 6 }).toBuffer()
    quality = Math.max(20, quality - 10)
  }
  return current
}

export function cloudOptionsFromEnv(rootDir) {
  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) return null
  return {
    token,
    phoneNumberId,
    tempDir: path.resolve(rootDir, process.env.TEMP_DIR || 'temp'),
    pack: process.env.STICKER_PACK || 'Cleiton Bot',
    author: process.env.STICKER_AUTHOR || 'Cleiton',
  }
}
