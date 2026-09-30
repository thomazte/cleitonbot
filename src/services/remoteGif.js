import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP } from 'node:net'

const MAX_MEDIA_BYTES = 15 * 1024 * 1024
const MAX_HTML_BYTES = 1024 * 1024
const MAX_REDIRECTS = 4
const TIMEOUT_MS = 20_000

const block = new BlockList()
block.addSubnet('0.0.0.0', 8, 'ipv4')
block.addSubnet('10.0.0.0', 8, 'ipv4')
block.addSubnet('100.64.0.0', 10, 'ipv4')
block.addSubnet('127.0.0.0', 8, 'ipv4')
block.addSubnet('169.254.0.0', 16, 'ipv4')
block.addSubnet('172.16.0.0', 12, 'ipv4')
block.addSubnet('192.0.0.0', 24, 'ipv4')
block.addSubnet('192.168.0.0', 16, 'ipv4')
block.addSubnet('198.18.0.0', 15, 'ipv4')
block.addSubnet('224.0.0.0', 4, 'ipv4')
block.addAddress('255.255.255.255', 'ipv4')
block.addAddress('::', 'ipv6')
block.addAddress('::1', 'ipv6')
block.addSubnet('fc00::', 7, 'ipv6')
block.addSubnet('fe80::', 10, 'ipv6')
block.addSubnet('ff00::', 8, 'ipv6')

const MEDIA_EXT = /\.(gif|mp4|webm|webp)$/i

/**
 * Separa um link de GIF do restante do comando (pacote | autor).
 * @param {string|undefined} raw
 * @returns {{ url: string|null, metaRaw: string }}
 */
export function splitCommandArg(raw) {
  if (!raw || !raw.trim()) return { url: null, metaRaw: '' }
  const trimmed = raw.trim()
  const match = trimmed.match(/^(https?:\/\/\S+)(?:\s+([\s\S]+))?$/i)
  if (!match) return { url: null, metaRaw: trimmed }
  return { url: cleanUrlToken(match[1]), metaRaw: (match[2] || '').trim() }
}

/**
 * Mensagem que é só um link de GIF, Tenor, Giphy ou post do X.
 * @param {string} text
 * @returns {string|null}
 */
export function bareGifLink(text) {
  const trimmed = String(text || '').trim()
  if (!/^https?:\/\//i.test(trimmed) || /\s/.test(trimmed)) return null
  const url = cleanUrlToken(trimmed)
  return looksLikeGifLink(url) ? url : null
}

/**
 * @param {string} url
 * @returns {Promise<{ buffer: Buffer, kind: 'video', ext: string }>}
 */
export async function downloadRemoteGif(url) {
  const directTweet = tweetRef(url)
  if (directTweet) return downloadTweetMedia(directTweet)

  const target = rewriteKnownPage(url) || url
  let fetched = await fetchChecked(target, 0)
  const landedTweet = tweetRef(fetched.finalUrl)
  if (landedTweet) return downloadTweetMedia(landedTweet)

  if (isHtml(fetched.type, fetched.buffer)) {
    const embedded = extractEmbeddedMedia(fetched.finalUrl, fetched.buffer.toString('utf8'))
    if (!embedded) {
      throw new Error(
        'Não achei um GIF nesse link. Use um arquivo .gif, um link do Tenor, do Giphy ou de um post do X.'
      )
    }
    fetched = await fetchChecked(embedded, 0)
    if (isHtml(fetched.type, fetched.buffer)) {
      throw new Error('Esse link abriu uma página, não o arquivo do GIF.')
    }
  }

  const media = classifyMedia(fetched.type, fetched.buffer, fetched.finalUrl)
  if (!media) {
    throw new Error(
      'Esse link não é um GIF ou vídeo. Envie o arquivo direto, do Tenor, do Giphy ou de um post do X.'
    )
  }
  if (fetched.buffer.length === 0) {
    throw new Error('O link baixou um arquivo vazio.')
  }
  return { buffer: fetched.buffer, kind: 'video', ext: media.ext }
}

/**
 * @param {string} token
 */
function cleanUrlToken(token) {
  return token.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[)\]}>.,]+$/g, '')
}

/**
 * @param {string} url
 */
function looksLikeGifLink(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const host = hostnameOf(parsed)
  if (host === 'tenor.com' || host.endsWith('.tenor.com')) return true
  if (host === 'giphy.com' || host.endsWith('.giphy.com')) return true
  if (tweetRef(url)) return true
  return MEDIA_EXT.test(parsed.pathname)
}

