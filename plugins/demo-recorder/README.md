# demo-recorder

Produce narrated `.mp4` screen recordings of any web app. ElevenLabs generates the voiceover, `agent-browser` drives the browser and captures video, `ffmpeg` stitches them together. Optional Remotion animated intros.

## Install

```bash
claude plugin marketplace add https://github.com/bpais88/product-builders
claude plugin install demo-recorder@product-builders
```

## Prerequisites

After install, in the plugin's install directory:

```bash
# 1. ffmpeg + ffprobe
brew install ffmpeg

# 2. Node deps (run in the installed plugin path)
cd "$(claude plugin path demo-recorder@product-builders)"
npm install
( cd remotion && npm install )    # only if you plan to use animated intros

# 3. ElevenLabs key
cp .env.example .env
# then edit .env to set ELEVENLABS_API_KEY
```

`agent-browser` CLI must also be installed and on your `$PATH`.

> **Heads-up — pre-1.0 caveat.** This release (`0.1.0`) still hardcodes a couple of `~/.claude/skills/demo-recorder/...` paths inside `SKILL.md` from when the skill lived as a standalone, local skill rather than a marketplace plugin. They are flagged for replacement with `${CLAUDE_PLUGIN_ROOT}` in a follow-up. If the harness drops you into the wrong directory, run the `npx tsx` command from the plugin install path printed by `claude plugin path demo-recorder@product-builders`.

## Use

Just ask Claude: **"record a demo of X"** — the skill runs a short 3-round questionnaire (intent, channel, duration, voice, viewport, privacy, language → audience and focus → draft scene table for approval), writes a scene file to `demos/<name>.ts` in your current project, and renders it.

Manual invocation:

```bash
npx tsx scripts/record-demo.ts demos/<demo-name>.ts
```

Output: `<outputDir>/<demo-name>-narrated.mp4` (H.264 + AAC).

## What's inside

| Path | Purpose |
|---|---|
| `skills/demo-recorder/SKILL.md` | The skill prompt (Claude reads this when the skill is invoked) |
| `scripts/record-demo.ts` | Orchestrator — questionnaire flow, TTS, agent-browser capture, ffmpeg stitch |
| `scripts/lib/elevenlabs-tts.ts` | ElevenLabs voice generation |
| `scripts/lib/audio-video-stitch.ts` | ffmpeg concat / mux |
| `scripts/lib/remotion-intro.ts` | Renders the optional Remotion intro and concatenates with the main capture |
| `remotion/` | Remotion sub-project for animated title cards (`TitleCard`, `TimelineCard`) |

## Voices, languages, scenes

See `skills/demo-recorder/SKILL.md` for the full reference — scene config shape, voice ID table, language support, auth recipes (localStorage / form / cookie), Remotion intro authoring, and troubleshooting.

## License

MIT
