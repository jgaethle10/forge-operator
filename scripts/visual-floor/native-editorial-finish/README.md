# Evercraft Cinema | Native Editorial Finishing Prototype

An original owned motion-graphics finishing pass on top of **real verified native World Engine footage**. It is a prototype, *not* a fabricated WebGPU render or a ready-to-publish advertisement.

This tool adds accessible storytelling and graphics coherence across three distinct beats: **Discover → Connect → Understand**. It places motion typography, source truth labels, a time-coded progress sequence and restrained editorial framing over the original encoded footage.

## Run

```bash
python -m pip install opencv-python-headless Pillow numpy
python finish_native.py --video /path/to/your/native-gpu.mp4 --out /tmp/film.mp4 --receipt /tmp/film-receipt.json
python -m unittest discover -v
```

The current proof accepts a 4-second, 24 FPS, 96-frame World Engine native canary and outputs a 1280 × 720 silent H.264 preview. **Its source is resampled from 640 × 360**, so the output is not *native 720p GPU* and does not upgrade the source geometric detail. It does not require Base44, network access, commercial asset licenses, or generated third-party imagery.

## Where to take the engine next

Move to original 1920 × 1080 native WebGPU footage, improve authentic optical and material response, migrate captioning to a vector/text renderer at true target resolution, and bring editorial timecodes through Fallen/Visual Desk to Clip only after owner-verified creative/master gates. Human scoring is mandatory. No sound, payment, publishing or customer claims are authorized.