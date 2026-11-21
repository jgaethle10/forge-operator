/**
 * THERMAL-INTELLIGENCE-001: privacy-bounded local OS context snapshot.
 * Read-only /proc and /sys, no network, root, meter controls or process start.
 * Does NOT assert actual at-wall electricity or any recovered heat.
 */
import {readFileSync,readdirSync} from 'node:fs';
import os from 'node:os';
export function classifyNodeReadiness(raw) {
  if (!raw || typeof raw !== 'object') throw new TypeError('Expected raw local diagnostics');
  if (!['linux','win32','darwin'].includes(raw.platform)) throw new TypeError('Unsupported platform record');
  const isWSL = raw.platform === 'linux' && /microsoft|wsl/i.test(String(raw.kernelVersion || ''));
  const readings = Array.isArray(raw.thermalZoneMillidegreesC) ? raw.thermalZoneMillidegreesC : [];
  const thermalZoneDegreesC = readings
    .filter(v => typeof v === 'number' && Number.isFinite(v) && v >= -40000 && v <= 150000)
    .slice(0,64).map(v => Number((v/1000).toFixed(2)));
  const validLoad = Array.isArray(raw.loadavg) && raw.loadavg.length >= 3 && raw.loadavg.slice(0,3).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return {
    schemaVersion:1,
    evidenceClass:'LOCAL_SOFTWARE_CONTEXT_ONLY',
    independentlyVerified:false,
    fieldDeploymentApproved:false,
    environment:isWSL?'WSL_HOST_VIRTUALIZED':raw.platform.toUpperCase(),
    runtimeContext:{
      thermalZoneReadingsC:thermalZoneDegreesC,
      thermalZoneReadingsAttributedToCPU:false,
      hostPowerWatts:null,
      atWallElectricKWh:null,
      usefulRecoveredHeatKWh:null,
      heatMeterPresent:false,
      atWallMeterPresent:false,
      loadavg:validLoad?raw.loadavg.slice(0,3):null,
    },
    gateStatus:'EXTERNAL_METER_REQUIRED',
    missingEvidence:[
      'consented calibrated whole-computer at-wall energy meter reading',
      'independent building heating-demand measurement',
      'safe thermal loop with calibrated flow and temperature measurement',
      'qualified site electrical/thermal review'
    ],
    notices:[
      'Read-only, single-shot operating-system context; no network or workload started.',
      'Software thermal zones and load averages do not prove electricity consumption or captured heat.',
      'WSL and virtualized environments cannot be assumed to expose host wall power.'
    ]
  };
}
function readText(path) {try {return readFileSync(path,'utf8').trim();}catch{return null;}}
function thermalZoneSamples() {
  let dirs=[];
  try {dirs=readdirSync('/sys/class/thermal',{withFileTypes:true}).filter(e=>/^thermal_zone[0-9]+$/.test(e.name));}catch{return [];}
  const vals=[];
  for(const dir of dirs.slice(0,64)) {
    const s=readText('/sys/class/thermal/'+dir.name+'/temp');
    if(s!==null && /^-?[0-9]+$/.test(s)) vals.push(Number(s));
  }
  return vals;
}
export function captureNodeReadiness() {
  const platform=os.platform();
  const raw={platform,kernelVersion:readText('/proc/version') || '',
    thermalZoneMillidegreesC:platform==='linux'?thermalZoneSamples():[],
    loadavg:os.loadavg()};
  return classifyNodeReadiness(raw);
}
