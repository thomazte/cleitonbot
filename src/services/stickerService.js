import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import webp from 'node-webpmux'
import { cleanFiles, tempPath } from '../utils/fileCleaner.js'
import { configureFfmpeg, resolveFfmpegPaths } from '../utils/ffmpegPaths.js'

const execFileAsync = promisify(execFile)
configureFfmpeg()

const STICKER_SIZE = 512
const MAX_STATIC_BYTES = 200 * 1024
const MAX_ANIMATED_BYTES = 500 * 1024
const MAX_VIDEO_DURATION_SEC = 30
const CLIP_DURATION_SEC = 4.5

/**
 * @typedef {object} StickerMeta
 * @property {string} pack
 * @property {string} author
 */

/**
 * @typedef {'fill' | 'contain'} StickerFit
 * - `fill`: estica a mídia para preencher 512×512 (achatada).
 * - `contain`: mantém a proporção original e preenche o resto com transparência.
 */

/**
 * @typedef {object} StickerOptions
 * @property {StickerFit} [fit]
 */

/**
 * Serviço de conversão de mídia em figurinhas WebP compatíveis com WhatsApp.
 */
export class StickerService {
  /**
   * @param {string} tempDir
   */
  constructor(tempDir) {
    this.tempDir = tempDir
  }

  /**
   * Converte buffer de imagem estática (jpg/png/webp) em figurinha.
   * @param {Buffer} inputBuffer
   * @param {StickerMeta} meta
   * @param {StickerOptions} [options]
   * @returns {Promise<Buffer>}
   */
  async fromImage(inputBuffer, meta, options = {}) {
    const fit = options.fit === 'contain' ? 'contain' : 'fill'
    const outPath = tempPath(this.tempDir, '.webp')
    try {
      let quality = 80
      let buffer

      for (let attempt = 0; attempt < 6; attempt++) {
        buffer = await sharp(inputBuffer, { animated: false })
          .rotate()
          .resize(STICKER_SIZE, STICKER_SIZE, {
            fit,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality, alphaQuality: 90, effort: 6 })
          .toBuffer()

        if (buffer.length <= MAX_STATIC_BYTES) break
        quality = Math.max(20, quality - 12)
      }

      if (buffer.length > MAX_ANIMATED_BYTES) {
        throw new Error('A imagem ficou muito pesada mesmo após compressão. Tente outra mídia.')
      }

      await fs.writeFile(outPath, buffer)
      return await this.#injectExif(outPath, meta)
    } finally {
      await cleanFiles(outPath)
    }
  }

  /**
   * Converte vídeo/GIF em figurinha animada.
   * @param {Buffer} inputBuffer
   * @param {string} inputExt  ex: ".mp4", ".gif"
   * @param {StickerMeta} meta
   * @param {StickerOptions} [options]
   * @returns {Promise<Buffer>}
   */
  async fromVideo(inputBuffer, inputExt, meta, options = {}) {
    const fit = options.fit === 'contain' ? 'contain' : 'fill'
    const inPath = tempPath(this.tempDir, inputExt || '.mp4')
    const outPath = tempPath(this.tempDir, '.webp')
    const pathsToClean = [inPath, outPath]

    try {
      await fs.writeFile(inPath, inputBuffer)

      const duration = await this.#getDuration(inPath)
      if (duration > MAX_VIDEO_DURATION_SEC) {
        throw new Error(
          `Esse vídeo tem ${Math.round(duration)}s. Envie um clipe de até ${MAX_VIDEO_DURATION_SEC} segundos 🙂`
        )
      }

      const presets = [
        { fps: 14, quality: 55 },
        { fps: 12, quality: 45 },
        { fps: 10, quality: 35 },
        { fps: 10, quality: 25 },
        { fps: 10, quality: 15 },
      ]

      let finalBuffer = null

      for (const preset of presets) {
        await this.#renderAnimatedWebp(inPath, outPath, preset, fit)
        const buf = await fs.readFile(outPath)
        if (buf.length <= MAX_ANIMATED_BYTES) {
          finalBuffer = buf
          break
        }
      }

      if (!finalBuffer) {
        throw new Error(
          'Não consegui deixar a figurinha abaixo de 500 KB. Envie um clipe mais curto ou com menos movimento.'
        )
      }

      await fs.writeFile(outPath, finalBuffer)
      return await this.#injectExif(outPath, meta)
    } finally {
      await cleanFiles(...pathsToClean)
    }
  }

  /**
   * @param {string} inputPath
   * @param {string} outputPath
   * @param {{ fps: number, quality: number }} preset
   * @param {StickerFit} fit
   */
  #renderAnimatedWebp(inputPath, outputPath, preset, fit) {
    const scale =
      fit === 'contain'
        ? `scale=${STICKER_SIZE}:${STICKER_SIZE}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${STICKER_SIZE}:${STICKER_SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`
        : `scale=${STICKER_SIZE}:${STICKER_SIZE}:flags=lanczos`

    const vf = ['format=rgba', scale, `fps=${preset.fps}`].join(',')

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setDuration(CLIP_DURATION_SEC)
        .outputOptions([
          '-vf',
          vf,
          '-an',
          '-fps_mode',
          'passthrough',
          '-loop',
          '0',
          '-c:v',
          'libwebp',
          '-quality',
          String(preset.quality),
          '-compression_level',
          '6',
        ])
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`Falha no FFmpeg: ${err.message}`)))
        .save(outputPath)
    })
  }

  /**
   * Obtém duração em segundos via ffprobe.
   * @param {string} filePath
   * @returns {Promise<number>}
   */
  async #getDuration(filePath) {
    try {
      const { ffprobePath } = resolveFfmpegPaths()
      const { stdout } = await execFileAsync(ffprobePath, [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ])
      const value = Number.parseFloat(String(stdout).trim())
      return Number.isFinite(value) ? value : 0
    } catch {
      // GIF sem container tipado: assume curto o suficiente
      return 0
    }
  }

  /**
   * Injeta metadados EXIF (pack/author) no WebP.
   * @param {string} webpPath
   * @param {StickerMeta} meta
   * @returns {Promise<Buffer>}
   */
  async #injectExif(webpPath, meta) {
    const img = new webp.Image()
    await img.load(webpPath)

    const json = JSON.stringify({
      'sticker-pack-id': `com.cleitonbot.${Date.now()}`,
      'sticker-pack-name': meta.pack || 'Cleiton Bot',
      'sticker-pack-publisher': meta.author || 'Cleiton',
      emojis: ['✨'],
    })

    // Formato EXIF esperado pelo WhatsApp
    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ])
    const jsonBuffer = Buffer.from(json, 'utf8')
    const exif = Buffer.concat([exifAttr, jsonBuffer])
    exif.writeUIntLE(jsonBuffer.length, 14, 4)

    img.exif = exif
    const taggedPath = tempPath(this.tempDir, '-exif.webp')
    try {
      await img.save(taggedPath)
      return await fs.readFile(taggedPath)
    } finally {
      await cleanFiles(taggedPath)
    }
  }
}
