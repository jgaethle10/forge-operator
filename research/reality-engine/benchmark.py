#!/usr/bin/env python3
"""REALITY-001: read-only node inventory and deterministic synthetic temporal reuse benchmark."""
import json, os, platform, time, hashlib, shutil, subprocess, statistics
from pathlib import Path

def read(p):
    try: return Path(p).read_text().strip()
    except OSError: return None

def run():
    w,h,tile,frames=320,192,16,120
    cols,rows=w//tile,h//tile
    def state(f,x,y):
        return (f if x in (f%cols,(f-1)%cols) and y==rows//2 else 0,x,y)
    def render(s):
        return hashlib.shake_256(repr(s).encode()).digest(tile*tile*3)
    def bench(reuse):
        cache={}; times=[]; hashes=[]; hits=misses=0
        for f in range(frames):
            start=time.perf_counter()
            pieces=[]
            for y in range(rows):
                for x in range(cols):
                    s=state(f,x,y); old=cache.get((x,y))
                    if reuse and old and old[0]==s:
                        b=old[1]; hits+=1
                    else:
                        b=render(s); misses+=1
                    if reuse: cache[x,y]=(s,b)
                    pieces.append(b)
            hashes.append(hashlib.sha256(b''.join(pieces)).hexdigest())
            times.append(time.perf_counter()-start)
        return dict(median_ms=statistics.median(times)*1000,p95_ms=sorted(times)[int(.95*len(times))-1]*1000,tiles_reused=hits,tiles_rendered=misses),hashes
    baseline,a=bench(False); temporal,b=bench(True)
    result=dict(schema="evercraft.reality.benchmark.v1",hostname=platform.node(),architecture=platform.machine(),cpu_count=os.cpu_count(),platform=platform.platform(),memory=read("/proc/meminfo").splitlines()[0] if read("/proc/meminfo") else None,render_devices=[p.name for p in Path("/dev/dri").glob("renderD*")],available_tools={x:bool(shutil.which(x)) for x in ("vulkaninfo","clinfo","nvidia-smi","python3")},workload=dict(width=w,height=h,frames=frames,tile=tile,synthetic=True),baseline=baseline,temporal=temporal,exact_match=a==b,limitations="Synthetic CPU tile workload only; no GPU, neural model, game FPS or production performance claims.")
    print(json.dumps(result,indent=2))
    return 0 if a==b else 1

if __name__=="__main__": raise SystemExit(run())
