/** Isolated shared-observatory candidate. Reparameterizes existing scenic 3D curves by approximate distance, so ambient particles can travel at visually consistent speed. No event claims, networking, dependencies, or scheduling. Not connected to any product. */
export function buildArcLengthTable(sample, segments=96) {
  if (typeof sample !== 'function' || !Number.isInteger(segments) || segments<8 || segments>512) throw new Error('invalid_curve_budget');
  const read=t=>{const p=sample(t);if(!p||![p.x,p.y,p.z].every(Number.isFinite))throw new Error('invalid_curve_point');return {x:p.x,y:p.y,z:p.z};};
  const lengths=[0];let previous=read(0);
  for(let i=1;i<=segments;i++){
    const p=read(i/segments),d=Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z);
    const total=lengths[i-1]+d;if(!Number.isFinite(total))throw new Error('invalid_curve_length');
    lengths.push(total);previous=p;
  }
  const total=lengths[segments];
  if(total<=1e-9)throw new Error('degenerate_curve');
  function parameterAt(fraction) {
    if(!Number.isFinite(fraction))throw new Error('invalid_distance_fraction');
    const f=Math.max(0,Math.min(1,fraction));
    if(f===0||f===1)return f;
    const target=f*total;let low=0,high=segments;
    while(high-low>1){const mid=(high+low)>>1;if(lengths[mid]<target)low=mid;else high=mid;}
    const span=lengths[high]-lengths[low];
    return (low+(span>0?(target-lengths[low])/span:0))/segments;
  }
  return Object.freeze({length:total,segments,parameterAt,pointAt:f=>read(parameterAt(f))});
}
