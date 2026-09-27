import 'dotenv/config'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cloudOptionsFromEnv, handleWebhookPayload } from './cloud/handleMessage.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const PORT = Number(process.env.WEBHOOK_PORT || 3000)
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN

if (!VERIFY_TOKEN) {
  console.error('Defina WEBHOOK_VERIFY_TOKEN no .env')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }

  if (req.method === 'GET' && url.pathname === '/webhook') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(challenge)
      return
    }
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('forbidden')
    return
  }

  if (req.method === 'POST' && url.pathname === '/webhook') {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      const raw = Buffer.concat(chunks).toString('utf8')
      console.log(`[webhook] ${summarize(raw)}`)
      const options = cloudOptionsFromEnv(ROOT)
      if (!options) {
        console.error('[cloud] WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID ausente')
        return
      }
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return
      }
      handleWebhookPayload(body, options).catch((err) => {
        console.error('[cloud] falhou:', err instanceof Error ? err.message : err)
      })
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Webhook ouvindo em 127.0.0.1:${PORT}`)
})

/**
 * @param {string} raw
 */
function summarize(raw) {
  try {
    const body = JSON.parse(raw)
    const value = body.entry?.[0]?.changes?.[0]?.value
    const status = value?.statuses?.[0]
    if (status) {
      const reason = status.errors?.[0]?.title || status.errors?.[0]?.message || ''
      return `status=${status.status} para=${status.recipient_id} ${reason}`.trim()
    }
    const message = value?.messages?.[0]
    if (!message) return 'evento sem mensagem'
    return `de=${message.from} tipo=${message.type}`
  } catch {
    return 'corpo inválido'
  }
}
