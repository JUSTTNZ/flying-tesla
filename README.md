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

- Space / FLY button: take off (short cooldown after landing, shown on the button)
- M: mute
- Space, R or Restart: start again after a crash

## Rules

- Hitting a car on the ground ends the run.
- Score grows with distance; each car you fly over gives +150.
- Speed and traffic density increase over time. Traffic is spaced so every
  situation is survivable: cars are either a tight pack that one hop can clear,
  or far enough apart to land, recharge and hop again.

## Code layout

| File | What it does |
| --- | --- |
| `js/main.js` | Entry point: DOM, input, HUD, overlay, game loop |
| `js/game.js` | State and simulation: flight, traffic spawning, collisions, scoring |
| `js/renderer.js` | Draws each frame; HiDPI canvas sizing |
| `js/vehicles.js` | Car shapes (Tesla, sedan, hatch, SUV, van, pickup) and drawing |
| `js/skyline.js` | Three parallax building layers, pre-rendered offscreen |
| `js/street.js` | Pavements, road, trees, lamps, pedestrians |
| `js/audio.js` | Web Audio sound effects |
| `js/storage.js` | Best score in localStorage |
| `js/config.js` | Tuning values and scene layout |
| `js/utils.js` | Math, colour and canvas helpers |
