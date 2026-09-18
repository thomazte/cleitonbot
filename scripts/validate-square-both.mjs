import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const host = process.env.CLEITON_SSH_HOST || '46.62.239.197'
const user = process.env.CLEITON_SSH_USER || 'root'
const key = process.env.CLEITON_SSH_KEY || path.join(os.homedir(), '.ssh', 'oracle_vps')
const remoteDir = process.env.CLEITON_REMOTE_DIR || '/root/cleitonbot'

const sshBase = [
  '-i', key,
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15',
  '-o', 'StrictHostKeyChecking=accept-new',
]

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 */
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (err) => {
      resolve({ code: 1, stdout, stderr: `${stderr}${err.message}` })
    })
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

/**
 * @param {string} title
 * @param {{ code: number, stdout: string, stderr: string }} result
 */
function printResult(title, result) {
  console.log(`\n=== ${title} ===`)
  const text = `${result.stdout}${result.stderr}`.trim()
  console.log(text || '(sem saída)')
  console.log(result.code === 0 ? 'resultado: passou' : `resultado: falhou (código ${result.code})`)
}

async function syncRemote() {
  const files = [
    ['src/services/stickerService.js', `${remoteDir}/src/services/stickerService.js`],
    ['scripts/validate-square.mjs', `${remoteDir}/scripts/validate-square.mjs`],
  ]

  const mkdir = await run('ssh', [
    ...sshBase,
    `${user}@${host}`,
    `mkdir -p ${remoteDir}/scripts ${remoteDir}/src/services`,
  ])
  if (mkdir.code !== 0) {
    throw new Error(`não conectou no VPS (${user}@${host}): ${(mkdir.stderr || mkdir.stdout).trim()}`)
  }

  for (const [relative, remote] of files) {
    const local = path.join(root, relative)
    await fs.access(local)
    const copied = await run('scp', [...sshBase, local, `${user}@${host}:${remote}`])
    if (copied.code !== 0) {
      throw new Error(`falha ao copiar ${relative}: ${(copied.stderr || copied.stdout).trim()}`)
    }
  }
}

async function validateRemote() {
  return run('ssh', [
    ...sshBase,
    `${user}@${host}`,
    `cd ${remoteDir} && node scripts/validate-square.mjs`,
  ])
}

async function main() {
  console.log(`validando local e ${user}@${host} ao mesmo tempo`)
  console.log('o VPS recebe o arquivo de conversão e o teste; o PM2 não é reiniciado')

  const remote = (async () => {
    await syncRemote()
    return validateRemote()
  })().catch((err) => ({
    code: 1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err),
  }))

  const local = run(process.execPath, [path.join(root, 'scripts', 'validate-square.mjs')], {
    cwd: root,
  })

  const [localResult, remoteResult] = await Promise.all([local, remote])

  printResult('local', localResult)
  printResult('vps', remoteResult)

  if (localResult.code !== 0 || remoteResult.code !== 0) {
    process.exitCode = 1
    return
  }

  console.log('\nos dois ambientes passaram.')
  console.log('o bot no VPS só passa a usar isso depois de: ssh e `pm2 restart cleiton-bot`')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