const TWEET_HOSTS = new Set([
  'x.com',
  'twitter.com',
  'mobile.x.com',
  'mobile.twitter.com',
  'fxtwitter.com',
  'vxtwitter.com',
  'fixupx.com',
  'fixvx.com',
])

/**
 * Post público do X (ou de um espelho tipo fxtwitter). A página não traz o arquivo;
 * o vídeo sai da API do FxTwitter.
 * @param {string} raw
 * @returns {{ id: string, mediaIndex: number }|null}
 */
function tweetRef(raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  const host = hostnameOf(parsed).replace(/^www\./, '')
  if (!TWEET_HOSTS.has(host)) return null
  const id = parsed.pathname.match(/\/status\/(\d+)/)
  if (!id) return null
  const video = parsed.pathname.match(/\/video\/(\d+)/)
  const mediaIndex = video ? Number(video[1]) : 0
  return { id: id[1], mediaIndex: Number.isFinite(mediaIndex) ? mediaIndex : 0 }
}

/**
 * @param {{ id: string, mediaIndex: number }} ref
 * @returns {Promise<{ buffer: Buffer, kind: 'video', ext: string }>}
 */
async function downloadTweetMedia(ref) {
  const api = `https://api.fxtwitter.com/2/status/${ref.id}`
  let fetched
  try {
    fetched = await fetchChecked(api, 0)
  } catch (err) {
    if (err instanceof Error && /HTTP 404/.test(err.message)) {
      throw new Error('Não achei esse post do X. Confira se ele é público.')
    }
    throw err
  }

  let payload
  try {
    payload = JSON.parse(fetched.buffer.toString('utf8'))
  } catch {
    throw new Error('Não consegui ler esse post do X.')
  }
  if (!payload || payload.code !== 200) {
    throw new Error('Não achei esse post do X. Confira se ele é público.')
  }

  const videos = listTweetVideos(payload.status?.media || payload.tweet?.media)
  if (!videos.length) {
    throw new Error('Esse post do X não tem vídeo nem GIF.')
  }
  const index = ref.mediaIndex >= 1 && ref.mediaIndex <= videos.length ? ref.mediaIndex - 1 : 0
  const candidates = mp4Candidates(videos[index] || videos[0])
  if (!candidates.length) {
    throw new Error('Não achei o arquivo de vídeo nesse post do X.')
  }

  let tooBig = false
  for (const mediaUrl of candidates) {
    try {
      const file = await fetchChecked(mediaUrl, 0)
      if (isHtml(file.type, file.buffer) || file.buffer.length === 0) continue
      const media = classifyMedia(file.type, file.buffer, file.finalUrl)
      if (!media) continue
      return { buffer: file.buffer, kind: 'video', ext: media.ext }
    } catch (err) {
      if (err instanceof Error && /grande demais/.test(err.message)) {
        tooBig = true
        continue
      }
      throw err
    }
  }
  if (tooBig) throw new Error('Esse vídeo do X é grande demais. Envie um trecho menor.')
  throw new Error('Não achei o arquivo de vídeo nesse post do X.')
}

/**
 * @param {object|undefined} media
 * @returns {object[]}
 */
function listTweetVideos(media) {
  if (!media || typeof media !== 'object') return []
  const lists = [media.videos, media.all].filter(Array.isArray)
  const seen = new Set()
  const videos = []
  for (const list of lists) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      if (item.type && item.type !== 'video' && item.type !== 'gif') continue
      const key = String(item.id || item.url || '')
      if (!key || seen.has(key)) continue
      seen.add(key)
      videos.push(item)
    }
  }
  return videos
}

/**
 * Variantes MP4 da maior para a menor. Pula as que, pelo bitrate, passam de 15 MB.
 * @param {object} video
 * @returns {string[]}
 */
function mp4Candidates(video) {
  const formats = Array.isArray(video?.formats) ? video.formats : []
  const ranked = formats
    .filter((item) => item && item.url && (item.container === 'mp4' || /\.mp4(\?|$)/i.test(item.url)))
    .map((item) => ({ url: String(item.url), bitrate: Number(item.bitrate) || 0 }))
  if (!ranked.length && video?.url && /\.mp4(\?|$)/i.test(String(video.url))) {
    ranked.push({ url: String(video.url), bitrate: 0 })
  }
  ranked.sort((a, b) => b.bitrate - a.bitrate)

  const duration = Number(video?.duration) || 0
  const fits = []
  const oversized = []
  const seen = new Set()
  for (const item of ranked) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    if (duration > 0 && item.bitrate > 0 && (item.bitrate / 8) * duration > MAX_MEDIA_BYTES) {
      oversized.push(item.url)
      continue
    }
    fits.push(item.url)
  }
  return fits.length ? fits : oversized.reverse()
}

