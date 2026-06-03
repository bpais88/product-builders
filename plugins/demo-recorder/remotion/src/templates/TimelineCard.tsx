import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import type { IntroSceneProps } from '../types'

const DEFAULT_BG = '#ffffff'
const DEFAULT_TEXT = '#0a0a0a'
const DEFAULT_ACCENT = '#2563eb'
const TRACK_COLOR = '#e5e7eb'

export interface TimelineMilestone {
  day: number
  label: string
  sublabel?: string
}

export interface TimelineSpec {
  milestones: TimelineMilestone[]
  startDay?: number
  endDay?: number
  /** Optional big headline above the timeline. */
  headline?: string
}

const Dot: React.FC<{
  active: boolean
  accent: string
  delay: number
}> = ({ active, accent, delay }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ fps, frame, config: { damping: 10 }, delay, durationInFrames: 20 })
  const scale = Math.max(0, Math.min(1, pop))
  return (
    <span
      style={{
        display: 'inline-block',
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: active ? accent : TRACK_COLOR,
        border: `4px solid ${active ? accent : TRACK_COLOR}`,
        transform: `scale(${scale})`,
        boxShadow: active ? `0 0 0 6px ${accent}22` : 'none',
        transition: 'background 0.3s',
      }}
    />
  )
}

export const TimelineCard: React.FC<IntroSceneProps> = (props) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const timeline = props.timeline
  if (!timeline) return null

  const backgroundColor = props.backgroundColor ?? DEFAULT_BG
  const textColor = props.textColor ?? DEFAULT_TEXT
  const accent = props.highlightColor ?? DEFAULT_ACCENT

  const startDay = timeline.startDay ?? 0
  const endDay = timeline.endDay ?? Math.max(...timeline.milestones.map((m) => m.day))
  const range = endDay - startDay || 1

  // Timing windows (in frames)
  const headerIn = Math.round(fps * 0.3)
  const lineIn = Math.round(fps * 0.7)
  const lineInDur = Math.round(fps * 0.6)
  const dotsStart = lineIn + lineInDur
  const dotStagger = Math.round(fps * 0.25)
  const progressStart = dotsStart + dotStagger * timeline.milestones.length
  const progressDur = Math.max(30, durationInFrames - progressStart - Math.round(fps * 0.5))

  // Caption + headline opacity
  const captionOpacity = interpolate(frame, [headerIn, headerIn + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const headlineOpacity = interpolate(frame, [headerIn + 4, headerIn + 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Line draws from center outward
  const lineScale = interpolate(frame, [lineIn, lineIn + lineInDur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Active progress
  const progress = interpolate(frame, [progressStart, progressStart + progressDur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const activeDay = startDay + range * progress

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 120px',
        flexDirection: 'column',
        color: textColor,
      }}
    >
      {props.caption && (
        <div
          style={{
            opacity: captionOpacity,
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: textColor,
            marginBottom: 28,
            opacity: captionOpacity * 0.7,
          }}
        >
          {props.caption}
        </div>
      )}

      {timeline.headline && (
        <div
          style={{
            opacity: headlineOpacity,
            fontSize: 72,
            fontWeight: 700,
            marginBottom: 80,
            textAlign: 'center',
          }}
        >
          {timeline.headline}
        </div>
      )}

      <div
        style={{
          position: 'relative',
          width: '70%',
          height: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Background track */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 6,
            background: TRACK_COLOR,
            borderRadius: 3,
            transform: `translateY(-50%) scaleX(${lineScale})`,
            transformOrigin: 'left center',
          }}
        />
        {/* Active overlay */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            height: 6,
            width: `${progress * 100}%`,
            background: accent,
            borderRadius: 3,
            transform: 'translateY(-50%)',
            opacity: lineScale,
          }}
        />
        {/* Milestone dots + labels */}
        {timeline.milestones.map((m, i) => {
          const left = ((m.day - startDay) / range) * 100
          const isActive = m.day <= activeDay + 0.01
          const dotDelay = dotsStart + i * dotStagger
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <Dot active={isActive} accent={accent} delay={dotDelay} />
              <div
                style={{
                  position: 'absolute',
                  top: 36,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  opacity: interpolate(frame, [dotDelay, dotDelay + 14], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 30, fontWeight: 700, color: isActive ? accent : textColor }}>
                  {m.label}
                </div>
                {m.sublabel && (
                  <div style={{ fontSize: 20, fontWeight: 500, color: '#6b7280', marginTop: 6 }}>
                    {m.sublabel}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
