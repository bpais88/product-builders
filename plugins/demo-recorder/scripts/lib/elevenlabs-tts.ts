import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import type { DemoScene, AudioSegment } from '../types.js'

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_flash_v2_5'
const OUTPUT_FORMAT = 'mp3_44100_128'

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set in environment')
  return key
}

export async function generateSpeechFile(text: string, voiceId: string, outputPath: string): Promise<void> {
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
  for (const scene of scenes) {
    const audioPath = join(outputDir, `${scene.name}.mp3`)
    console.log(`  🎙  Generating audio: ${scene.name}`)
    await generateSpeechFile(scene.narration, voiceId, audioPath)
    const durationSec = getAudioDuration(audioPath)
    console.log(`      → ${durationSec.toFixed(1)}s`)
    segments.push({ sceneName: scene.name, audioPath, durationSec })
  }
  return segments
}
