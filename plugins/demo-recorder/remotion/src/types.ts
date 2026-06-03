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

export interface IntroSceneProps {
  /** Stable id — also used as the audio filename stem. */
  id: string
  /** Full headline text to display (TitleCard mode). */
  text?: string
  /** Optional words/phrases inside `text` to highlight with the marker effect. */
  highlightWords?: string[]
  /** Optional small caption shown above or below the headline. */
  caption?: string
  /** Path to the voiceover mp3 (relative to remotion/public/). Empty string = no audio. */
  audioPath: string
  /** Background color hex. Defaults to white. */
  backgroundColor?: string
  /** Text color hex. Defaults to near-black. */
  textColor?: string
  /** Highlight marker / accent color. Defaults to a soft blue. */
  highlightColor?: string
  /** If present, render the TimelineCard variant instead of TitleCard. */
  timeline?: TimelineSpec
}

export interface IntroSeriesProps {
  scenes: IntroSceneProps[]
  /** Additional pause after each scene's audio finishes, in seconds. Default 0.6s. */
  pauseBetweenSec?: number
  /** Global font family. Defaults to 'Inter' via @remotion/google-fonts. */
  fontFamily?: string
}
