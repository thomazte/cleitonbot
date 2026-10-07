import { promises as fs } from 'node:fs'
import path from 'node:path'

const FREE_PER_DAY = 5
const PACK_SIZE = 30
const TIMEZONE = 'America/Sao_Paulo'

let queue = Promise.resolve()

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
}

/**
 * O webhook manda o celular brasileiro sem o 9 depois do DDD.
 * @param {string} value
 */
export function canonicalPhone(value) {
  const digits = String(value).replace(/\D/g, '')
  if (/^55\d{2}9\d{8}$/.test(digits)) return digits.slice(0, 4) + digits.slice(5)
  return digits
}

function emptyState() {
  return { welcomed: {}, days: {}, credits: {}, paywall: {}, exempt: {} }
}

/**
 * @param {string} file
 */
async function load(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'))
    return {
      welcomed: data.welcomed || {},
      days: data.days || {},
      credits: data.credits || {},
      paywall: data.paywall || {},
      exempt: data.exempt || {},
    }
  } catch {
    return emptyState()
  }
}

/**
 * @param {ReturnType<typeof emptyState>} data
 */
function prune(data) {
  const keep = new Set(Object.keys(data.days).sort().slice(-3))
  keep.add(today())
  for (const day of Object.keys(data.days)) {
    if (!keep.has(day)) delete data.days[day]
  }
}

/**
 * @param {string} file
 * @param {ReturnType<typeof emptyState>} data
 */
async function save(file, data) {
  prune(data)
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data))
  await fs.rename(tmp, file)
}

/**
 * @template T
 * @param {string} file
 * @param {(data: ReturnType<typeof emptyState>) => T} fn
 * @returns {Promise<T>}
 */
function mutate(file, fn) {
  const run = queue.then(async () => {
    const data = await load(file)
    const result = fn(data)
    await save(file, data)
    return result
  })
  queue = run.then(
    () => {},
    () => {},
  )
  return run
}

/**
 * @param {string} rootDir
 */
export function usageFile(rootDir) {
  return path.join(rootDir, 'data', 'usage.json')
}

/**
 * @param {string} file
 * @param {string} phone
 * @returns {Promise<boolean>} true só na primeira vez
 */
export function markWelcome(file, phone) {
  const id = canonicalPhone(phone)
  return mutate(file, (data) => {
    if (data.welcomed[id]) return false
    data.welcomed[id] = true
    return true
  })
}

/**
 * Reserva uma figurinha: as 5 do dia primeiro, depois o saldo pago.
 * @param {string} file
 * @param {string} phone
 */
export function reserveSticker(file, phone) {
  const id = canonicalPhone(phone)
  const day = today()
  return mutate(file, (data) => {
    if (data.exempt[id]) return { ok: true, source: 'exempt' }
    const used = data.days[day]?.[id] || 0
    if (used < FREE_PER_DAY) {
      if (!data.days[day]) data.days[day] = {}
      data.days[day][id] = used + 1
      return { ok: true, source: 'free' }
    }
    const credits = data.credits[id] || 0
    if (credits > 0) {
      data.credits[id] = credits - 1
      if (data.credits[id] === 0) delete data.credits[id]
      return { ok: true, source: 'paid' }
    }
    const notify = data.paywall[id] !== day
    data.paywall[id] = day
    return { ok: false, notify }
  })
}

/**
 * Devolve a reserva se a figurinha não chegou a ser enviada.
 * @param {string} file
 * @param {string} phone
 * @param {'free' | 'paid' | 'exempt'} source
 */
export function refundSticker(file, phone, source) {
  const id = canonicalPhone(phone)
  const day = today()
  return mutate(file, (data) => {
    if (source === 'exempt') return
    if (source === 'paid') {
      data.credits[id] = (data.credits[id] || 0) + 1
      return
    }
    const used = data.days[day]?.[id] || 0
    if (used > 0 && data.days[day]) data.days[day][id] = used - 1
  })
}

/**
 * @param {string} file
 * @param {string} phone
 * @param {boolean} exempt
 */
export function setExempt(file, phone, exempt) {
  const id = canonicalPhone(phone)
  return mutate(file, (data) => {
    if (!data.exempt) data.exempt = {}
    if (exempt) {
      data.exempt[id] = true
      delete data.paywall[id]
    } else {
      delete data.exempt[id]
    }
    return Boolean(data.exempt[id])
  })
}

/**
 * @param {string} file
 * @param {string} phone
 * @param {number} [amount]
 */

export function addPack(file, phone, amount = PACK_SIZE) {
  const id = canonicalPhone(phone)
  return mutate(file, (data) => {
    data.credits[id] = (data.credits[id] || 0) + amount
    delete data.paywall[id]
    return data.credits[id]
  })
}

export const QUOTA = { freePerDay: FREE_PER_DAY, packSize: PACK_SIZE }
