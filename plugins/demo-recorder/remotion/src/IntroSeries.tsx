import React from 'react'
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion'
import { loadFont } from '@remotion/google-fonts/Inter'
import { TitleCard } from './templates/TitleCard'
import { TimelineCard } from './templates/TimelineCard'
import type { IntroSeriesProps, IntroSceneProps } from './types'

const { fontFamily: interFontFamily } = loadFont()

interface SceneWithFrames extends IntroSceneProps {
  durationInFrames: number
}

export const IntroSeries: React.FC<
  IntroSeriesProps & { sceneDurationsInFrames: number[] }
> = ({ scenes, sceneDurationsInFrames, fontFamily }) => {
  const { fps } = useVideoConfig()

  const scenesWithFrames: SceneWithFrames[] = scenes.map((s, i) => ({
    ...s,
    durationInFrames: sceneDurationsInFrames[i] ?? fps * 3,
  }))

  let from = 0
  return (
    <AbsoluteFill style={{ fontFamily: fontFamily ?? interFontFamily }}>
      {scenesWithFrames.map((scene, i) => {
        const start = from
        from += scene.durationInFrames
        return (
          <Sequence
            key={scene.id}
            from={start}
            durationInFrames={scene.durationInFrames}
            layout="none"
          >
            {scene.timeline ? <TimelineCard {...scene} /> : <TitleCard {...scene} />}
            {scene.audioPath && <Audio src={staticFile(scene.audioPath)} />}
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
