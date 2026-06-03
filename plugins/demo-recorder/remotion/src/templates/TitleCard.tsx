import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import type { IntroSceneProps } from '../types'

const DEFAULT_BG = '#ffffff'
const DEFAULT_TEXT = '#0a0a0a'
const DEFAULT_HIGHLIGHT = '#A7C7E7'

const HighlightedSpan: React.FC<{
  word: string
  color: string
  delay: number
}> = ({ word, color, delay }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const progress = spring({ fps, frame, config: { damping: 200 }, delay, durationInFrames: 18 })
  const scaleX = Math.max(0, Math.min(1, progress))

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '52%',
          height: '1.05em',
          transform: `translateY(-50%) scaleX(${scaleX})`,
          transformOrigin: 'left center',
          backgroundColor: color,
          borderRadius: '0.18em',
          zIndex: 0,
        }}
      />
      <span style={{ position: 'relative', zIndex: 1 }}>{word}</span>
    </span>
  )
}

function splitIntoSegments(text: string, highlights: string[]): Array<{ text: string; highlight: boolean }> {
  if (!highlights.length) return [{ text, highlight: false }]

  const escaped = highlights.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  // Use word boundaries so a highlight "AI" doesn't match inside "available".
  const pattern = `\\b(${escaped.join('|')})\\b`
  const re = new RegExp(pattern, 'gi')
  const parts = text.split(re).filter((p) => p.length > 0)

  const lcHighlights = highlights.map((h) => h.toLowerCase())
  return parts.map((part) => ({
    text: part,
    highlight: lcHighlights.includes(part.toLowerCase()),
  }))
}

export const TitleCard: React.FC<IntroSceneProps> = ({
  text,
  highlightWords = [],
  caption,
  backgroundColor = DEFAULT_BG,
  textColor = DEFAULT_TEXT,
  highlightColor = DEFAULT_HIGHLIGHT,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const headlineOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const captionOpacity = interpolate(frame, [8, 20], [0, 0.7], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const segments = splitIntoSegments(text, highlightWords)

  // Pre-compute highlight delays so we don't mutate during render.
  const BASE_HIGHLIGHT_DELAY = Math.round(fps * 0.7)
  let seen = 0
  const delays = segments.map((seg) => {
    if (!seg.highlight) return null
    const d = BASE_HIGHLIGHT_DELAY + seen * 10
    seen += 1
    return d
  })

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: '0 120px',
      }}
    >
      {caption && (
        <div
          style={{
            opacity: captionOpacity,
            color: textColor,
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: 36,
          }}
        >
          {caption}
        </div>
      )}

      <div
        style={{
          opacity: headlineOpacity,
          color: textColor,
          fontSize: 92,
          fontWeight: 700,
          lineHeight: 1.15,
          textAlign: 'center',
          maxWidth: 1400,
        }}
      >
        {segments.map((seg, i) =>
          seg.highlight ? (
            <HighlightedSpan key={i} word={seg.text} color={highlightColor} delay={delays[i]!} />
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </div>
    </AbsoluteFill>
  )
}
