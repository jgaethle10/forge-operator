#!/usr/bin/env python3
"""Bella V05 factorial performance study: punctuation and native speed isolated.

Four fixed-seed native af_bella readings per context; no style prompt pretending
to control an unsupported model parameter. Does NOT prove perceptual improvement.
"""
import hashlib
import html
import importlib.util
import json
import pathlib
import sys

SELF = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bella_actor_lab", SELF / "voice-bella-actor-lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

CONTEXTS = {
    "brand": {
        "plain": lab.CANONICAL,
        "connected": lab.TAKES["clear_confident"]["text"],
    },
    "story": {
        "plain": (
            "It starts with a question. What if the system could see the problem "
            "before anyone needed to ask? Not to replace human judgment. "
            "To give it room to work. One decision reaches the next. "
            "Every hand knows its part. And the whole story becomes easier to follow."
        ),
        "connected": (
            "It starts with a question: what if the system could see the problem "
            "before anyone needed to ask? Not to replace human judgment, "
            "to give it room to work. One decision reaches the next; "
            "every hand knows its part, and the whole story becomes easier to follow."
        ),
    },
}
FACTORIAL = {
    "plain_100": ("plain", 1.00),
    "plain_099": ("plain", 0.99),
    "connected_100": ("connected", 1.00),
    "connected_099": ("connected", 0.99),
}
# Reveal the factorial cells in evidence.json only AFTER listening and scoring.
REVIEW_ORDER = ("connected_099", "plain_100", "connected_100", "plain_099")
SEEDS = {"brand": 1701, "story": 1702}
CATEGORIES = (
    "human_rhythm",
    "emotional_credibility",
    "meaningful_emphasis",
    "sentence_endings",
    "pronunciation",
    "same_bella_identity",
)


def verify():
    assert len(CONTEXTS) == 2 and len(FACTORIAL) == 4
    assert set(REVIEW_ORDER) == set(FACTORIAL)
    assert len(REVIEW_ORDER) == len(set(REVIEW_ORDER))
    for label, texts in CONTEXTS.items():
        assert set(texts) == {"plain", "connected"}
        assert lab.words(texts["plain"]) == lab.words(texts["connected"]), label
        assert 40 <= len(lab.words(texts["plain"])) <= 75
        assert texts["plain"] != texts["connected"]
        for s in texts.values():
            assert "—" not in s and "–" not in s
    for key, (punctuation, speed) in FACTORIAL.items():
        assert punctuation in ("plain", "connected") and speed in (0.99, 1.0)
    assert [k for k in FACTORIAL if FACTORIAL[k][1] == 1.0] == ["plain_100", "connected_100"]
    print("PASS: 2 contexts × 2 punctuation patterns × 2 native speeds; words unchanged")


def room_html(context):
    text = html.escape(CONTEXTS[context]["plain"])
    panels = []
    for take in range(1, 5):
        inputs = "".join(
            '<label>' + html.escape(c.replace("_", " ")) +
            ' <input type="number" min="1" max="5" step="1" data-axis="' + c +
            '" placeholder="1–5" inputmode="numeric"></label>'
            for c in CATEGORIES
        )
        panels.append(
            '<section class="take" data-take="' + str(take) + '">'
            '<h2>Take ' + str(take) + '</h2>'
            '<audio controls preload="none" src="take-' + f"{take:02d}" + '.wav"></audio>'
            '<div class="scores">' + inputs + '</div>'
            '<label>Timecoded notes<textarea rows="2" placeholder="At 0:12, stress on..."></textarea></label>'
            '</section>'
        )
    return """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bella factorial blind listening | """ + html.escape(context) + """</title>
<style>body{font:16px/1.5 system-ui;color:#f1eee9;background:#171820;
max-width:820px;margin:2rem auto;padding:0 1rem}
section{padding:1rem;border:1px solid #676979;border-radius:12px;margin:1rem 0}
audio{width:100%}.scores{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
label{display:block}input,textarea{display:block;background:#292c38;color:white;border:1px solid #777;
border-radius:5px;padding:8px}input{width:70px}textarea{width:95%}
button{padding:14px;border:0;border-radius:7px;cursor:pointer;margin:15px 0}
small{color:#bbb}</style>
<h1>Bella's controlled acting study</h1>
<p>Same words, original Bella, four unknown takes. Headphones recommended.
Rate every voice before inspecting evidence.json. 1 means unusable; 5 means excellent.</p>
<p><strong>Locked words:</strong> """ + text + "</p>" + "".join(panels) + """
<button id="export">Export private listening scores</button>
<p id="notice" role="status"></p><small>Local download only. No network submission.
The form is a listener claim, not authenticated approval or proof of rights.</small>
<script>
document.getElementById("export").addEventListener("click",()=>{
 const takes=[...document.querySelectorAll(".take")].map(node=>{
   const ratings={};let complete=true;
   node.querySelectorAll("input").forEach(x=>{
     const n=Number(x.value);
     if(!Number.isInteger(n)||n<1||n>5){complete=false;return;}
     ratings[x.dataset.axis]=n;
   });
   return {take:Number(node.dataset.take),ratings,
     notes:node.querySelector("textarea").value,complete};
 });
 if(takes.some(x=>!x.complete)){
   document.getElementById("notice").textContent="Score all six dimensions for every take first.";
   return;
 }
 const payload={schema:"evercraft.bella.listener-unverified.v1",
   context:document.title.split("|").pop().trim(),reviewerClaimOnly:true,
   noHumanApprovalGranted:true,takes};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download="bella-listener-" + payload.context + ".json";
 link.click();URL.revokeObjectURL(url);
 document.getElementById("notice").textContent="Private scorecard exported. Unblind only now.";
});
</script></html>"""


