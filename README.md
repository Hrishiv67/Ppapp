# RallyBeat

A phone app that listens to a ping pong game and logs real playing time,
rally length and how steady your rhythm stayed. Built for older adults and
people with Parkinson's, for whom table tennis is a popular way to train
balance and reaction time.

Tap **Start playing**, set the phone on the table, play. No account, no
calibration, no camera, no wearable. Sound is analyzed on the phone and thrown
away; nothing is recorded or sent anywhere.

## What it measures

- **Active minutes:** time actually spent in rallies, toward the 150 minutes a
  week the Parkinson's Foundation and ACSM recommend.
- **Longest rally** and rally count.
- **Rhythm:** how even the time between hits was (100 = perfectly even).
- **Steady window:** how many minutes of play your rhythm held before it got
  choppier, and a gentle rest suggestion when it does.

RallyBeat is an exercise log. It does not diagnose, treat or prevent anything.

## How it works

`lib/engine/` is a pure TypeScript audio pipeline (no ML training required):

1. **Onsets:** spectral flux in the 2–10 kHz band where ball clicks live,
   against a running median + MAD threshold that learns the room by itself.
2. **Impact gate:** decay time, flatness and harmonicity separate ball impacts
   from talk, music and claps.
3. **Paddle vs. table:** per-session k-means on each impact's sound.
4. **Rally decoding:** Viterbi over the hit → bounce rhythm repairs missed
   hits and drops sounds from a neighboring table.
5. **Metrics:** rallies, active time, rhythm per 5 minutes, steady window.

The app streams the microphone through an AudioWorklet
(`public/worklets/capture.js`) into `RallySession`.

## Results so far: synthetic audio only

`npm run verify` replays a fixed benchmark of synthetic sessions and prints
`MATCH` when the numbers below still hold.

| Scenario | Precision | Recall | F1 |
|---|---|---|---|
| Quiet room | 1.000 | 0.998 | 0.999 |
| People talking | 0.994 | 0.913 | 0.952 |
| Music | 0.984 | 0.896 | 0.938 |
| Neighbor table | 0.996 | 0.988 | 0.992 |
| Everything at once | 0.955 | 0.874 | 0.913 |

These come from a synthesizer we wrote, so they prove the logic, not real-room
accuracy. Validation on real recorded sessions (hits hand-labeled from video)
is the next step; `npm run train` refits the impact gate from labeled WAVs.

## Run it

```bash
npm install
npm run dev            # http://localhost:3300
npm run test           # engine unit tests
npm run verify         # benchmark, must print MATCH
npm run fixtures     # writes the WAVs the fake-mic test plays
npm run build && npm run test:e2e   # Playwright: fake-mic e2e + axe a11y
```

`/demo` plays a synthetic rally through the real engine, out loud, so you can
see it work without a table. `/?demo=1` shows a sample week whose numbers are
real engine output from synthetic sessions (`scripts/make-demo-seed.ts`).

## Design

Set in Instrument Sans. Color only encodes data: orange is the ball, green
means steady, everything else is neutral. Motion comes from the PingPod app's
language. Rules for every change are in `CLAUDE.md`.
