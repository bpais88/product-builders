#!/usr/bin/env npx tsx
/**
 * Demo Recorder — global, project-agnostic narrated screen recorder.
 *
 * Usage:
 *   npx tsx ~/.claude/skills/demo-recorder/scripts/record-demo.ts <path-to-scene.ts>
 */

import { config as loadEnv } from 'dotenv'
import { mkdirSync, existsSync, rmSync, statSync, renameSync } from 'node:fs'
import { join, resolve, isAbsolute, dirname } from 'node:path'
import { homedir } from 'node:os'
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
import type { DemoConfig, DemoScene, TimedAudioSegment, AudioSegment, Viewport, AuthConfig } from './types.js'

// Terminal cover banner (kept in sync with the cover in SKILL.md).
const COVER = `
  ╭────────────────────────────────────────────────────────╮
  │                                                        │
  │  ▐█▌  D E M O   R E C O R D E R                        │
  │  ▐█▌                                                   │
  │  ▐█▌  narrated product demos, end to end               │
  │       ElevenLabs · agent-browser · ffmpeg              │
  │                                                        │
  ╰────────────────────────────────────────────────────────╯
`

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

  // This skill targets agent-browser ≥0.27: recording honors the active viewport
  // (native 1080p) and the daemon is a binary (kill pattern). Older versions cap
  // recording at 720p and the auth/daemon handling won't match — warn loudly.
  try {
    const raw = execSync('agent-browser --version', { stdio: 'pipe', encoding: 'utf-8' }).trim()
    const m = raw.match(/(\d+)\.(\d+)\.(\d+)/)
    if (m) {
      const [maj, min] = [Number(m[1]), Number(m[2])]
      const tooOld = maj === 0 && min < 27
      if (tooOld) {
        console.warn(
          `\n  ⚠️  agent-browser ${m[0]} detected — this skill targets ≥0.27.\n` +
          `     On older versions recording is capped at 720p and --profile auth may not apply.\n` +
          `     Upgrade:  npm install -g agent-browser@latest\n`
        )
      }
    }
  } catch { /* version probe is best-effort */ }

  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set. Add to ~/.claude/skills/demo-recorder/.env or your shell env.')
  }
}

// ── Open browser with viewport ──────────────────────────────────

async function openHeadedBrowser(
  baseUrl: string,
  viewport: Viewport | undefined,
  auth?: AuthConfig
): Promise<void> {
  const vp = viewport ? resolveViewport(viewport) : null
  console.log(`  Opening browser → ${baseUrl}${vp ? ` (${vp.width}×${vp.height})` : ''}`)

  // Global launch flags. These ONLY take effect when the agent-browser daemon
  // (re)starts — the caller pkills the daemon first so a fresh one boots with them.
  // A persistent --profile carries the logged-in session across runs and into the
  // fresh recording context; --state seeds a portable storageState JSON.
  const flags: string[] = []
  if (auth?.profile) flags.push(`--profile "${expandHome(auth.profile)}"`)
  if (auth?.state && existsSync(expandHome(auth.state))) flags.push(`--state "${expandHome(auth.state)}"`)
  const prefix = flags.length ? flags.join(' ') + ' ' : ''
  if (prefix) console.log(`  Auth: ${flags.join(' ')}`)

  // `open` is headed by default and auto-launches the browser. Immediately after
  // a pkill the daemon can report "Browser not launched" on the first call while
  // it is still spinning up — retry a few times before giving up.
  let opened = false
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      runBrowser(`${prefix}open "${baseUrl}"`, true)
      opened = true
      break
    } catch (err) {
      if (attempt === 3) throw err
      await sleep(1200)
    }
  }
  if (opened && vp) {
    // `set viewport` sets the real Playwright viewport. On agent-browser ≥0.27 the
    // recording context inherits it (true native resolution, e.g. 1920×1080); it's
    // re-applied right before `record start` to be safe.
    runBrowser(`set viewport ${vp.width} ${vp.height}`)
  }
}

// ── Auth (product-agnostic: human logs in once, session is reused) ───

/** Expand a leading ~ to the user's home dir. */
function expandHome(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p
}

/** Minimal glob: `*`/`**` → any chars, everything else literal. Substring-anchored. */
function globMatch(value: string, pattern: string): boolean {
  const re = new RegExp(
    pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*+/g, '.*')
  )
  return re.test(value)
}

/** True when the current page looks authenticated per the `ready` check. */
function isAuthenticated(auth: AuthConfig): boolean {
  const r = auth.ready
  if (!r) return false
  if (r.urlMatches) {
    const url = runBrowser('get url')
    if (url && globMatch(url, r.urlMatches)) return true
  }
  if (r.selector) {
    const vis = runBrowser(`is visible "${escapeShell(r.selector)}"`)
    if (/true/i.test(vis)) return true
  }
  return false
}

