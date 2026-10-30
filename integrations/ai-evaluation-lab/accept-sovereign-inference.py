#!/usr/bin/env python3
"""One-shot physical Sovereign AI inference acceptance; user-owned WSL only.

Runs the signed, locally provisioned llama.cpp and original Evercraft gateway
on new loopback ports with an isolated test DB. No sudo, systemd, remote jobs,
real payments, provider credentials, or persistent daemons.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

MODEL_SHA = '7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5'
RUNTIME_SHA = 'a32b9bdc4d664e21558726fee570b712124c624ccb37fa2eea93bb34a5a93591'
MODEL_ID = 'qwen3-4b-q4-k-m'
ROOT_BASE = Path.home() / '.local/state/evercraft/eo001-sovereign-staging'


def check_digest(path, expected):
    if not path.is_file():
        raise RuntimeError('not_found: ' + str(path))
    digest = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1048576), b''):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise RuntimeError('CHECKSUM_MISMATCH: ' + str(path))


def missing_shared_libraries(ldd_output):
    """Parse GNU ld.so diagnostics without mistaking known libraries for missing."""
    results = []
    for line in ldd_output.splitlines():
        part = line.strip().split()
        if len(part) >= 4 and part[1:4] == ['=>', 'not', 'found']:
            results.append(part[0])
    return results


def preflight_runtime_linker(executable):
    """Read-only ABI dependency check; no host packages are installed here."""
    try:
        result = subprocess.run(['ldd', str(executable)], capture_output=True,
                                text=True, timeout=12,
                                env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError('runtime_dependency_probe_failed: ' + str(exc)) from exc
    missing = missing_shared_libraries(result.stdout + '\n' + result.stderr)
    if missing:
        hint = ' (Ubuntu: sudo apt-get install libgomp1)' if 'libgomp.so.1' in missing else ''
        raise RuntimeError('missing_runtime_libraries: ' + ', '.join(missing) + hint)
    if result.returncode != 0 or 'not a dynamic executable' in result.stdout.lower():
        raise RuntimeError('runtime_loader_unverified: ldd_exit=' + str(result.returncode))
    return True


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return int(s.getsockname()[1])


def json_request(url, token='', body=None, timeout=8):
    headers = {'accept':'application/json'}
    if token:
        headers['authorization'] = 'Bearer ' + token
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers['content-type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers,
                                 method='POST' if data is not None else 'GET')
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read(262144))


def ready(process, url, token='', seconds=180):
    end = time.monotonic() + seconds
    last = 'not_ready'
    while time.monotonic() < end:
        if process.poll() is not None:
            raise RuntimeError('process_exited: '+str(process.returncode))
        try:
            response = json_request(url, token, timeout=3)
            if response.get('ok') is True or isinstance(response.get('data'), list):
                return response
        except (OSError, ValueError, TimeoutError, urllib.error.URLError) as e:
            last = type(e).__name__
        time.sleep(1)
    raise RuntimeError('readiness_timeout: '+last)


def stop(process):
    if process is None or process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=10)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--stage-root',type=Path,required=True)
    args=p.parse_args()
    if os.geteuid()==0:
        raise RuntimeError('no_sudo_or_root')
    root=args.stage_root.expanduser().resolve(strict=True)
    root.relative_to(ROOT_BASE.resolve(strict=True))
    if root.name!='stage-root' or not root.parent.name.startswith('verified-'):
        raise RuntimeError('unexpected_stage_layout')
    stage=json.loads((root.parent/'stage-receipt.json').read_text())
    if (stage.get('signed_manifest_verified') is not True or
        stage.get('state')!='verified_staged_only_not_deployed' or
        Path(stage.get('stage_root','')).resolve()!=root):
        raise RuntimeError('verified_staging_receipt_required')
    provision=json.loads((root/'var/lib/evercraft-ai/receipts/node001-provision.json').read_text())
    if (provision.get('status')!='provisioned-not-certified' or
        provision.get('runtime',{}).get('sha256')!=RUNTIME_SHA or
        provision.get('model',{}).get('sha256')!=MODEL_SHA):
        raise RuntimeError('pinned_provision_receipt_required')
    model=root/'opt/evercraft-ai/models/node001/Qwen3-4B-Q4_K_M.gguf'
    runtime=root/'var/cache/evercraft-ai/llama-b10751-bin-ubuntu-x64.tar.gz'
    executable=root/'opt/evercraft-ai/runtime/current/bin/llama-server'
    library=root/'opt/evercraft-ai/current/lib'
    if not executable.is_file() or not os.access(executable,os.X_OK):
        raise RuntimeError('llama_server_not_executable')
    # A signed binary can still lack host shared-library dependencies.
    # Inspect before hashing ~2.5 GiB or trying to launch it.
    dependencies=subprocess.run(['ldd',str(executable)],capture_output=True,
                                text=True,timeout=15,check=False)
    if dependencies.returncode!=0:
        raise RuntimeError('llama_dependency_inspection_failed')
    missing=[line.split('=>',1)[0].strip() for line in dependencies.stdout.splitlines()
             if '=> not found' in line]
    if missing:
        hint=' (Ubuntu package: libgomp1)' if 'libgomp.so.1' in missing else ''
        raise RuntimeError('llama_missing_shared_libraries: '+', '.join(missing)+hint)
    if not (library/'evercraft_ai/cli.py').is_file():
        raise RuntimeError('evercraft_gateway_missing')
    print('Checking model and runtime SHA-256...',flush=True)
    check_digest(model,MODEL_SHA)
    check_digest(runtime,RUNTIME_SHA)
    print('SOVEREIGN_PROVENANCE: PASS',flush=True)
    model_port=free_port()
    gateway_port=free_port()
    while model_port==gateway_port:
        gateway_port=free_port()
    folder=root.parent/('inference-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6])
    folder.mkdir(mode=0o700)
    data=folder/'data'
    data.mkdir(mode=0o700)
    token=secrets.token_urlsafe(40)
    env={k:os.environ[k] for k in ('PATH','HOME','LANG','LC_ALL') if k in os.environ}
    env.update({
        'PYTHONPATH':str(library), 'PYTHONUNBUFFERED':'1',
        'EVERCRAFT_ENV_FILE':str(folder/'nonexistent-env'),
        'EVERCRAFT_BIND':'127.0.0.1', 'EVERCRAFT_PORT':str(gateway_port),
        'EVERCRAFT_API_TOKEN':token,
        'EVERCRAFT_UPSTREAM_URL':f'http://127.0.0.1:{model_port}/v1',
        'EVERCRAFT_UPSTREAM_API_KEY':'local', 'EVERCRAFT_MODEL':MODEL_ID,
        'EVERCRAFT_DATA_DIR':str(data),
        'EVERCRAFT_DB_PATH':str(data/'test.db'),
        'EVERCRAFT_MEMORY_LIMIT':'0',
    })
    state={'schema':'evercraft.eo001.sovereign-inference-acceptance.v1',
           'state':'IN_PROGRESS', 'stage_root':str(root),
           'model_sha256':MODEL_SHA,'runtime_sha256':RUNTIME_SHA,
           'production_services_modified':False,'synthetic_only':True,
           'model_port':model_port,'gateway_port':gateway_port}
    model_process=gateway_process=None
    log1=log2=None
    try:
        log1=open(folder/'model.log','w')
        log2=open(folder/'gateway.log','w')
        preflight_runtime_linker(executable)
        print('SOVEREIGN_RUNTIME_LINKER: PASS',flush=True)
        print('Starting signed llama.cpp model on loopback...',flush=True)
        model_process=subprocess.Popen([
            str(executable),'--host','127.0.0.1','--port',str(model_port),
            '--model',str(model),'--alias',MODEL_ID,'--ctx-size','2048',
            '--threads','4','--parallel','1','--jinja'
        ],stdin=subprocess.DEVNULL,stdout=log1,stderr=subprocess.STDOUT,
          env=env,start_new_session=True)
        ready(model_process,f'http://127.0.0.1:{model_port}/v1/models',seconds=240)
        print('LLAMA_LOCAL_MODEL: READY',flush=True)
        print('Starting original Evercraft gateway on isolated loopback port...',flush=True)
        gateway_process=subprocess.Popen([sys.executable,'-m','evercraft_ai.cli','serve'],
          stdin=subprocess.DEVNULL,stdout=log2,stderr=subprocess.STDOUT,
          env=env,start_new_session=True)
        health=ready(gateway_process,f'http://127.0.0.1:{gateway_port}/health',token,seconds=30)
        if health.get('tools_enabled') is not False or health.get('bind')!='127.0.0.1':
            raise RuntimeError('gateway_bind_or_tool_permission_invalid')
        print('EVERCRAFT_GATEWAY: READY',flush=True)
        started=time.monotonic()
        answer=json_request(f'http://127.0.0.1:{gateway_port}/v1/chat/completions',token,{
            'model':MODEL_ID,'temperature':0,
            'messages':[{'role':'user','content':'Reply with exactly EVERCRAFT_SOVEREIGN_PROOF_OK and nothing else.'}]
        },timeout=180)
        duration=round(time.monotonic()-started,2)
        content=answer.get('choices',[{}])[0].get('message',{}).get('content','')
        if not isinstance(content,str) or 'EVERCRAFT_SOVEREIGN_PROOF_OK' not in content:
            raise RuntimeError('actual_inference_marker_missing')
        state.update({'state':'FIRST_INFERENCE_PASS','real_local_inference':True,
            'model_reply_sha256':hashlib.sha256(content.encode()).hexdigest(),
            'model_reply_excerpt':content[:300],'inference_seconds':duration,
            'gateway_memory_chain':health.get('memory_chain')})
        print('EVERCRAFT_SOVEREIGN_INFERENCE: PASS',flush=True)
    except Exception as e:
        state.update({'state':'FIRST_INFERENCE_BLOCKED','real_local_inference':False,
                      'error':type(e).__name__+': '+str(e)[:300]})
        print('EVERCRAFT_SOVEREIGN_INFERENCE: BLOCKED: '+str(e),file=sys.stderr,flush=True)
        raise
    finally:
        stop(gateway_process)
        stop(model_process)
        if log1: log1.close()
        if log2: log2.close()
        state['child_processes_stopped']=all(p is None or p.poll() is not None for p in (model_process,gateway_process))
        destination=folder/'inference-receipt.json'
        descriptor=os.open(destination,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(descriptor,'w') as f:
            json.dump(state,f,indent=2)
            f.write('\n')
        print('Receipt:',destination,flush=True)
        print('Logs:',folder,flush=True)

if __name__=='__main__':
    try:
        main()
    except Exception as e:
        print('SOVEREIGN_ACCEPTANCE_STOPPED: '+str(e),file=sys.stderr)
        sys.exit(1)
