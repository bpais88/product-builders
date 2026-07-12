import { writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import type { DemoScene, AudioSegment } from '../types.js'

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_flash_v2_5'
const OUTPUT_FORMAT = 'mp3_44100_128'

// Persistent TTS cache (keyed by model+format+voice+text). Survives across runs and
// projects, so re-recording the same narration is free and instant. Disable with
// DEMO_RECORDER_NO_TTS_CACHE=1.
//
// It must NOT live under the plugin directory: Claude Code replaces that wholesale on
// every plugin update, which would silently discard the cache and re-bill every line to
// ElevenLabs. run.sh sets DEMO_RECORDER_CACHE_DIR; the homedir path is the fallback for
// a direct `tsx record-demo.ts` invocation.
const CACHE_DIR =
  process.env.DEMO_RECORDER_CACHE_DIR ?? join(homedir(), '.demo-recorder', 'tts-cache')
const CACHE_DISABLED = process.env.DEMO_RECORDER_NO_TTS_CACHE === '1'

function cacheKeyFor(text: string, voiceId: string): string {
  return createHash('sha256').update(`${MODEL_ID}|${OUTPUT_FORMAT}|${voiceId}|${text}`).digest('hex')
}

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set in environment')
  return key
}

/** Generate (or reuse cached) speech. Returns true when served from cache. */
export async function generateSpeechFile(text: string, voiceId: string, outputPath: string): Promise<boolean> {
  const cachePath = join(CACHE_DIR, `${cacheKeyFor(text, voiceId)}.mp3`)
  if (!CACHE_DISABLED && existsSync(cachePath)) {
    copyFileSync(cachePath, outputPath)
    return true
  }

  const apiKey = getApiKey()
  const response = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      }),
    }
  )
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`ElevenLabs API error ${response.status}: ${body}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  writeFileSync(outputPath, Buffer.from(arrayBuffer))
  if (!CACHE_DISABLED) {
    try { mkdirSync(CACHE_DIR, { recursive: true }); copyFileSync(outputPath, cachePath) } catch { /* cache best-effort */ }
  }
  return false
}

export function getAudioDuration(filePath: string): number {
  const result = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
    { encoding: 'utf-8' }
  ).trim()
  const duration = parseFloat(result)
  if (isNaN(duration)) throw new Error(`Could not parse duration from ffprobe output: "${result}"`)
  return duration
}

export async function generateAllSceneAudio(
  scenes: DemoScene[],
  voiceId: string,
  outputDir: string
): Promise<AudioSegment[]> {
  const segments: AudioSegment[] = []
  let cachedCount = 0
  for (const scene of scenes) {
    const audioPath = join(outputDir, `${scene.name}.mp3`)
    console.log(`  🎙  Generating audio: ${scene.name}`)
    const fromCache = await generateSpeechFile(scene.narration, voiceId, audioPath)
    if (fromCache) cachedCount++
    const durationSec = getAudioDuration(audioPath)
    console.log(`      → ${durationSec.toFixed(1)}s${fromCache ? ' (cached)' : ''}`)
    segments.push({ sceneName: scene.name, audioPath, durationSec })
  }
  if (cachedCount) console.log(`  ♻️  ${cachedCount}/${scenes.length} clips served from cache`)
  return segments
}
