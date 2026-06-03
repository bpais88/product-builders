#!/usr/bin/env npx tsx
/**
 * Demo Recorder — global, project-agnostic narrated screen recorder.
 *
 * Usage:
 *   npx tsx ~/.claude/skills/demo-recorder/scripts/record-demo.ts <path-to-scene.ts>
 */

import { config as loadEnv } from 'dotenv'
import { mkdirSync, existsSync, rmSync, statSync } from 'node:fs'
import { join, resolve, isAbsolute, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'

// Load the skill's own .env regardless of the current working directory.
const __file = fileURLToPath(import.meta.url)
const SKILL_ROOT = resolve(dirname(__file), '..')
loadEnv({ path: join(SKILL_ROOT, '.env') })
import { generateAllSceneAudio } from './lib/elevenlabs-tts.js'
import { stitchAudioOnVideo, concatVideos } from './lib/audio-video-stitch.js'
import { renderIntro } from './lib/remotion-intro.js'
import { createBrowserContext, runBrowser, escapeShell } from './browser-context.js'
import type { DemoConfig, DemoScene, TimedAudioSegment, AudioSegment, Viewport } from './types.js'

// ── Viewport helpers ────────────────────────────────────────────

function resolveViewport(vp: Viewport): { width: number; height: number } {
  if (typeof vp === 'object') return vp
  switch (vp) {
    case 'desktop': return { width: 1920, height: 1080 }
    case 'mobile-portrait': return { width: 390, height: 844 }
    case 'tablet': return { width: 1024, height: 768 }
    case 'square': return { width: 1080, height: 1080 }
  }
}

// ── Scene config loader ─────────────────────────────────────────

async function loadDemoConfig(filePath: string): Promise<DemoConfig> {
  const abs = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath)
  if (!existsSync(abs)) throw new Error(`Scene file not found: ${abs}`)
  const mod = await import(pathToFileURL(abs).href)
  const config = mod.default ?? mod.config
  if (!config) throw new Error(`Scene file must export a DemoConfig as default export: ${abs}`)
  return config as DemoConfig
}

// ── Scene execution ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Drive the browser to the scene's "visually ready" state. Navigation,
 * network-idle wait, scroll, and action sequence. Does NOT sleep for the
 * audio duration — the caller handles that so it can measure the exact
 * wall-clock offset at which the scene became ready.
 */
async function prepareScene(scene: DemoScene, config: DemoConfig): Promise<void> {
  if (scene.url) {
    const full = scene.url.startsWith('http') ? scene.url : `${config.baseUrl}${scene.url}`
    runBrowser(`open "${full}"`)
    runBrowser('wait --load networkidle')
    await sleep(800)
  }

  if (scene.scrollDown) {
    runBrowser(`scroll down ${scene.scrollDown}`)
    await sleep(400)
  }

  if (scene.actions) {
    for (const a of scene.actions) {
      if (a.delayMs) await sleep(a.delayMs)
      switch (a.type) {
        case 'click':
          if (!a.target) break
          if (a.target.startsWith('@')) runBrowser(`click ${a.target}`)
          else runBrowser(`find text "${escapeShell(a.target)}" click`)
          break
        case 'fill':
        case 'type':
          if (!a.target || a.value === undefined) break
          if (a.target.startsWith('@')) {
            runBrowser(`click ${a.target}`)
            await sleep(100)
            runBrowser(`${a.type} ${a.target} "${escapeShell(a.value)}"`)
          }
          break
        case 'select':
          if (a.target && a.value !== undefined) {
            runBrowser(`select ${a.target} "${escapeShell(a.value)}"`)
          }
          break
        case 'scroll':
          runBrowser(`scroll down ${a.value ?? '300'}`)
          break
        case 'wait':
          await sleep(a.delayMs ?? 1000)
          break
        case 'press':
          if (a.value) runBrowser(`press ${escapeShell(a.value)}`)
          break
        case 'eval':
          if (a.value) runBrowser(`eval "${escapeShell(a.value)}"`)
          break
      }
    }
  }
}

// ── Timing ──────────────────────────────────────────────────────

interface SceneTiming {
  scene: DemoScene
  audio: AudioSegment
  startOffsetMs: number
  totalDurationMs: number
}