/**
 * Página do Giphy vira o arquivo direto. Tenor segue como página e o GIF sai das meta tags.
 * @param {string} raw
 * @returns {string|null}
 */
function rewriteKnownPage(raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (hostnameOf(parsed) !== 'giphy.com') return null
  if (MEDIA_EXT.test(parsed.pathname)) return null
  const id = giphyId(parsed)
  if (!id) return null
  return `https://media.giphy.com/media/${id}/giphy.gif`
}

/**
 * @param {URL} parsed
 */
function giphyId(parsed) {
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'gifs' && parts[0] !== 'embed') return null
  const last = parts[parts.length - 1] || ''
  const id = last.split('-').pop() || ''
  return /^[A-Za-z0-9]{5,}$/.test(id) ? id : null
}

/**
 * @param {string} url
 * @param {number} redirects
 * @returns {Promise<{ buffer: Buffer, type: string, finalUrl: string }>}
 */
async function fetchChecked(url, redirects) {
  if (redirects > MAX_REDIRECTS) {
    throw new Error('Esse link redireciona demais.')
  }
  const parsed = validateUrl(url)
  const pinned = await assertPublicHost(hostnameOf(parsed))
  const response = await requestPinned(parsed, pinned)

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.location
    response.stream.resume()
    if (!location) throw new Error('Não consegui seguir o redirecionamento desse link.')
    return fetchChecked(new URL(location, parsed).href, redirects + 1)
  }

  if (response.status < 200 || response.status >= 300) {
    response.stream.resume()
    throw new Error(`Não consegui baixar esse link (HTTP ${response.status}).`)
  }

  const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  const html = type.startsWith('text/html') || type === 'application/xhtml+xml'
  const advertised = Number(response.headers['content-length'] || 0)
  const max = html ? MAX_HTML_BYTES : MAX_MEDIA_BYTES
  if (!html && advertised > MAX_MEDIA_BYTES) {
    response.stream.resume()
    throw new Error('Esse arquivo é grande demais. Envie um GIF menor.')
  }

  const buffer = await readLimited(response.stream, max)
  return { buffer, type, finalUrl: parsed.href }
}

/**
 * @param {string} url
 */
function validateUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Esse link não é válido.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Esse link não é válido.')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Esse link não é válido.')
  }
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  if (port !== '80' && port !== '443') {
    throw new Error('Esse link não é válido.')
  }
  const host = hostnameOf(parsed)
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('Esse link não é válido.')
  }
  if (host === 'metadata.google.internal' || host === 'metadata.internal') {
    throw new Error('Esse link não é válido.')
  }
  return parsed
}

/**
 * @param {URL} parsed
 */
function hostnameOf(parsed) {
  return parsed.hostname.replace(/\.$/, '').toLowerCase()
}

/**
 * @param {string} hostname
 * @returns {Promise<{ address: string, family: number }>}
 */
async function assertPublicHost(hostname) {
  if (isIP(hostname)) {
    if (ipBlocked(hostname)) throw new Error('Esse link não é válido.')
    return { address: hostname, family: isIP(hostname) }
  }

  let records
  try {
    records = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new Error('Não consegui baixar esse link. Confira se ele abre no navegador.')
  }
  if (!records?.length) {
    throw new Error('Não consegui baixar esse link. Confira se ele abre no navegador.')
  }
  for (const record of records) {
    if (ipBlocked(record.address)) throw new Error('Esse link não é válido.')
  }
  return { address: records[0].address, family: records[0].family }
}

/**
 * @param {string} address
 */
function ipBlocked(address) {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return block.check(mapped[1], 'ipv4')
  const kind = isIP(address)
  if (kind === 4) return block.check(address, 'ipv4')
  if (kind === 6) return block.check(address, 'ipv6')
  return true
}

/**
 * @param {URL} parsed
 * @param {{ address: string, family: number }} pinned
 */
