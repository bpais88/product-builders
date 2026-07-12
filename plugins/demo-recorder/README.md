# demo-recorder

Produce narrated `.mp4` screen recordings of any web app. ElevenLabs generates the voiceover, `agent-browser` drives the browser and captures video, `ffmpeg` stitches them together. Optional Remotion animated intros.

## Install

```bash
claude plugin marketplace add https://github.com/bpais88/product-builders
claude plugin install demo-recorder@product-builders
```

## Prerequisites

Two things must be on your `$PATH` before the skill will run: **ffmpeg** (`brew install ffmpeg`, which also brings `ffprobe`) and the **agent-browser** CLI, version `0.27.0` or newer — older versions cap recording at 720p.

Everything else bootstraps itself. The skill runs `scripts/setup.sh` on invocation: it installs the Node dependencies into the plugin directory and creates an `.env` in the plugin's **data directory**, then asks you for your ElevenLabs API key. The key lives outside the plugin directory on purpose — plugin dirs are replaced wholesale on update, the data dir survives, and the key never enters git.

Remotion (for optional animated intros) is ~500 MB and is installed lazily, only if a demo actually uses one:

```bash
cd "$(claude plugin path demo-recorder@product-builders)/remotion" && npm install
```

## Use

Just ask Claude: **"record a demo of X"** — the skill runs a short 3-round questionnaire (intent, channel, duration, voice, viewport, privacy, language → audience and focus → draft scene table for approval), writes a scene file to `demos/<name>.ts` in your current project, and renders it.

Manual invocation, from any project directory:

```bash
PLUGIN="$(claude plugin path demo-recorder@product-builders)"
bash "$PLUGIN/scripts/setup.sh"                             # first run only
bash "$PLUGIN/scripts/run.sh" demos/<demo-name>.ts --dry-run  # validate: screenshots, no audio
bash "$PLUGIN/scripts/run.sh" demos/<demo-name>.ts            # record for real
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
