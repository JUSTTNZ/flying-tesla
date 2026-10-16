# Flying Tesla

Standalone side-view web game. **Not part of Shopa.**

The road scrolls right to left through a night-time city. Your white Tesla auto-drives on the left. Tap **FLY** or press **Space** to hop over traffic for two seconds.

## Run

The game uses ES modules, so it must be served over HTTP (opening `index.html` directly from disk won't work):

```bash
cd /Users/user/Desktop/WORK/flying-tesla
python3 -m http.server 5173
```

Open http://localhost:5173

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Fly over traffic (2s hop, then a short cooldown) | Space | FLY button or tap |
| Change lane | ↑ / ↓ (or W / S) | ▲ ▼ buttons or swipe |
| Flip while in the air | hold ← / → (or A / D) | hold ↺ ↻ |
| Change camera (Side, Chase, Cinematic, Wide) | C | CAM button |
| Mute | M | SOUND button |
| Pick difficulty on the menu | 1 / 2 / 3 | Easy / Normal / Hard |
| Start / restart | Space or R | Start button |

## Rules

- Three lanes. Hitting a car in your lane while on the ground ends the run.
- Score grows with distance; each car you fly over gives +150.
- Flips: each full front flip or backflip gives +300, but only if you land
  close to upright. Land at a bad angle and you crash.
- Levels: every stretch of road is a new level with faster, denser traffic and
  a new sky (dusk, midnight, neon, dawn).
- Difficulty modes (Easy / Normal / Hard) change speed, cooldown and traffic
  density, and each keeps its own best score.
- Traffic is spaced so every lane is always survivable: cars are either a tight
  pack that one hop can clear, or far enough apart to land, recharge and hop
  again. Switching lanes gives you more ways out.

## Sound

All sound is synthesized with the Web Audio API: car horns (cars also honk
when you cut in or land in front of them), pass-by whooshes, the Tesla's motor
and thrusters, city rumble, crowd murmur, and people chattering and cheering
(with speech bubbles) when you fly past.

## Code layout

| File | What it does |
| --- | --- |
| `js/main.js` | Entry point: DOM, keyboard/touch input, HUD, menu, game loop |
| `js/game.js` | State and simulation: lanes, flight and flips, traffic, levels, scoring, honks |
| `js/renderer.js` | Camera modes, level sky palettes, frame drawing, HiDPI sizing |
| `js/vehicles.js` | Car shapes (Tesla, sedan, hatch, SUV, van, pickup) and drawing |
| `js/skyline.js` | Three parallax building layers, pre-rendered offscreen |
| `js/street.js` | Pavements, lanes, trees, lamps, pedestrians and speech bubbles |
| `js/audio.js` | Web Audio: ambience beds and one-shot effects |
| `js/storage.js` | Best score per mode and preferences in localStorage |
| `js/config.js` | Tuning values, difficulty modes, cameras, scene layout |
| `js/utils.js` | Math, colour and canvas helpers |