function calculateTimings(scenes: DemoScene[], audio: AudioSegment[]): SceneTiming[] {
  const timings: SceneTiming[] = []
  let offset = 0
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]
    const a = audio[i]
    const pauseBefore = s.pauseBeforeMs ?? 0
    const pauseAfter = s.pauseAfterMs ?? 500
    const audioDurMs = Math.ceil(a.durationSec * 1000)
    const startOffsetMs = offset + pauseBefore
    const totalDurationMs = pauseBefore + audioDurMs + pauseAfter
    timings.push({ scene: s, audio: a, startOffsetMs, totalDurationMs })
    offset += totalDurationMs
  }
  return timings
}

// ── Preflight ───────────────────────────────────────────────────

function preflightChecks(): void {
  try { execSync('which ffmpeg', { stdio: 'pipe' }) }
  catch { throw new Error('ffmpeg not found. Install: brew install ffmpeg') }
  try { execSync('which ffprobe', { stdio: 'pipe' }) }
  catch { throw new Error('ffprobe not found. Install: brew install ffmpeg') }
  try { execSync('which agent-browser', { stdio: 'pipe' }) }
  catch { throw new Error('agent-browser CLI not found. Install it first.') }
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set. Add to ~/.claude/skills/demo-recorder/.env or your shell env.')
  }
}

// ── Open browser with viewport ──────────────────────────────────

function openHeadedBrowser(baseUrl: string, viewport: Viewport | undefined): void {
  const vp = viewport ? resolveViewport(viewport) : null
  console.log(`  Opening browser → ${baseUrl}${vp ? ` (${vp.width}×${vp.height})` : ''}`)

  // Try opening with viewport flag; fall back silently if unsupported.
  if (vp) {
    try {
      runBrowser(`--headed --viewport ${vp.width}x${vp.height} open "${baseUrl}"`, true)
      return
    } catch {
      try {
        runBrowser(`--headed --viewport-size ${vp.width},${vp.height} open "${baseUrl}"`, true)
        return
      } catch {
        console.log('  ⚠️  viewport flag not supported; using default and resizing via eval')
      }
    }
  }
  runBrowser(`--headed open "${baseUrl}"`, true)
  if (vp) {
    // Best-effort resize — Playwright viewport is set at context creation;
    // window.resizeTo only resizes the window frame, not the viewport.
    runBrowser(`eval "if (window.resizeTo) window.resizeTo(${vp.width}, ${vp.height})"`)
  }
}

// ── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scenePath = process.argv[2]
  if (!scenePath) {
    console.error('Usage: record-demo.ts <path-to-scene.ts>')
    process.exit(2)
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Demo Recorder`)
  console.log(`  Scene file: ${scenePath}`)
  console.log(`${'═'.repeat(60)}\n`)

  preflightChecks()

  const config = await loadDemoConfig(scenePath)
  const outputDir = resolve(config.outputDir)
  mkdirSync(outputDir, { recursive: true })

  const tempDir = join(outputDir, '.temp-audio')
  mkdirSync(tempDir, { recursive: true })

  // Optional Phase 0 — Render Remotion intro (if configured)
  let introVideoPath: string | null = null
  if (config.intro && config.intro.scenes.length > 0) {
    console.log('🎞  Phase 0 — Rendering Remotion intro\n')
    introVideoPath = join(outputDir, `${config.name}-intro.mp4`)
    if (existsSync(introVideoPath)) rmSync(introVideoPath, { force: true })
    await renderIntro(config.name, config.intro, config.voiceId, introVideoPath)
    console.log()
  }

  // Phase 1
  console.log('📢 Phase 1 — Generating narration audio\n')
  const audioSegments = await generateAllSceneAudio(config.scenes, config.voiceId, tempDir)
  const totalAudioSec = audioSegments.reduce((s, x) => s + x.durationSec, 0)
  console.log(`\n  Total narration: ${totalAudioSec.toFixed(1)}s across ${audioSegments.length} scenes\n`)

  // Phase 2
  console.log('⏱  Phase 2 — Calculating scene timings\n')
  const timings = calculateTimings(config.scenes, audioSegments)
  const totalMs = timings.reduce((s, t) => s + t.totalDurationMs, 0)
  console.log(`  Estimated recording: ${(totalMs / 1000).toFixed(1)}s\n`)
  for (const t of timings) {
    console.log(
      `  ${t.scene.name.padEnd(25)} audio=${t.audio.durationSec.toFixed(1)}s ` +
      `offset=${(t.startOffsetMs / 1000).toFixed(1)}s total=${(t.totalDurationMs / 1000).toFixed(1)}s`
    )
  }
  console.log()

  // Phase 3
  console.log('🎥 Phase 3 — Recording browser session\n')
  const rawVideoPath = join(outputDir, `${config.name}-raw.webm`)
  if (existsSync(rawVideoPath)) rmSync(rawVideoPath, { force: true })

  // Kill ghost browsers from previous runs
  try { execSync('pkill -f "Google Chrome for Testing"', { stdio: 'pipe' }) } catch {}
  await sleep(1500)

  openHeadedBrowser(config.baseUrl, config.viewport)
  await sleep(1500)

  if (config.setup) {
    console.log('  Running setup hook...')
    await config.setup(createBrowserContext())
  }

  console.log(`  Starting recording → ${rawVideoPath}`)
  runBrowser(`record start "${rawVideoPath}"`, true)
  await sleep(500)
  const recordOrigin = Date.now()
  console.log('  Recording started ✓\n')

  // Measure actual wall-clock offsets so audio lines up with the moment
  // each scene is visually ready (after navigation + load + any actions),
  // not with the planned-duration accumulation.
  const measuredAudioOffsetsMs: number[] = []

  for (const t of timings) {
    console.log(`  ▸ Scene: ${t.scene.name}`)
    await prepareScene(t.scene, config)

    const sceneReadyMs = Date.now() - recordOrigin
    const pauseBefore = t.scene.pauseBeforeMs ?? 0
    const audioOffsetMs = sceneReadyMs + pauseBefore
    measuredAudioOffsetsMs.push(audioOffsetMs)

    const audioMs = Math.ceil(t.audio.durationSec * 1000)
    const pauseAfter = t.scene.pauseAfterMs ?? 500
    await sleep(pauseBefore + audioMs + pauseAfter)
  }

  console.log('\n  Stopping recording...')
  await sleep(1000)
  runBrowser('record stop')
  await sleep(500)

  if (config.teardown) {
    console.log('  Running teardown hook...')
    await config.teardown(createBrowserContext())
  }

  runBrowser('close')

  if (!existsSync(rawVideoPath)) {
    throw new Error(`Recording not found at ${rawVideoPath}. Is agent-browser installed and working?`)
  }
  const fileSize = statSync(rawVideoPath).size
  console.log(`  Raw recording: ${rawVideoPath} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`)
  if (fileSize < 100_000) {
    throw new Error(`Recording file too small (${fileSize} bytes) — likely failed`)
  }
  console.log()

  // Phase 4
  console.log('🔊 Phase 4 — Stitching narration onto video\n')
  const timedSegments: TimedAudioSegment[] = timings.map((t, i) => ({
    audioPath: t.audio.audioPath,
    startOffsetMs: measuredAudioOffsetsMs[i],
  }))
  const mainNarratedPath = join(outputDir, `${config.name}-main.mp4`)
  stitchAudioOnVideo(rawVideoPath, timedSegments, mainNarratedPath)

  // Optional Phase 4b — concat intro + main into final
  const finalPath = join(outputDir, `${config.name}-narrated.mp4`)
  if (introVideoPath) {
    console.log('\n🎬 Phase 4b — Concatenating intro with main recording\n')
    concatVideos([introVideoPath, mainNarratedPath], finalPath)
  } else {
    execSync(`mv "${mainNarratedPath}" "${finalPath}"`)
  }

  // Phase 5
  console.log('\n🧹 Phase 5 — Cleaning up\n')
  rmSync(tempDir, { recursive: true, force: true })
  rmSync(rawVideoPath, { force: true })
  if (introVideoPath && existsSync(introVideoPath)) rmSync(introVideoPath, { force: true })
  if (existsSync(mainNarratedPath)) rmSync(mainNarratedPath, { force: true })
  console.log('  Removed temp audio, raw recording, and intermediate videos')

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  ✅ Demo recorded: ${finalPath}`)
  console.log(`  Duration: ~${(totalMs / 1000).toFixed(0)}s`)
  console.log(`${'═'.repeat(60)}\n`)
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message ?? err)
  try { execSync('agent-browser record stop', { stdio: 'pipe' }) } catch {}
  try { execSync('agent-browser close', { stdio: 'pipe' }) } catch {}
  process.exit(1)
})
