"""Generate per-sentence narration with Piper (open-source neural TTS) and a timing manifest.

Every sentence is synthesised on its own so its exact duration is known. The manifest gives each
scene a start time and each sentence an offset inside its scene, which the recorder uses to time
captions and on-screen actions. A master narration track is built from the same numbers.
"""
import json
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

HERE = Path(__file__).parent
BUILD = HERE / "build"
AUDIO = BUILD / "audio"
AUDIO.mkdir(parents=True, exist_ok=True)

SENTENCE_GAP = 0.45  # seconds of silence between sentences
SCENE_LEAD = 0.5  # visuals start this long before the first word
SCENE_TAIL = 0.7  # hold after the last word
LENGTH_SCALE = 1.08  # >1 is slower and clearer

script = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
voice = PiperVoice.load(str(HERE / "voices" / "en_US-lessac-medium.onnx"))
rate = voice.config.sample_rate
cfg = SynthesisConfig(length_scale=LENGTH_SCALE)


def synth(text: str, path: Path) -> np.ndarray:
    with wave.open(str(path), "wb") as wav:
        voice.synthesize_wav(text, wav, syn_config=cfg)
    with wave.open(str(path), "rb") as wav:
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16)


manifest = {"sampleRate": rate, "scenes": []}
timeline = []  # (absolute start seconds, samples)
cursor = 0.0
for scene in script["scenes"]:
    scene_start = cursor
    t = SCENE_LEAD
    sentences = []
    for i, sentence in enumerate(scene["sentences"]):
        samples = synth(sentence["say"], AUDIO / f"{scene['id']}_{i}.wav")
        dur = len(samples) / rate
        sentences.append({"offset": round(t, 3), "duration": round(dur, 3), "caption": sentence["caption"]})
        timeline.append((scene_start + t, samples))
        t += dur + SENTENCE_GAP
    scene_len = t - SENTENCE_GAP + SCENE_TAIL
    manifest["scenes"].append(
        {"id": scene["id"], "name": scene["name"], "start": round(scene_start, 3),
         "duration": round(scene_len, 3), "sentences": sentences}
    )
    cursor += scene_len

total = cursor
master = np.zeros(int(total * rate) + rate, dtype=np.int16)
for start, samples in timeline:
    a = int(start * rate)
    master[a : a + len(samples)] = samples
with wave.open(str(BUILD / "narration.wav"), "wb") as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(rate)
    out.writeframes(master.tobytes())

manifest["totalDuration"] = round(total, 3)
(BUILD / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
words = sum(len(s["say"].split()) for sc in script["scenes"] for s in sc["sentences"])
print(f"words={words} total={total:.1f}s ({int(total // 60)}:{int(total % 60):02d})")
for sc in manifest["scenes"]:
    print(f"  {sc['id']:4} {sc['name']:16} start={sc['start']:6.1f}s len={sc['duration']:5.1f}s")