function requestPinned(parsed, pinned) {
  const lib = parsed.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = lib.request(
      parsed,
      {
        method: 'GET',
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'CleitonBot/1.0',
          Accept: 'image/gif,video/mp4,video/webm,image/webp,text/html;q=0.5,*/*;q=0.1',
        },
        lookup: (_hostname, options, callback) => {
          if (options?.all) callback(null, [{ address: pinned.address, family: pinned.family }])
          else callback(null, pinned.address, pinned.family)
        },
      },
      (stream) => {
        resolve({
          status: stream.statusCode || 0,
          headers: stream.headers,
          stream,
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('O download do link demorou demais.')))
    req.on('error', (err) => {
      if (err?.message === 'O download do link demorou demais.') reject(err)
      else reject(new Error('Não consegui baixar esse link. Confira se ele abre no navegador.'))
    })
    req.end()
  })
}

/**
 * @param {import('node:stream').Readable} stream
 * @param {number} max
 * @returns {Promise<Buffer>}
 */
function readLimited(stream, max) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let settled = false
    const fail = (err) => {
      if (settled) return
      settled = true
      stream.destroy()
      reject(err)
    }
    stream.on('data', (chunk) => {
      total += chunk.length
      if (total > max) {
        fail(new Error('Esse arquivo é grande demais. Envie um GIF menor.'))
        return
      }
      chunks.push(chunk)
    })
    stream.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })
    stream.on('error', (err) => fail(err instanceof Error ? err : new Error('Falha ao baixar o link.')))
  })
}

/**
 * @param {string} type
 * @param {Buffer} buffer
 */
function isHtml(type, buffer) {
  if (type.startsWith('text/html') || type === 'application/xhtml+xml') return true
  const head = buffer.subarray(0, 32).toString('utf8').trimStart().toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}

/**
 * @param {string} pageUrl
 * @param {string} html
 * @returns {string|null}
 */
function extractEmbeddedMedia(pageUrl, html) {
  const metas = metaMap(html)
  const keys = ['og:video:secure_url', 'og:video', 'twitter:player:stream', 'og:image', 'twitter:image']
  for (const key of keys) {
    const value = metas.get(key)
    if (!value) continue
    let absolute
    try {
      absolute = new URL(value, pageUrl).href
    } catch {
      continue
    }
    if (looksLikeGifLink(absolute) || MEDIA_EXT.test(new URL(absolute).pathname)) return absolute
  }
  return null
}

/**
 * @param {string} html
 */
function metaMap(html) {
  const map = new Map()
  const tags = html.match(/<meta\b[^>]*>/gi) || []
  for (const tag of tags) {
    const key = (attr(tag, 'property') || attr(tag, 'name')).toLowerCase()
    const content = decodeHtml(attr(tag, 'content'))
    if (key && content && !map.has(key)) map.set(key, content)
  }
  return map
}

/**
 * @param {string} tag
 * @param {string} name
 */
function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match ? match[1] ?? match[2] ?? '' : ''
}

/**
 * @param {string} value
 */
function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/**
 * @param {string} type
 * @param {Buffer} buffer
 * @param {string} finalUrl
 * @returns {{ ext: string }|null}
 */
function classifyMedia(type, buffer, finalUrl) {
  if (type === 'image/gif' || isGif(buffer)) return { ext: '.gif' }
  if (type === 'video/mp4' || type === 'video/quicktime' || isMp4(buffer)) return { ext: '.mp4' }
  if (type === 'video/webm' || isWebm(buffer)) return { ext: '.webm' }
  if (type === 'image/webp' || isWebp(buffer)) return { ext: '.webp' }

  let pathname = ''
  try {
    pathname = new URL(finalUrl).pathname
  } catch {
    pathname = ''
  }
  if (pathname.endsWith('.gif')) return { ext: '.gif' }
  if (pathname.endsWith('.mp4')) return { ext: '.mp4' }
  if (pathname.endsWith('.webm')) return { ext: '.webm' }
  if (pathname.endsWith('.webp')) return { ext: '.webp' }
  return null
}

/** @param {Buffer} buffer */
function isGif(buffer) {
  const head = buffer.subarray(0, 6).toString('ascii')
  return head === 'GIF87a' || head === 'GIF89a'
}

/** @param {Buffer} buffer */
function isMp4(buffer) {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp'
}

/** @param {Buffer} buffer */
function isWebm(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
}

/** @param {Buffer} buffer */
function isWebp(buffer) {
  return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
}
