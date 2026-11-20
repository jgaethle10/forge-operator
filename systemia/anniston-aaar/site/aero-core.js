/* AAAR AeroCore v0.4: analytical pre-screening, not CFD or certification.
 * No external dependencies. SI units throughout.
 * Sources: NASA Glenn lift equation; classical NACA 4-digit geometry and thin-airfoil lift slope.
 */
(function (scope, factory) {
  const core = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (scope) scope.AAARAero = core;
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';
  const PI = Math.PI, RAD = PI / 180, RHO = 1.225, G = 9.80665, MU = 1.81e-5;
  function nacaParts(code) {
    const s = String(code);
    if (!/^\d{4}$/.test(s)) throw new RangeError('Use a four-digit NACA section (e.g. 2412).');
    const m = +s[0] / 100, p = +s[1] / 10, t = +s.slice(2) / 100;
    if (t <= 0 || t > 0.4 || (m > 0 && (p <= 0 || p >= 1))) throw new RangeError('Unsupported NACA geometry.');
    return { code: s, m, p, t };
  }
  function camber(parts, x) {
    const {m,p} = parts;
    if (!m) return {y:0, slope:0};
    return x <= p
      ? {y:m / (p*p)*(2*p*x-x*x), slope:2*m/(p*p)*(p-x)}
      : {y:m / ((1-p)*(1-p))*(1-2*p+2*p*x-x*x), slope:2*m/((1-p)*(1-p))*(p-x)};
  }
  function geometry(code, segments=100) {
    const parts = nacaParts(code), n = Math.min(400,Math.max(20,Math.round(segments)));
    const upper=[], lower=[];
    for (let i=0;i<=n;i++) {
      const x=(1-Math.cos(PI*i/n))/2, thickness=5*parts.t*(0.2969*Math.sqrt(x)-0.126*x-0.3516*x*x+0.2843*x*x*x-0.1015*x*x*x*x);
      const {y,slope}=camber(parts,x), theta=Math.atan(slope);
      upper.push({x:x-thickness*Math.sin(theta), y:y+thickness*Math.cos(theta)});
      lower.push({x:x+thickness*Math.sin(theta), y:y-thickness*Math.cos(theta)});
    }
    return {upper,lower,parts};
  }
  function zeroLiftAngle(code) {
    const parts=nacaParts(code);
    if (!parts.m) return 0;
    let total=0, n=600;
    for (let i=0;i<n;i++) {
      const theta=PI*(i+0.5)/n, x=(1-Math.cos(theta))/2;
      total+=camber(parts,x).slope*(1-Math.cos(theta));
    }
    return total/n;
  }
  function estimate(params) {
    const code=String(params.code||'2412');nacaParts(code);
    const alpha=Number(params.alpha), speed=Number(params.speed), area=Number(params.area), mass=Number(params.mass), ar=Number(params.ar);
    if (![alpha,speed,area,mass,ar].every(Number.isFinite) || alpha < -20 || alpha > 24 || speed < 0 || speed > 110 || area <= 0 || area > 300 || mass <= 0 || mass > 30000 || ar < 2 || ar > 20) throw new RangeError('Input outside the AAAR analytical screening bounds.');
    const alphaZero=zeroLiftAngle(code), sectionSlope=2*PI, spanEfficiency=0.85;
    const liftSlope=sectionSlope/(1+sectionSlope/(PI*spanEfficiency*ar));
    const cl=liftSlope*(alpha*RAD-alphaZero);
    const q=0.5*RHO*speed*speed;
    const lift=q*area*cl,weight=mass*G,span=Math.sqrt(ar*area),chord=area/span;
    const reynolds=RHO*speed*chord/MU;
    const mach=speed/340.3;
    const withinEnvelope=alpha>=-6&&alpha<=8&&speed>=5&&mach<0.3;
    return {code,alpha,speed,area,mass,ar,lift,weight,delta:lift-weight,cl,q,alphaZeroDeg:alphaZero/RAD,reynolds,mach,span,chord,withinEnvelope,
      model:'Linear finite-wing lift screening (thin-airfoil camber + aspect-ratio correction)',
      state:withinEnvelope?'WITHIN_SCREENING_RANGE':'OUTSIDE_SCREENING_RANGE',
      limitations:'Not CFD, wind tunnel testing, stall prediction, trim, stability, drag, structural analysis, mission design, or flight authorization.',
      assumptions:'Sea-level standard density 1.225 kg/m³; dynamic viscosity 1.81e-5 Pa·s; unswept untwisted rectangular wing; fixed span efficiency 0.85; linear attached flow.'};
  }
  return Object.freeze({nacaParts,camber,geometry,zeroLiftAngle,estimate,constants:Object.freeze({RHO,G,MU})});
});
