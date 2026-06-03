---
name: demo-recorder
description: Record narrated screen demos of any web app using ElevenLabs TTS voiceover and agent-browser capture. Use when the user asks to "record a demo", "create a demo video", "make a narrated screencast", "record a product demo", "make a video walkthrough", or "generate a demo with voice". Handles the full pipeline — requirements gathering, scene drafting, browser automation, audio generation, and video stitching into an .mp4.
allowed-tools: Bash(npx:*), Bash(agent-browser:*), Bash(ffmpeg:*), Bash(ffprobe:*), Bash(which:*), Bash(pkill:*), Bash(mkdir:*), Bash(ls:*), Read, Write, Edit, Glob, Grep, AskUserQuestion
---

# Demo Recorder

Produce narrated `.mp4` screen recordings of any web app. ElevenLabs generates voiceover, `agent-browser` drives the browser and captures video, `ffmpeg` stitches them together.

## When to use

The user asks for any of:
- "record a demo of X"
- "create a narrated video / screencast of Y"
- "make a product demo / walkthrough / tutorial"
- "generate a demo with voice"

## When NOT to use

- Quick one-off screenshots — use `agent-browser` directly.
- Silent GIFs — `agent-browser record` without TTS is enough.
- Live-presentation demos where the user will narrate in real time — they don't need TTS.

## Prerequisites (verify before doing anything)

Run these checks first. If any fails, STOP and tell the user what to install.

```bash
which ffmpeg     # → needs: brew install ffmpeg
which ffprobe    # → comes with ffmpeg
which agent-browser  # → agent-browser CLI must be installed
test -d ~/.claude/skills/demo-recorder/node_modules && echo "ok" || echo "MISSING"
# If MISSING: cd ~/.claude/skills/demo-recorder && npm install
test -f ~/.claude/skills/demo-recorder/.env || echo "MISSING .env with ELEVENLABS_API_KEY"

# Only if the demo will use a Remotion animated intro:
test -d ~/.claude/skills/demo-recorder/remotion/node_modules && echo "ok" || echo "MISSING remotion deps"
# If MISSING: cd ~/.claude/skills/demo-recorder/remotion && npm install
```

## The 3-round requirements flow

**Always do this before writing scenes.** Gathering requirements up-front prevents re-records.

### Round 1 — structured, batched (AskUserQuestion)

Ask these 7 questions in a SINGLE AskUserQuestion call:

1. **Demo type / intent**
   - Product launch announcement
   - Feature release / update
   - Tutorial / onboarding
   - Bug reproduction (engineering)
   - Sales / pitch demo
   - Internal stakeholder update
   - Investor pitch

2. **Sharing channel**
   - Async link (email / Slack / Teams)
   - Live presentation (user will narrate)
   - Embed in docs / help center
   - Social (LinkedIn, YouTube, Twitter)
   - Other

3. **Target duration**
   - Short (30–60s, 3–5 scenes)
   - Medium (1–3 min, 6–10 scenes)
   - Long (3–5 min, 10+ scenes)

4. **Voice**
   - Adam (deep, professional — default)
   - Rachel (clear, warm)
   - Antoni (calm, authoritative)
   - Bella (friendly, engaging)
   - Other (ask user for voice ID)

5. **Device / viewport**
   - Desktop 1920×1080
   - Mobile portrait 390×844
   - Tablet 1024×768
   - Square 1080×1080 (social)

6. **Audience privacy**
   - Internal only (company colleagues)
   - External-private (specific client / partner)
   - Public (LinkedIn, YouTube, general web)

7. **Narration language**
   - English
   - Italian
   - Spanish
   - German
   - French
   - Portuguese
   - Other (ask for ISO code)

   The default ElevenLabs model (`eleven_flash_v2_5`) supports 32+ languages. For demanding quality, switch to `eleven_multilingual_v2` in `.env`.

### Round 2 — open-ended (AskUserQuestion, after Round 1)

1. **Audience + prior knowledge** — "Who's watching, and what do they already know about this app / domain?"
2. **Focus area** — "Which part of the app should the demo spotlight?"
3. **Key takeaway + CTA** — "What's the ONE thing you want viewers to remember? Any specific action they should take after watching?"
4. **Data safety check** — ONLY if privacy ≠ internal in Round 1:
   "Is the data currently visible in the app safe to show on this channel? If not, what needs to be swapped or redacted before we record?"

### Round 3 — draft & approve

1. Draft a scene outline as a markdown table:

   | # | Scene name | URL / action | Narration (draft) | Est. duration |
   |---|---|---|---|---|

