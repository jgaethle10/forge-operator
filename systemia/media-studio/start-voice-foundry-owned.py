#!/usr/bin/env python3
"""Evercraft Voice Foundry | safe owned-node operator launch.

Fail closed on missing local dependencies. Explicitly disable remote model
weight resolution at runtime. Starts only the PRIVATE 127.0.0.1 studio.
This is not a public/iPhone gateway and cannot publish commercial audio.

Usage on Evercraft Node001/Node002 with already provisioned native weights:
  python3 systemia/media-studio/start-voice-foundry-owned.py --check-only
  python3 systemia/media-studio/start-voice-foundry-owned.py --start --port 8766

No pip installs, no DigitalOcean/TinyFish/Base44/Opera, no external runtime,
no background daemon or changes to Penguin/NextGen services by default.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys

HERE=Path(__file__).resolve().parent
APP=HERE/"voice-foundry-local-studio.py"
REQUIRED_MODULES=("kokoro","torch","soundfile","numpy")
REQUIRED_BINARIES=("ffmpeg","ffprobe","espeak-ng")
OFFLINE_ENV={
    "HF_HUB_OFFLINE":"1",
    "TRANSFORMERS_OFFLINE":"1",
    "HF_DATASETS_OFFLINE":"1",
    "TOKENIZERS_PARALLELISM":"false",
}
HOST="127.0.0.1"


def inspect_environment():
    modules={name:importlib.util.find_spec(name) is not None
             for name in REQUIRED_MODULES}
    binaries={name:shutil.which(name) is not None
              for name in REQUIRED_BINARIES}
    return {
        "schema":"evercraft.voice-foundry.owned-operator-preflight.v1",
        "installedModules":modules,
        "availableBinaries":binaries,
        "localDependenciesPresent":all(modules.values()) and all(binaries.values()),
        "modelWeightsVerifiedCached":False,
        "networkModelResolutionAllowed":False,
        "runtimeHost":HOST,
        "publicServiceDeployed":False,
        "iphoneRemoteServiceEnabled":False,
        "releaseApproved":False,
    }


def launch(port,root):
    checks=inspect_environment()
    if not checks["localDependenciesPresent"]:
        raise RuntimeError("LOCAL_ENGINE_DEPENDENCIES_MISSING")
    if not APP.is_file():
        raise RuntimeError("OWNED_LOCAL_STUDIO_SCRIPT_NOT_FOUND")
    if not (1<=port<=65535):
        raise ValueError("INVALID_PORT")
    path=Path(root).expanduser()
    if not path.is_absolute():
        raise ValueError("PRIVATE_DATA_PATH_MUST_BE_ABSOLUTE")
    env=os.environ.copy()
    env.update(OFFLINE_ENV)
    args=[sys.executable,str(APP),"--host",HOST,"--port",str(port),
          "--data-dir",str(path)]
    # exec replaces operator launcher; no child daemon, no service changes.
    os.execvpe(sys.executable,args,env)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    mode=p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-only",action="store_true")
    mode.add_argument("--start",action="store_true")
    p.add_argument("--port",type=int,default=8766)
    p.add_argument("--data-dir",
                   default=str(Path.home()/".local/share/evercraft/voice-foundry/reviews"))
    a=p.parse_args()
    if a.check_only:
        print(json.dumps(inspect_environment(),indent=2))
    else:
        launch(a.port,a.data_dir)


if __name__=="__main__":
    main()
