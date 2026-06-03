import React from 'react'
import { Composition } from 'remotion'
import { IntroSeries } from './IntroSeries'
import type { IntroSeriesProps } from './types'

const FPS = 30
const WIDTH = 1920
const HEIGHT = 1080

interface Props extends IntroSeriesProps {
  /** Pre-computed audio durations (seconds) — one per scene. Computed by the orchestrator. */
  audioDurationsSec: number[]
  /** Derived from audioDurationsSec + pauseBetweenSec, filled in by calculateMetadata. */
  sceneDurationsInFrames: number[]
  [key: string]: unknown
}

const calculateMetadata = async ({ props }: { props: Props }) => {
  const { audioDurationsSec, pauseBetweenSec = 0.6 } = props

  const sceneDurationsInFrames = audioDurationsSec.map((durationSec) =>
    Math.ceil((durationSec + pauseBetweenSec) * FPS)
  )

  const totalFrames = sceneDurationsInFrames.reduce((a, b) => a + b, 0) || FPS * 3

  return {
    durationInFrames: totalFrames,
    props: { ...props, sceneDurationsInFrames },
  }
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="IntroSeries"
      component={IntroSeries as React.FC<Props>}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={FPS * 5}
      defaultProps={{
        scenes: [
          {
            id: 'placeholder',
            text: 'Hello Remotion',
            highlightWords: ['Remotion'],
            audioPath: '',
          },
        ],
        pauseBetweenSec: 0.6,
        audioDurationsSec: [3],
        sceneDurationsInFrames: [FPS * 3],
      } as Props}
      calculateMetadata={calculateMetadata}
    />
  )
}
