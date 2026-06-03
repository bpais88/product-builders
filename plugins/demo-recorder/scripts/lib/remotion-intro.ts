import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateSpeechFile, getAudioDuration } from './elevenlabs-tts.js'
import type { IntroConfig } from '../types.js'

// Resolve the skill root (this file is at scripts/lib/remotion-intro.ts)
const __filename = fileURLToPath(import.meta.url)
const SKILL_ROOT = resolve(dirname(__filename), '..', '..')
const REMOTION_DIR = join(SKILL_ROOT, 'remotion')
const PUBLIC_VOICEOVER_DIR = join(REMOTION_DIR, 'public', 'voiceover')

export async function renderIntro(
  demoName: string,
  intro: IntroConfig,
  voiceId: string,
  outputPath: string
): Promise<void> {
  if (!existsSync(REMOTION_DIR)) {
    throw new Error(`Remotion project not found at ${REMOTION_DIR}. Run: cd ${REMOTION_DIR} && npm install`)
  }
  if (!existsSync(join(REMOTION_DIR, 'node_modules'))) {
    throw new Error(`Remotion deps not installed. Run: cd ${REMOTION_DIR} && npm install`)
  }

  const audioDirRel = `voiceover/${demoName}`
  const audioDirAbs = join(PUBLIC_VOICEOVER_DIR, demoName)
  mkdirSync(audioDirAbs, { recursive: true })

  // Phase A — generate intro scene audio and measure durations
  console.log('  🎙  Generating intro narration...')
  const scenesForRender = []
  const audioDurationsSec: number[] = []
  for (const scene of intro.scenes) {
    let audioRel = ''
    let durationSec = scene.holdSec ?? 3
    if (scene.narration && scene.narration.trim()) {
      const audioFile = `${scene.id}.mp3`
      const audioAbs = join(audioDirAbs, audioFile)
      console.log(`      → ${scene.id}`)
      await generateSpeechFile(scene.narration, voiceId, audioAbs)
      durationSec = getAudioDuration(audioAbs)
      audioRel = `${audioDirRel}/${audioFile}`
    }
    scenesForRender.push({
      id: scene.id,
      text: scene.text,
      highlightWords: scene.highlightWords ?? [],
      caption: scene.caption,
      audioPath: audioRel,
      backgroundColor: scene.backgroundColor,
      textColor: scene.textColor,
      highlightColor: scene.highlightColor,
      timeline: scene.timeline,
    })
    audioDurationsSec.push(durationSec)
  }

  // Phase B — write props JSON (with pre-computed audio durations)
  const propsPath = join(audioDirAbs, '.props.json')
  writeFileSync(
    propsPath,
    JSON.stringify({
      scenes: scenesForRender,
      pauseBetweenSec: intro.pauseBetweenSec ?? 0.6,
      fontFamily: intro.fontFamily,
      audioDurationsSec,
    })
  )

  // Phase C — invoke remotion render
  console.log('  🎬 Rendering Remotion intro (this may take 30-90s)...')
  const cmd = [
    'npx',
    'remotion',
    'render',
    'src/index.ts',
    'IntroSeries',
    `"${outputPath}"`,
    `--props="${propsPath}"`,
    '--log=error',
  ].join(' ')

  execSync(cmd, {
    cwd: REMOTION_DIR,
    stdio: 'inherit',
    maxBuffer: 100 * 1024 * 1024,
  })

  // Phase D — cleanup audio staged in public/
  rmSync(audioDirAbs, { recursive: true, force: true })

  if (!existsSync(outputPath)) {
    throw new Error(`Remotion render did not produce ${outputPath}`)
  }
  console.log(`  ✅ Intro rendered: ${outputPath}`)
}
