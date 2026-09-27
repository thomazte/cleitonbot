const GRAPH = 'https://graph.facebook.com/v23.0'

/**
 * O webhook manda celular brasileiro sem o 9. A lista de teste da Meta exige o 9.
 * @param {string} to
 */
function whatsappTo(to) {
  const digits = String(to).replace(/\D/g, '')
  if (/^55\d{2}\d{8}$/.test(digits)) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`
  }
  return digits
}

function authHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra }
}

/**
 * @param {string} token
 * @param {string} phoneNumberId
 * @param {string} to
 * @param {string} body
 */
export async function sendText(token, phoneNumberId, to, body) {
  const response = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: whatsappTo(to),
      type: 'text',
      text: { body },
    }),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
}

/**
 * @param {string} token
 * @param {string} mediaId
 * @returns {Promise<Buffer>}
 */
export async function downloadMedia(token, mediaId) {
  const metaResponse = await fetch(`${GRAPH}/${mediaId}`, {
    headers: authHeaders(token),
  })
  if (!metaResponse.ok) {
    throw new Error(await metaResponse.text())
  }
  const meta = await metaResponse.json()
  const fileResponse = await fetch(meta.url, { headers: authHeaders(token) })
  if (!fileResponse.ok) {
    throw new Error(await fileResponse.text())
  }
  return Buffer.from(await fileResponse.arrayBuffer())
}

/**
 * @param {string} token
 * @param {string} phoneNumberId
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
export async function uploadSticker(token, phoneNumberId, buffer) {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', 'image/webp')
  form.append('file', new Blob([buffer], { type: 'image/webp' }), 'sticker.webp')

  const response = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  const payload = await response.json()
  return payload.id
}

/**
 * @param {string} token
 * @param {string} phoneNumberId
 * @param {string} to
 * @param {string} mediaId
 */
export async function sendSticker(token, phoneNumberId, to, mediaId) {
  const response = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: whatsappTo(to),
      type: 'sticker',
      sticker: { id: mediaId },
    }),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
}
