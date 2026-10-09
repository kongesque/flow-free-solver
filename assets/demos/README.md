# Game puzzle demos

These four GIFs record the actual solver UI in isolated Chromium sessions. Dots,
walls, bridges, and warp openings are placed through the editor; **Solve** runs
the real background worker and WebAssembly module. Placement is shown as a
time-lapse, followed by a four-second hold on the solution. Solve times shown in
the UI are measured by the app during recording.

The puzzles were manually transcribed from the following published game images,
checked on 9 October 2026. They are not generated examples. Level numbers and
sizes are visible in the source images; pack names are included only where the
source identifies them.

| Demo | Game puzzle | Source |
| --- | --- | --- |
| [Classic](./classic.gif) | Flow Free, 5×5, level 12 | [Big Duck Games gallery](https://www.bigduckgames.com/flowfree) · [Screenshot](https://images.squarespace-cdn.com/content/v1/586beec5e58c624be9f7b5a2/1483734815212-BEB0UXSN3TQGK6PQWZTB/image-asset.png) |
| [Classic with walls](./walls.gif) | Flow Free, Courtyard Pack, 7×7, level 1 | [Puzzle Game Solutions screenshot gallery](https://puzzlegamesolutions.blogspot.com/2020/06/flow-courtyard-pack-levels-1-30-7x7.html) |
| [Bridges](./bridges.gif) | Flow Free: Bridges, 5×5, level 1 | [Big Duck Games gallery](https://www.bigduckgames.com/bridges) · [Screenshot](https://images.squarespace-cdn.com/content/v1/586beec5e58c624be9f7b5a2/1483735906665-VOXZDY2LCQAMIWZI1M98/image-asset.png) |
| [Warps](./warps.gif) | Flow Free: Warps, 5×5, level 5 | [Big Duck Games gallery](https://www.bigduckgames.com/warps) · [Screenshot](https://images.squarespace-cdn.com/content/v1/586beec5e58c624be9f7b5a2/1502212905487-K600971JQS1I04S1UW2U/image-asset.png) |

Flow Free and these game puzzles belong to Big Duck Games. The GIFs show our
editor's recreation, rather than redistributed screenshots or game recordings.

## Re-record

Use Node.js 24, `npm ci`, the project's Chromium installation
(`npx playwright install chromium`), and FFmpeg on PATH. Start the app:

```sh
npm run dev -- --host 127.0.0.1 --port 4173
```

Then, in another terminal:

```sh
node scripts/record-demos.mjs
```

`DEMO_URL` can select another running instance. `DEMO_KEEP_FRAMES=1` retains
temporary screenshots for visual inspection. Recording uses a 480×900 viewport,
a shared GIF palette, and a continuous loop. The optional generator is hidden
only in the isolated recording session.

Inputs and source links live in [demo-puzzles.mjs](../../scripts/demo-puzzles.mjs).
Before publishing any GIF, the recorder independently validates complete board
coverage, preserved endpoints, connected paths, wall restrictions, bridge lanes,
and permitted warp edges. It also checks for browser errors. Existing demos are
replaced only after all four recordings succeed.
