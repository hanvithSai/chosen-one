# Demo video tooling

The submitted demo video (https://youtu.be/_bHwkebw4SA, 2:52) was generated, not hand-recorded, using only open-source tools. This folder holds the scripts. Build outputs (`build/`, `out/`), the voice model (`voices/`) and `node_modules/` are git-ignored.

## How picture, voice and captions stay in sync

1. `script.json` is the screenplay: scenes, each with sentences (the spoken text and a shorter on-screen caption).
2. `tts.py` synthesises **each sentence separately** with [Piper](https://github.com/OHF-Voice/piper1-gpl) (open-source neural TTS, voice `en_US-lessac-medium`). Because every sentence's length is known, it writes `build/manifest.json` with each scene's start and length and each sentence's offset inside its scene, and builds the master `build/narration.wav` from the same numbers.
3. `record.mjs` drives the **live site** with [Playwright](https://playwright.dev) (`playwright-core`, using the installed Edge) and records one video per scene. Highlights, clicks and scrolls happen at the manifest's sentence offsets. A full-screen magenta flash at the start of each scene marks its exact first frame.
4. `assemble.mjs` finds each flash in the recorded video, cuts every scene to its narrated length, retimes the real Chitti-to-PayPal checkout (skimming loading screens, holding on the card selection and the "Payment complete" page), burns in captions from the same manifest, and muxes the narration with ffmpeg.

Picture, captions and audio all come from one manifest, so they line up by construction.

## Rebuild it

Requirements: Node 22, Python 3.12, ffmpeg, Microsoft Edge.

```bash
cd video
npm install
pip install piper-tts
python -m piper.download_voices en_US-lessac-medium --download-dir voices
npx playwright-core install ffmpeg      # Playwright's small video encoder

node images.mjs      # 7 product screenshots (3:2) -> out/images/
python tts.py        # narration + build/manifest.json
node record.mjs      # records scenes from the live site (creates real PayPal sandbox orders)
node assemble.mjs    # -> out/chosenone-demo.mp4 and out/captions.srt
```

Notes:
- `record.mjs` and `images.mjs` read `../.env` for the sandbox buyer login and drive the **live** site (set `BASE` to record a local server instead). The PayPal scene creates a real sandbox order each run.
- Everything here is for demonstration only; no real money moves.
