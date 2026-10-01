# RallyBeat

A phone app that listens to a ping pong rally and logs real playing time, rally
length and rhythm steadiness. Built for older adults and people with Parkinson's.
One tap to start. No account, no calibration, no camera, no wearable. Audio is
analyzed in the browser and never stored or sent anywhere.

This file is the standard every change is held to. If a diff breaks a rule
here, it does not ship.

## Before writing code

- This repo runs Next.js 16 / React 19. APIs differ from older training data.
  Read the relevant guide in `node_modules/next/dist/docs/` before using any
  Next API. Check the installed package's types or docs before calling any
  library function. Never guess a method name.
- Use the versions in `package.json`. No deprecated patterns (`pages/`,
  `getServerSideProps`, `next/head`, legacy `<Image layout>`).

## Layout

| Path | Owns |
|---|---|
| `lib/engine/` | Audio analysis. Pure TypeScript, no DOM, no React. Every module unit-tested. |
| `lib/store/` | IndexedDB session storage. |
| `components/` | UI pieces, one component per file. |
| `app/` | Routes only: compose components, no analysis logic. |
| `app/tokens.css` | Every color, size and radius. Exported from the approved Figma file. |
| `styles/motion.css` | Every animation. Nothing animates from anywhere else. |
| `scripts/` | `verify`, `train`, `make-fixtures`. |
| `tests/unit`, `tests/e2e`, `tests/a11y` | Vitest, Playwright, axe. |

A file over ~250 lines is a sign it owns two things. Split it.

## Visual rules

Banned. Each one is grounds to reject a diff:

- Purple/blue/neon gradients, gradient buttons, gradient text, background blobs.
- Glow shadows (`box-shadow: 0 0 Npx` in a color). Glassmorphism, backdrop blur panels.
- Inter, Plus Jakarta Sans, Geist, or any font other than Atkinson Hyperlegible Next.
- Three-column icon-plus-paragraph feature grids. Bento layouts.
- Floating dashboard mockups, grid-pattern or dotted hero backgrounds.
- Emoji anywhere in the UI, and icons sitting inside rounded tinted boxes.
- Stock photos, AI images, decorative illustrations.

Required:

- **Color means something.** The chrome is neutral warm grey. Ball orange appears
  only on live rally data (the beat strip, the current rally). Green appears only
  for "steady". If a color is not encoding data or state, it is a neutral.
- Tokens live in `app/tokens.css` with the contrast ratio noted next to each text
  color. Body text ≥ 7:1, secondary text ≥ 4.5:1, on every surface it sits on.
- 4 px spacing scale. No arbitrary values (`mt-[13px]`).
- Atkinson Hyperlegible Next for everything. Data in tabular figures
  (`font-variant-numeric: tabular-nums`). Big stats 72–96 px.
- Icons are inline SVG drawn on a 24 px grid, 1.75 px stroke, round caps.
- Tap targets ≥ 48 px. Layout survives 200% text. Dark mode is designed, not inverted.
- Motion comes from `styles/motion.css` only, and every animation has a
  `prefers-reduced-motion` fallback.
- The signature element is the **beat strip**: a row of dots, one per hit. It is
  the logo, the loader and the summary hero. Do not add competing decoration.

## Code rules

- Comments explain *why*, never *what*. `// raise threshold in loud rooms so
  crowd noise does not read as hits` is good. `// increment count` is deleted.
- Handle real failures only: microphone denied, AudioWorklet unsupported, storage
  full or blocked, speech synthesis missing. No try/catch around code that cannot
  throw, no validation of values the type system already guarantees.
- Engine functions are pure where possible: arrays in, results out. Constants
  are named and live at the top of the module with the reason for the value.
- Every number on screen comes from the engine. Demo data is labeled "Demo".
- No dependency gets added without a reason written in the commit message.

## Copy rules

Write like a good physical therapist talks: warm, direct, short.

- Second person, active voice. "You played 24 minutes." not "24 minutes of play
  were recorded."
- 6th–8th grade reading level. "Rhythm", never "inter-onset interval variability".
- Banned words: furthermore, moreover, delve, testament, tapestry, seamless,
  elevate, unlock, empower, journey, revolutionize.
- No hype openers ("In today's world…"). Start with the point.
- No lists where every item is the same length and starts with a bold phrase.
- Never claim to diagnose, treat or prevent anything. RallyBeat is an exercise log.
- Use real typography: en dash for ranges (5–10), minus sign (−), curly quotes.

## Checks before every push

```bash
npm run typecheck && npm run lint && npm run test && npm run verify && npm run build
npm run test:e2e        # Playwright e2e (fake mic) + axe a11y
```

Then screenshot every changed screen at 390×844 in light, dark and 200% text,
compare against the Figma frame, and fix any drift.
