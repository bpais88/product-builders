export type ViewportPreset = 'desktop' | 'mobile-portrait' | 'tablet' | 'square'
export type Viewport = ViewportPreset | { width: number; height: number }

export interface DemoScene {
  name: string
  narration: string
  url?: string
  actions?: BrowserAction[]
  scrollDown?: number
  pauseBeforeMs?: number
  pauseAfterMs?: number
}

export interface BrowserAction {
  type: 'click' | 'fill' | 'type' | 'select' | 'scroll' | 'wait' | 'press' | 'eval'
  target?: string
  value?: string
  delayMs?: number
}

export interface BrowserContext {
  open(url: string): void
  eval(js: string): string
  snapshot(): string
  click(ref: string): void
  fill(ref: string, value: string): void
  type(ref: string, value: string): void
  press(key: string): void
  wait(msOrUrl: number | string): void
  sleep(ms: number): Promise<void>
}

export interface DemoConfig {
  name: string
  baseUrl: string
  voiceId: string
  outputDir: string
  scenes: DemoScene[]
  viewport?: Viewport
  setup?: (ctx: BrowserContext) => Promise<void>
  teardown?: (ctx: BrowserContext) => Promise<void>
  /** Optional Remotion-rendered intro prepended before the browser recording. */
  intro?: IntroConfig
}

export interface TimelineMilestone {
  day: number
  label: string
  sublabel?: string
}

export interface TimelineSpec {
  milestones: TimelineMilestone[]
  startDay?: number
  endDay?: number
  headline?: string
}

export interface IntroScene {
  /** Stable id, used as audio filename stem. */
  id: string
  /** Headline text shown on the card (TitleCard mode). Optional when `timeline` is provided. */
  text?: string
  /** Spoken narration. If empty, the scene is silent for `holdSec`. */
  narration: string
  /** Words inside `text` to animate with the highlighter marker. */
  highlightWords?: string[]
  /** Small caption above the headline (uppercase, muted). */
  caption?: string
  /** Background color hex. */
  backgroundColor?: string
  /** Text color hex. */
  textColor?: string
  /** Marker / accent color hex. */
  highlightColor?: string
  /** When narration is empty, hold the card for this many seconds. Default 3. */
  holdSec?: number
  /** If present, render a Timeline visualization instead of a TitleCard. */
  timeline?: TimelineSpec
}

export interface IntroConfig {
  scenes: IntroScene[]
  /** Additional pause after each scene's audio. Default 0.6s. */
  pauseBetweenSec?: number
  /** Font family. Defaults to Inter from Google Fonts. */
  fontFamily?: string
}

export interface AudioSegment {
  sceneName: string
  audioPath: string
  durationSec: number
}

export interface TimedAudioSegment {
  audioPath: string
  startOffsetMs: number
}
