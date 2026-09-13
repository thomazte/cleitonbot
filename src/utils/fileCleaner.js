import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Garante que o diretório exista.
 * @param {string} dir
 */
export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Remove um arquivo se existir. Ignora erros silenciosamente.
 * @param {string} filePath
 */
export async function safeUnlink(filePath) {
  if (!filePath) return
  try {
    await fs.unlink(filePath)
  } catch {
    // arquivo já removido ou inexistente
  }
}

/**
 * Remove uma lista de arquivos temporários.
 * @param {...(string|null|undefined)} paths
 */
export async function cleanFiles(...paths) {
  await Promise.all(paths.filter(Boolean).map((p) => safeUnlink(p)))
}

/**
 * Limpa todos os arquivos dentro de um diretório (não remove o diretório).
 * @param {string} dir
 */
export async function cleanDir(dir) {
  try {
    const entries = await fs.readdir(dir)
    await Promise.all(entries.map((name) => safeUnlink(path.join(dir, name))))
  } catch {
    // diretório inexistente
  }
}

/**
 * Gera um caminho único dentro da pasta temp.
 * @param {string} tempDir
 * @param {string} ext  extensão com ponto, ex: ".jpg"
 * @returns {string}
 */
export function tempPath(tempDir, ext = '') {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return path.join(tempDir, `${id}${ext}`)
}
