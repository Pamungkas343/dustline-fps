# dustline-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Pamungkas343/dustline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Pamungkas343/dustline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

DUSTLINE: a complete 4v4 round-based tactical FPS in three.js — two bomb sites, buy phase, five original weapons, bot squads, full HUD.

## Run it

```sh
node serve.ts
```

Then open `http://localhost:8080/` in desktop Chrome and click **CLICK TO DEPLOY**.

---

<sub>Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>

## The game

A complete, original round-based tactical FPS built with three.js 0.187.0. Counter-Strike-style, never a copy: its own map, art, sounds and names.

Two teams fight over two bomb sites. Plant the charge at site A or B and defend it, or eliminate the other team. Earn credits, buy better weapons between rounds. First to 5 rounds wins (max 9).

## Controls

- **WASD** move · **Mouse** aim · **Click** fire · **R** reload
- **1–4** weapons · **G** grenade · **E** plant / defuse · **B** buy menu
- **Ctrl** crouch · **M** mute

## Features

- 4v4: you + 3 ally bots vs 4 enemy bots (layered FSM: push, hold angles, plant, defuse, investigate)
- 3 lanes, 2 bomb sites, buy phase with credits ($800 start, kill +$300, round win +$3,000)
- 5 original weapons: VK-9 SIDEARM, AR-77 VULTURE, SMG-9 JACKAL, SG-12 BREACHER, FRAG-7 grenade
- Full HUD: health, ammo, credits, round timer, score, killfeed, 2D minimap, dynamic crosshair
- Title, buy, round-end, match-end and pause screens; WebAudio synth sounds (no audio files)
- Fixed-step 60 Hz simulation, decoupled from rendering; runs offline from static files, no network

## Tech

- three.js 0.187.0, vendored byte-for-byte (`game/vendor/three/`)
- No build step, no dependencies: static ES modules + a `main.ts` (Node 22, stdlib only) that hands the game in

## Entry

Built for the [make.fun](https://make.fun/bounty/threejs-fps-02) competition "Make the best three.js tactical FPS" (threejs-fps-02).

## License

MIT. See [LICENSE](LICENSE).
