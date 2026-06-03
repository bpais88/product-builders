import { execSync } from 'node:child_process'
import type { TimedAudioSegment } from '../types.js'

export function stitchAudioOnVideo(
  videoPath: string,
  audioSegments: TimedAudioSegment[],
  outputPath: string
): void {
  if (audioSegments.length === 0) throw new Error('No audio segments provided')

  const inputs = [`-i "${videoPath}"`]
  for (const seg of audioSegments) inputs.push(`-i "${seg.audioPath}"`)

  const filterParts: string[] = []
  const mixInputs: string[] = []
  for (let i = 0; i < audioSegments.length; i++) {
    const inputIdx = i + 1
    const delay = audioSegments[i].startOffsetMs
    const label = `a${i}`
    filterParts.push(`[${inputIdx}]adelay=${delay}|${delay}[${label}]`)
    mixInputs.push(`[${label}]`)
  }
  const mixFilter = `${mixInputs.join('')}amix=inputs=${audioSegments.length}:duration=longest:normalize=0[audio]`
  filterParts.push(mixFilter)

  const cmd = [
    'ffmpeg -y',
    ...inputs,
    `-filter_complex "${filterParts.join('; ')}"`,
    '-map 0:v -map "[audio]"',
    '-c:v libx264 -c:a aac',
    `"${outputPath}"`,
  ].join(' ')

  console.log(`  🎬 Stitching audio onto video...`)
  execSync(cmd, { stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 })
  console.log(`  ✅ Output: ${outputPath}`)
}

/**
 * Concatenate multiple video files into one. Inputs may have different
 * resolutions / frame rates / sample rates — everything is normalized to
 * a common target before concatenation so the concat filter doesn't reject.
 */
export function concatVideos(
  inputPaths: string[],
  outputPath: string,
  opts: { width?: number; height?: number; fps?: number; sampleRate?: number } = {}
): void {
  if (inputPaths.length === 0) throw new Error('No input videos provided')
  if (inputPaths.length === 1) {
    execSync(`cp "${inputPaths[0]}" "${outputPath}"`, { stdio: 'pipe' })
    return
  }

  const W = opts.width ?? 1920
  const H = opts.height ?? 1080
  const FPS = opts.fps ?? 30
  const SR = opts.sampleRate ?? 48000

  const inputs = inputPaths.map((p) => `-i "${p}"`).join(' ')

  // Per-input normalization: scale to fit W×H, pad with black, lock SAR, lock fps.
  // Audio: resample to SR, stereo, aac-friendly.
  const parts: string[] = []
  const labels: string[] = []
  for (let i = 0; i < inputPaths.length; i++) {
    parts.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS},format=yuv420p[v${i}]`
    )
    parts.push(
      `[${i}:a]aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`
    )
    labels.push(`[v${i}][a${i}]`)
  }
  parts.push(`${labels.join('')}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`)

  const filter = parts.join('; ')

  const cmd = [
    'ffmpeg -y',
    inputs,
    `-filter_complex "${filter}"`,
    '-map "[outv]" -map "[outa]"',
    '-c:v libx264 -preset medium -crf 20',
    '-c:a aac -b:a 192k',
    `"${outputPath}"`,
  ].join(' ')

  console.log(`  🎬 Concatenating ${inputPaths.length} videos @ ${W}×${H}/${FPS}fps...`)
  execSync(cmd, { stdio: 'pipe', maxBuffer: 100 * 1024 * 1024 })
  console.log(`  ✅ Output: ${outputPath}`)
}