def generate(folder):
    verify()
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline

    root = pathlib.Path(folder)
    root.mkdir(parents=True, exist_ok=False)
    pipeline = KPipeline(lang_code="a")
    datasets = {}
    for context, texts in CONTEXTS.items():
        context_dir = root / context
        context_dir.mkdir()
        observations = []
        for index, key in enumerate(REVIEW_ORDER, 1):
            punctuation, speed = FACTORIAL[key]
            # Identical native seed for all four cells of a given context.
            torch.manual_seed(SEEDS[context])
            np.random.seed(SEEDS[context])
            clips = [np.asarray(item.audio, dtype=np.float32)
                     for item in pipeline(texts[punctuation], voice="af_bella", speed=speed)]
            if not clips:
                raise RuntimeError("EMPTY_VOICE " + context + " " + key)
            audio = np.concatenate(clips)
            if audio.ndim != 1 or not np.all(np.isfinite(audio)) or np.max(np.abs(audio)) >= 1:
                raise RuntimeError("BAD_WAVEFORM " + context + " " + key)
            dest = context_dir / f"take-{index:02d}.wav"
            sf.write(dest, audio, 24000, subtype="PCM_16")
            metrics = lab.inspect_wav(dest)
            observations.append({
                "blindTake": index,
                "factorialCell": key,
                "punctuation": punctuation,
                "nativeSpeed": speed,
                "nativeSeed": SEEDS[context],
                "script": texts[punctuation],
                "wav": dest.name,
                "wavSha256": lab.sha256(dest),
                "audioMetrics": metrics,
            })
        ratios = [o["audioMetrics"]["durationSec"] for o in observations]
        if max(ratios) / min(ratios) > 1.20:
            raise RuntimeError("OVERWIDE_DURATION_SPREAD " + context)
        (context_dir / "index.html").write_text(room_html(context), encoding="utf-8")
        datasets[context] = observations
    report = {
        "schema": "evercraft.voice-foundry.bella-factorial-study.v1",
        "design": "two contexts, crossed native speed and punctuation, fixed seed per context",
        "voiceId": "af_bella", "model": "Kokoro-82M", "kokoroVersion": "0.9.4",
        "nativeVoiceUnchanged": True,
        "sameSpokenWordsWithinEachContext": True,
        "cloning": False, "phonemeOverrides": False, "pitchEffects": False,
        "masteringApplied": False, "modelCheckpointPinned": False,
        "objectiveMetricsDoNotProveNaturalness": True,
        "founderListeningApproved": False, "commercialRightsVerified": False,
        "clientApproved": False, "publishReady": False,
        "contexts": datasets,
    }
    (root / "evidence.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "result": "8_REAL_NATIVE_WAV_TAKES_FOR_PRIVATE_REVIEW",
        "contexts": {k: [o["audioMetrics"]["durationSec"] for o in v] for k, v in datasets.items()},
        "ownerApproval": False,
    }, indent=2))


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--verify-only":
        verify()
    elif len(sys.argv) == 2:
        generate(sys.argv[1])
    else:
        raise SystemExit("Usage: voice-bella-factorial-study.py NEW_OUT_DIR|--verify-only")