2. Show it to the user and ASK: "Here's the draft flow. Approve, or tell me what to change?"
3. Iterate until approved. Keep narration crisp — ElevenLabs reads ~2.5 words/sec.

## Writing the scene file

After approval, write `demos/<demo-name>.ts` in the user's current project (create `demos/` if absent). No type import is required — the shape is validated at runtime by the orchestrator.

Template:

```ts
const config = {
  name: '<demo-name>',
  baseUrl: '<base-url>',
  voiceId: '<voice-id>',
  outputDir: 'demos/output',
  viewport: 'desktop', // or 'mobile-portrait' | 'tablet' | 'square' | { width, height }

  // Project-specific pre-recording setup (auth, data seeding, etc.).
  // Runs after browser opens, before `record start`.
  setup: async (ctx) => {
    // See "Auth recipes" below
  },

  scenes: [
    {
      name: 'intro',
      narration: '...',
      url: '/dashboard',
      pauseBeforeMs: 500,
      pauseAfterMs: 1000,
    },
    // ...
  ],
}

export default config
```

If the user wants types in their editor, they can add:

```ts
/** @type {import('/Users/<you>/.claude/skills/demo-recorder/scripts/types').DemoConfig} */
```

…but it's optional — the runtime shape is all that matters.

## Running

```bash
npx tsx ~/.claude/skills/demo-recorder/scripts/record-demo.ts demos/<demo-name>.ts
```

Run this from the project root. Output: `<outputDir>/<demo-name>-narrated.mp4`.

After running, offer to play the result or share the file path.

## Scene config reference

| Field | Type | Purpose |
|---|---|---|
| `name` | `string` | Scene identifier + audio filename |
| `narration` | `string` | Text ElevenLabs will speak |
| `url` | `string?` | If set, navigate here before the scene |
| `actions` | `BrowserAction[]?` | Sequence of click / fill / scroll / wait |
| `scrollDown` | `number?` | Pixels to scroll after navigation |
| `pauseBeforeMs` | `number?` | Pause before narration starts |
| `pauseAfterMs` | `number?` | Pause after narration ends (default 500 ms) |

`BrowserAction` types: `click`, `fill`, `type`, `select`, `scroll`, `wait`, `press`, `eval`.

`target` can be `@refN` (from a prior `snapshot`) or a text label (routed through `find text "..." click`).

## Remotion animated intros

For polished product-launch or investor-pitch demos, prepend a Remotion-rendered opening sequence before the browser walkthrough. The skill ships a `TitleCard` composition that supports headline fade-in and highlighter-marker animation on chosen words.

### When to use
- Product-launch demos
- Investor pitches
- Anything needing a strong hook before the product walkthrough

### When NOT to use
- Bug reproductions, internal updates, tutorials — static start is fine
- Short (<60s) demos — overhead not worth it

### Shape in DemoConfig

```ts
const config = {
  // ...all the other DemoConfig fields (name, baseUrl, scenes, etc.)
  intro: {
    pauseBetweenSec: 0.6,
    scenes: [
      {
        id: 'hook',
        text: 'Before Gestione Tariffario 2.0...',
        narration: 'Before Gestione Tariffario 2.0, pricing a new service meant three things.',
        highlightWords: ['Gestione Tariffario 2.0'],
        backgroundColor: '#ffffff',
        textColor: '#0a0a0a',
        highlightColor: '#A7C7E7',
      },
      {
        id: 'problem',
        text: 'Excel, email, guesswork.',
        narration: 'An Excel file, an email chain, and a lot of tribal knowledge.',
        highlightWords: ['Excel', 'email', 'guesswork'],
      },
      // ...
    ],
  },
}
```

### Intro scene fields

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Audio filename stem |
| `text` | `string` | Headline shown on the card |
| `narration` | `string` | Voiceover text (TTS via ElevenLabs, same voice as the main demo). Empty string = silent scene held for `holdSec`. |
| `highlightWords` | `string[]?` | Words in `text` to animate with the marker effect |
| `caption` | `string?` | Small uppercase caption above the headline |
| `backgroundColor` | `string?` | Hex — default white |
| `textColor` | `string?` | Hex — default near-black |
| `highlightColor` | `string?` | Hex — default soft blue |
| `holdSec` | `number?` | For silent scenes, how long to display (default 3s) |

### Pipeline

When `intro` is present, the orchestrator:

