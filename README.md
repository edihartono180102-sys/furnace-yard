# Furnace Yard — a three.js tactical FPS

[![Make the best three.js tactical FPS](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![Rank](https://make.fun/badge/threejs-fps-02/edihartono180102-sys/furnace-yard/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![Reward](https://make.fun/badge/threejs-fps-02/edihartono180102-sys/furnace-yard/reward.svg)](https://make.fun/bounty/threejs-fps-02)

A round-based tactical first-person shooter built for the
[make.fun bounty "Make the best three.js tactical FPS"](https://make.fun/bounty/threejs-fps-02):
two teams, short rounds, money between rounds, and gunfire where accuracy counts
more than speed. Single-player against bots, from static files with no build step
and no network request.

## The game

**Furnace Yard** is a compact industrial yard, 30 × 30 m, with three north–south
lanes, three cross streets, and chunky cover (containers, crates, low walls, a
gantry over the middle lane). **AMBER** (you, warm amber) spawns south;
**TEAL** (teal) spawns north. In the middle sits **THE FURNACE**, a 6 × 6 m
capture zone: hold it uncontested for 8 seconds, or eliminate the enemy team,
to win the round. First to 5 rounds takes the match.

- **Rounds:** 90 seconds, with a 20-second buy phase between rounds.
- **Economy:** start with $800; +$300 per elimination, +$600 for winning a
  round, +$300 for losing one, +$200 extra for a capture win. Cash persists
  between rounds.
- **Weapons:** P9 Sidearm ($0), VK-7 Carbine ($650, automatic), Longshot DMR
  ($1,500, high damage, slow). Plus the Spark-9 grenade ($150, one per round)
  and reserve-ammo refills ($100).
- **Gunplay:** spread grows while moving and firing and recovers when still;
  recoil, muzzle flash, tracers, sparks, hit markers, and a red flash when a
  bot is hit. Headshots deal double damage.
- **Bots:** two amber teammates (Vex, Juno) and three teal opponents (Rook,
  Mira with the DMR, Ash). They advance on the zone, hold positions,
  investigate gunfire they hear, and engage with a reaction delay and aim
  error that grows with range and target speed. They never shoot through cover.
- **HUD:** health, ammunition, cash, grenades, score, round timer, zone
  progress bar, kill feed, and a buy menu (keys 1–5, Enter to deploy).

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock the pointer) |
| Click | Fire (semi-auto weapons fire once per click) |
| R | Reload |
| G | Throw grenade |
| Ctrl / C | Crouch |
| Space | Jump |
| 1–5, Enter | Buy during the buy phase, deploy |

## Play it

Serve the `game/` folder with any static server and open `index.html` in
desktop Chrome (WebGL 2). The kit's server works:

```sh
node serve.ts
# open http://localhost:8080
```

It also opens straight from local files (`file://`), with no network request:
every import is a relative local file and three.js 0.187.0 is vendored under
`game/vendor/three/`.

## Screenshots

The four screenshots under `screenshots/` are real renders of this game's own
code, taken in desktop Chrome at 1280 × 720 with `?shot=start|play|buy|end&seed=1`:
menu, a live round (tracer and hit marker on Rook), the buy phase, and the
match-end screen.

## Layout

- `game/` — the playable game: `index.html` plus ES modules under `src/`
  (`main.js` boot and loop, `world.js` map, `player.js`, `bot.js`, `weapon.js`,
  `grenade.js`, `fx.js`, `hud.js`, `input.js`, `mover.js`, `palette.js`) and
  vendored three.js 0.187.0 under `vendor/three/`.
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes
  `/output/dossier.json` with the vendored make.fun library.
- `serve.ts` — a small static server for local play-testing.
- `shots.json` — the four screenshot framings the harness captures.
- `vendor/makefun-threejs.ts` — the kit's dossier builder, copied unchanged.
- `.makefun/owner.json` — the wallet this entry is tied to.

## License

MIT. See `LICENSE`.
