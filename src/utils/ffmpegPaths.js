import { existsSync } from 'node:fs'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'

const WINGET_FFMPEG_BIN =
  'C:\\Users\\thoma\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin'

/**
 * Resolve caminhos do ffmpeg/ffprobe (env → PATH → instalação WinGet comum).
 * @returns {{ ffmpegPath: string, ffprobePath: string }}
 */
export function resolveFfmpegPaths() {
  const ffmpegPath =
    process.env.FFMPEG_PATH ||
    (existsSync(path.join(WINGET_FFMPEG_BIN, 'ffmpeg.exe'))
      ? path.join(WINGET_FFMPEG_BIN, 'ffmpeg.exe')
      : 'ffmpeg')

  const ffprobePath =
    process.env.FFPROBE_PATH ||
    (existsSync(path.join(WINGET_FFMPEG_BIN, 'ffprobe.exe'))
      ? path.join(WINGET_FFMPEG_BIN, 'ffprobe.exe')
      : 'ffprobe')

  return { ffmpegPath, ffprobePath }
}

/**
 * Configura o fluent-ffmpeg com os binários resolvidos.
 * @returns {{ ffmpegPath: string, ffprobePath: string }}
 */
export function configureFfmpeg() {
  const paths = resolveFfmpegPaths()
  ffmpeg.setFfmpegPath(paths.ffmpegPath)
  ffmpeg.setFfprobePath(paths.ffprobePath)
  return paths
}
