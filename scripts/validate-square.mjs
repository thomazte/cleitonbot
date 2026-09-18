import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { StickerService } from '../src/services/stickerService.js'
import { resolveFfmpegPaths } from '../src/utils/ffmpegPaths.js'

const execFileAsync = promisify(execFile)

const META = { pack: 'Cleiton Validate', author: 'Cleiton' }
const COLORS = {
  tl: [220, 20, 20],
  tr: [20, 180, 20],
  bl: [20, 20, 220],
  br: [220, 200, 20],
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {Promise<Buffer>}
 */
async function quadrantPng(width, height) {
  const raw = Buffer.alloc(width * height * 3)
  const midX = width / 2
  const midY = height / 2

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color =
        y < midY ? (x < midX ? COLORS.tl : COLORS.tr) : x < midX ? COLORS.bl : COLORS.br
      const i = (y * width + x) * 3
      raw[i] = color[0]
      raw[i + 1] = color[1]
      raw[i + 2] = color[2]
    }
  }

  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

/**
 * @param {Buffer} buffer
 * @param {number} x
 * @param {number} y
 */
async function sample(buffer, x, y) {
  const { data, info } = await sharp(buffer, { animated: false, page: 0 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const i = (y * info.width + x) * 4
  return {
    r: data[i],
    g: data[i + 1],
    b: data[i + 2],
    a: data[i + 3],
    width: info.width,
    height: info.height,
  }
}

/**
 * @param {{ r: number, g: number, b: number, a: number }} pixel
 * @param {[number, number, number]} expected
 * @param {number} tolerance
 */
function matchesColor(pixel, expected, tolerance) {
  return (
    pixel.a > 200 &&
    Math.abs(pixel.r - expected[0]) <= tolerance &&
    Math.abs(pixel.g - expected[1]) <= tolerance &&
    Math.abs(pixel.b - expected[2]) <= tolerance
  )
}

/**
 * @param {Buffer} sticker
 * @param {string} label
 * @param {number} tolerance
 */
async function assertStretchedSquare(sticker, label, tolerance) {
  const corners = [
    ['canto superior esquerdo', 8, 8, COLORS.tl],
    ['canto superior direito', 503, 8, COLORS.tr],
    ['canto inferior esquerdo', 8, 503, COLORS.bl],
    ['canto inferior direito', 503, 503, COLORS.br],
  ]

  const samples = []
  for (const [name, x, y, expected] of corners) {
    const pixel = await sample(sticker, x, y)
    samples.push({ name, pixel, expected })
  }

  const { width, height } = samples[0].pixel
  if (width !== 512 || height !== 512) {
    throw new Error(`${label}: saiu ${width}×${height}, esperado 512×512.`)
  }

  const padded = samples.filter((item) => item.pixel.a < 200)
  if (padded.length > 0) {
    throw new Error(
      `${label}: ainda tem barra transparente (${padded.map((item) => item.name).join(', ')}). A mídia foi encaixada, não esticada.`
    )
  }

  const wrong = samples.filter((item) => !matchesColor(item.pixel, item.expected, tolerance))
  if (wrong.length > 0) {
    const detail = wrong
      .map(
        (item) =>
          `${item.name} rgb(${item.pixel.r},${item.pixel.g},${item.pixel.b}) em vez de rgb(${item.expected.join(',')})`
      )
      .join('; ')
    throw new Error(
      `${label}: o quadrado não preservou os cantos da mídia original (${detail}). Pode ter sido cortada em vez de esticada.`
    )
  }
}

/**
 * @param {Buffer} sticker
 * @param {string} label
 * @param {'wide' | 'tall'} orientation
 */
async function assertContainedSquare(sticker, label, orientation) {
  const corner = await sample(sticker, 8, 8)
  if (corner.width !== 512 || corner.height !== 512) {
    throw new Error(`${label}: saiu ${corner.width}×${corner.height}, esperado 512×512.`)
  }

  if (orientation === 'wide') {
    const topPad = await sample(sticker, 256, 8)
    const bottomPad = await sample(sticker, 256, 503)
    const leftEdge = await sample(sticker, 8, 256)
    const rightEdge = await sample(sticker, 503, 256)

    if (topPad.a >= 200 || bottomPad.a >= 200) {
      throw new Error(`${label}: esperava barras transparentes em cima/baixo.`)
    }
    if (leftEdge.a < 200 || rightEdge.a < 200) {
      throw new Error(`${label}: as laterais deveriam ter mídia opaca.`)
    }
    if (!matchesColor(leftEdge, COLORS.tl, 50) && !matchesColor(leftEdge, COLORS.bl, 50)) {
      throw new Error(`${label}: borda esquerda não bate com a cor esperada.`)
    }
    if (!matchesColor(rightEdge, COLORS.tr, 50) && !matchesColor(rightEdge, COLORS.br, 50)) {
      throw new Error(`${label}: borda direita não bate com a cor esperada.`)
    }
    return
  }

  const leftPad = await sample(sticker, 8, 256)
  const rightPad = await sample(sticker, 503, 256)
  const topEdge = await sample(sticker, 256, 8)
  const bottomEdge = await sample(sticker, 256, 503)

  if (leftPad.a >= 200 || rightPad.a >= 200) {
    throw new Error(`${label}: esperava barras transparentes nas laterais.`)
  }
  if (topEdge.a < 200 || bottomEdge.a < 200) {
    throw new Error(`${label}: o topo/base deveriam ter mídia opaca.`)
  }
  if (!matchesColor(topEdge, COLORS.tl, 50) && !matchesColor(topEdge, COLORS.tr, 50)) {
    throw new Error(`${label}: topo não bate com a cor esperada.`)
  }
  if (!matchesColor(bottomEdge, COLORS.bl, 50) && !matchesColor(bottomEdge, COLORS.br, 50)) {
    throw new Error(`${label}: base não bate com a cor esperada.`)
  }
}

/**
 * @param {string} ffmpegPath
 * @param {string} outputPath
 */
async function writeQuadrantVideo(ffmpegPath, outputPath) {
  await execFileAsync(ffmpegPath, [
    '-y',
    '-f', 'lavfi', '-i', 'color=c=0xDC1414:s=400x100:d=0.4',
    '-f', 'lavfi', '-i', 'color=c=0x14B414:s=400x100:d=0.4',
    '-f', 'lavfi', '-i', 'color=c=0x1414DC:s=400x100:d=0.4',
    '-f', 'lavfi', '-i', 'color=c=0xDCC814:s=400x100:d=0.4',
    '-filter_complex', '[0][1]hstack[top];[2][3]hstack[bot];[top][bot]vstack',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-t', '0.4',
    outputPath,
  ])
}

async function main() {
  const where = `${os.hostname()} / ${process.platform}`
  console.log(`validando modos fill/contain em ${where}`)

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cleiton-square-'))
  const service = new StickerService(tempDir)

  try {
    const wide = await quadrantPng(800, 200)
    const tall = await quadrantPng(200, 800)

    const wideSticker = await service.fromImage(wide, META, { fit: 'fill' })
    await assertStretchedSquare(wideSticker, 'imagem horizontal 800×200', 40)
    console.log('ok  imagem horizontal esticada para 512×512')

    const tallSticker = await service.fromImage(tall, META, { fit: 'fill' })
    await assertStretchedSquare(tallSticker, 'imagem vertical 200×800', 40)
    console.log('ok  imagem vertical esticada para 512×512')

    const wideContain = await service.fromImage(wide, META, { fit: 'contain' })
    await assertContainedSquare(wideContain, 'imagem horizontal contain 800×200', 'wide')
    console.log('ok  imagem horizontal com proporção original')

    const tallContain = await service.fromImage(tall, META, { fit: 'contain' })
    await assertContainedSquare(tallContain, 'imagem vertical contain 200×800', 'tall')
    console.log('ok  imagem vertical com proporção original')

    const { ffmpegPath } = resolveFfmpegPaths()
    const videoPath = path.join(tempDir, 'quadrants.mp4')
    await writeQuadrantVideo(ffmpegPath, videoPath)
    const videoBuffer = await fs.readFile(videoPath)

    const videoSticker = await service.fromVideo(videoBuffer, '.mp4', META, { fit: 'fill' })
    await assertStretchedSquare(videoSticker, 'vídeo 800×200', 70)
    console.log('ok  vídeo esticado para 512×512')

    const videoContain = await service.fromVideo(videoBuffer, '.mp4', META, { fit: 'contain' })
    await assertContainedSquare(videoContain, 'vídeo contain 800×200', 'wide')
    console.log('ok  vídeo com proporção original')

    console.log(`passou  ${where}`)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(`falhou  ${err instanceof Error ? err.message : err}`)
  process.exitCode = 1
})