/**
 * Ensure an authenticated session BEFORE recording. The skill never types
 * credentials — if no session is detected it opens the login page and waits for
 * the human to finish (SSO/MFA included), then optionally captures storageState.
 * A persistent profile means this only ever prompts on first run / expiry.
 */
async function ensureAuthenticated(auth: AuthConfig): Promise<void> {
  if (isAuthenticated(auth)) {
    console.log('  🔓 Existing session detected — skipping login.')
    if (auth.state && !existsSync(expandHome(auth.state))) {
      runBrowser(`state save "${expandHome(auth.state)}"`)
      console.log(`  💾 Saved session → ${auth.state}`)
    }
    return
  }
  if (!auth.loginUrl) {
    console.log('  ⚠️  No session detected and no auth.loginUrl set — continuing unauthenticated.')
    return
  }

  console.log(`\n  🔐 No active session. Opening login page: ${auth.loginUrl}`)
  runBrowser(`open "${auth.loginUrl}"`)
  console.log('  👤 Please LOG IN in the browser window now (SSO / MFA are fine).')
  console.log('     I will continue automatically once your login is detected…\n')

  const timeoutMs = (auth.loginTimeoutSec ?? 240) * 1000
  const start = Date.now()
  const loginHost = safeHost(auth.loginUrl)
  while (Date.now() - start < timeoutMs) {
    await sleep(2500)
    // Success either when `ready` matches, or (no ready given) when the page has
    // navigated away from the login host — a reasonable "login redirected me" signal.
    const done = auth.ready
      ? isAuthenticated(auth)
      : !!loginHost && safeHost(runBrowser('get url')) !== loginHost
    if (done) {
      console.log('  ✓ Login detected.')
      if (auth.state) {
        runBrowser(`state save "${expandHome(auth.state)}"`)
        console.log(`  💾 Saved session → ${auth.state}`)
      }
      return
    }
  }
  throw new Error(
    `Login not detected within ${auth.loginTimeoutSec ?? 240}s. ` +
    `Set auth.ready ({urlMatches|selector}) for reliable detection, or increase auth.loginTimeoutSec.`
  )
}

function safeHost(url: string): string {
  try { return new URL(url).host } catch { return '' }
}

// ── Trim + dry-run ──────────────────────────────────────────────

/** Re-encode a [startSec, startSec+durSec] window of a video. */
function trimVideo(input: string, output: string, startSec: number, durSec: number): void {
  execSync(
    `ffmpeg -y -ss ${startSec.toFixed(3)} -i "${input}" -t ${durSec.toFixed(3)} ` +
    `-c:v libx264 -preset medium -crf 20 -c:a aac -b:a 192k -movflags +faststart "${output}"`,
    { stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 }
  )
}

/**
 * Drive every scene through the browser and screenshot it — no TTS, no recording,
 * no stitch. Cheap validation of auth, navigation, and selectors before spending
 * ElevenLabs credits. Also prints a word-count narration-duration estimate per scene.
 */
async function runDryRun(config: DemoConfig, outputDir: string): Promise<void> {
  const shotDir = join(outputDir, 'dryrun')
  mkdirSync(shotDir, { recursive: true })
  console.log('🔎 Dry run — navigating scenes + screenshots (no audio, no recording)\n')

  try { execSync('pkill -f "Google Chrome for Testing"', { stdio: 'pipe' }) } catch {}
  // agent-browser's daemon is a compiled binary (≥0.10), not `node dist/daemon.js`.
  // It must be killed so a fresh daemon picks up --profile/--state (it ignores them
  // when already running). Match the binary path across platforms.
  try { execSync('pkill -f "agent-browser/bin/agent-browser"', { stdio: 'pipe' }) } catch {}
  await sleep(1500)

  await openHeadedBrowser(config.baseUrl, config.viewport, config.auth)
  await sleep(1500)
  if (config.auth) await ensureAuthenticated(config.auth)
  if (config.setup) {
    console.log('  Running setup hook...')
    await config.setup(createBrowserContext())
  }

  let totalEst = 0
  let fails = 0
  for (const scene of config.scenes) {
    let status = '✓'
    let note = ''
    try {
      await prepareScene(scene, config)
    } catch (err: any) {
      status = '✗'; fails++; note = '  ⚠ ' + (err?.message ?? String(err)).slice(0, 80)
    }
    runBrowser(`screenshot "${join(shotDir, `${scene.name}.png`)}"`)
    const words = (scene.narration ?? '').trim().split(/\s+/).filter(Boolean).length
    const estSec = +(words / 2.5).toFixed(1)
    totalEst += estSec
    const url = runBrowser('get url')
    console.log(`  ${status} ${scene.name.padEnd(22)} ~${estSec}s  ${url}${note}`)
  }

  runBrowser('close')

  console.log(`\n  Screenshots → ${shotDir}`)
  console.log(`  Estimated narration: ~${totalEst.toFixed(1)}s across ${config.scenes.length} scenes`)
  if (fails) console.log(`  ⚠️  ${fails} scene(s) errored while navigating — inspect the screenshots first.`)
  console.log('\n  Dry run complete. Review screenshots, then run without --dry-run to record.')
}

// ── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const scenePath = argv.find((a) => !a.startsWith('--'))
  const DRY_RUN = flags.has('--dry-run')
  const NO_TRIM = flags.has('--no-trim')
  if (!scenePath) {
    console.error('Usage: record-demo.ts <path-to-scene.ts> [--dry-run] [--no-trim]')
    process.exit(2)
  }

  console.log(COVER)
  console.log(`  Scene file: ${scenePath}${DRY_RUN ? '  (DRY RUN — no audio, no recording)' : ''}\n`)

  preflightChecks()

  const config = await loadDemoConfig(scenePath)
  const outputDir = resolve(config.outputDir)
  mkdirSync(outputDir, { recursive: true })

  // Dry run: drive the browser through every scene and screenshot it — no TTS,
  // no recording, no stitch. Cheap way to validate auth/routing/selectors first.
  if (DRY_RUN) {
    await runDryRun(config, outputDir)
    return
  }

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

  // Kill ghost browsers AND the agent-browser daemon from previous runs. The
  // daemon must be killed too: it ignores --profile/--state if already running,
  // so a fresh one has to boot with this run's auth flags.
  try { execSync('pkill -f "Google Chrome for Testing"', { stdio: 'pipe' }) } catch {}
  // agent-browser's daemon is a compiled binary (≥0.10), not `node dist/daemon.js`.
  // It must be killed so a fresh daemon picks up --profile/--state (it ignores them
  // when already running). Match the binary path across platforms.
  try { execSync('pkill -f "agent-browser/bin/agent-browser"', { stdio: 'pipe' }) } catch {}
  await sleep(1500)

  await openHeadedBrowser(config.baseUrl, config.viewport, config.auth)
  await sleep(1500)

  // Establish auth BEFORE recording so the session is saved in the profile and
  // inherited by record's fresh context. The human logs in; we never type creds.
  if (config.auth) {
    await ensureAuthenticated(config.auth)
  }

  if (config.setup) {
    console.log('  Running setup hook...')
    await config.setup(createBrowserContext())
  }

  // agent-browser ≥0.10 records at the ACTIVE viewport — set it right before
  // recording so the video is captured at the requested size (e.g. native 1080p),
  // not the default window size.
  if (config.viewport) {
    const vp = resolveViewport(config.viewport)
    runBrowser(`set viewport ${vp.width} ${vp.height}`)
  }

  console.log(`  Starting recording → ${rawVideoPath}`)
  // `record start` creates a FRESH context and, with no URL, full-navigates to
  // the *current* page. For client-routed SPAs the current URL after setup is a
  // virtual route (e.g. /dashboard) that the dev server resolves via its
  // catch-all fallback — loading the wrong document. Pin recording to baseUrl
  // (the real entry point) so the SPA boots correctly.
  // NOTE (≥0.27): the record context inherits VIEWPORT and COOKIES, but NOT
  // runtime localStorage — auth that relies on a localStorage token must be set
  // inside the recording (scene 1) or via a boot-time bypass, not in setup().
  runBrowser(`record start "${rawVideoPath}" "${config.baseUrl}"`, true)
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

  // Phase 4a — auto-trim the silent boot pre-roll and tail. The recording captures
  // the app booting before scene 1 and a tail after the last narration; trim to a
  // small pad around [first audio, last audio] using the measured offsets.
  if (!NO_TRIM && measuredAudioOffsetsMs.length) {
    const LEAD_MS = 600, TAIL_MS = 900
    const firstAudioMs = measuredAudioOffsetsMs[0]
    const lastIdx = measuredAudioOffsetsMs.length - 1
    const lastAudioEndMs = measuredAudioOffsetsMs[lastIdx] + Math.ceil(timings[lastIdx].audio.durationSec * 1000)
    const startMs = Math.max(0, firstAudioMs - LEAD_MS)
    const durMs = lastAudioEndMs + TAIL_MS - startMs
    if (startMs > 500) {
      const trimmed = mainNarratedPath.replace(/\.mp4$/, '-trim.mp4')
      trimVideo(mainNarratedPath, trimmed, startMs / 1000, durMs / 1000)
      rmSync(mainNarratedPath, { force: true })
      renameSync(trimmed, mainNarratedPath)
      console.log(`  ✂️  Auto-trimmed ${(startMs / 1000).toFixed(1)}s pre-roll → ${(durMs / 1000).toFixed(1)}s (use --no-trim to keep)`)
    }
  }

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