1. Generates ElevenLabs TTS for each intro scene → `~/.claude/skills/demo-recorder/remotion/public/voiceover/<demo-name>/<scene-id>.mp3`
2. Writes a props JSON and runs `npx remotion render IntroSeries intro.mp4 --props=<json>` inside the `remotion/` dir.
3. Remotion uses `calculateMetadata` to size the composition from the audio durations.
4. Runs the regular browser recording + stitch to produce the main mp4.
5. Concatenates `intro.mp4 + main.mp4 → final.mp4` via ffmpeg filter_complex concat.

### Authoring tips

- Keep headlines **5-10 words**. Anything longer wraps and fights with the fade-in.
- Use **highlightWords** for 1-3 key terms per scene. More than 3 is visual noise.
- Narration can be shorter than the headline's reading time — the card holds until the audio finishes.
- For silent title cards (no narration), set `narration: ''` and provide `holdSec` (default 3s).

## Auth recipes (for `setup`)

Pick the one that matches your app. These are examples, not special cases — `setup` is just a function with a `BrowserContext`.

### A. localStorage token injection

```ts
setup: async ({ open, eval: exec, sleep }) => {
  open('http://localhost:5173/app')
  exec(`localStorage.setItem('auth_token', 'demo-token')`)
  exec(`localStorage.setItem('auth_user', JSON.stringify({id:'x', role:'admin'}))`)
  await sleep(300)
}
```

### B. Form login

```ts
setup: async ({ open, snapshot, click, type, sleep }) => {
  open('https://app.example.com/login')
  const s = snapshot()
  const email = s.match(/textbox.*Email.*\[ref=(\w+)\]/i)![1]
  const pw = s.match(/textbox.*Password.*\[ref=(\w+)\]/i)![1]
  const submit = s.match(/button.*Sign in.*\[ref=(\w+)\]/i)![1]
  click(`@${email}`); type(`@${email}`, 'demo@x.com')
  click(`@${pw}`);    type(`@${pw}`, 'secret')
  click(`@${submit}`)
  await sleep(2000)
}
```

### C. Cookie auth

```ts
setup: async ({ open, eval: exec }) => {
  open('https://app.example.com')
  exec(`document.cookie = 'session=abc; path=/; domain=.example.com'`)
  open('https://app.example.com/dashboard')
}
```

## Voices

| Voice | ID | Style |
|---|---|---|
| Adam | `pNInz6obpgDQGcFmaJgB` | Deep, professional (default) |
| Rachel | `21m00Tcm4TlvDq8ikWAM` | Clear, warm |
| Antoni | `ErXwobaYiN019PkySvjV` | Calm, authoritative |
| Bella | `EXAVITQu4vr4xnSDxMaL` | Friendly, engaging |

Browse more: https://elevenlabs.io/voice-library

## Languages

Narration can be written in any language supported by the chosen ElevenLabs model. The default (`eleven_flash_v2_5`) covers 32+ languages including English, Italian, Spanish, German, French, Portuguese, Dutch, Polish, Arabic, Chinese, Japanese, Korean, Hindi. Just write the narration in the target language — no config flag needed. Most voice IDs (Adam, Rachel, etc.) work across all languages; quality varies per voice/language combo.

For the highest quality on non-English, set `ELEVENLABS_MODEL_ID=eleven_multilingual_v2` in `.env`.

## Privacy-driven adjustments

If the user picked **Public** or **External-private** in Round 1:
- Before writing scenes, confirm no real user names, emails, company names, or production URLs will be visible.
- Prefer demo-seeded data (dummy suppliers, fake routes).
- Redact any address-bar URLs that leak environment (use `open` on a clean path).
- If the app shows a navbar with "Hi, <Real Name>" — make sure the setup injects a demo user.

If **Internal**, skip these steps.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ELEVENLABS_API_KEY is not set` | Add to `~/.claude/skills/demo-recorder/.env` or shell env |
| `ffprobe: command not found` | `brew install ffmpeg` |
| `agent-browser: command not found` | Install agent-browser CLI |
| Recording not found | Check headed browser opens; check agent-browser logs |
| Audio out of sync | Adjust `pauseBeforeMs` / `pauseAfterMs` per scene |
| Narration sounds flat / robotic | Switch to `eleven_multilingual_v2` model; or pick a different voice |
| Viewport wrong / cut off | Viewport is set at browser open; if the flag isn't honoured, the skill falls back to `window.resizeTo` (best-effort). A hard-locked viewport requires a future agent-browser upgrade. |
| Ghost browser windows after crash | `pkill -f "Google Chrome for Testing"` — the orchestrator does this on next run |
