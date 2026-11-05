/**
 * HIST-TECH-001: second numerical representation of the coaxial-circular-filament model.
 * Maxwell complete elliptic integrals K and E in SI; Rosa & Cohen,
 * Bulletin of the Bureau of Standards 5, p. 6 Eq. (1).
 * https://nvlpubs.nist.gov/nistpubs/bulletin/05/nbsbulletinv5n1p1_A2b.pdf
 *
 * Mathematical cross-check only. Both formulas share the same physical assumptions.
 */
const MU0 = 4 * Math.PI * 1e-7;
function positive(x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) throw new RangeError(name + ' must be positive and finite');
  return x;
}
function nonnegative(x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) throw new RangeError(name + ' must be nonnegative and finite');
  return x;
}
function turns(x, name) {
  if (!Number.isSafeInteger(x) || x < 1 || x > 1000) throw new RangeError(name + ' must be an integer 1..1000');
  return x;
}
// Composite Simpson quadrature over complete elliptic integrals K(m) and E(m).
function ellipticKE(m, panels) {
  const step = Math.PI / (2 * panels);
  let kSum = 0;
  let eSum = 0;
  for (let i = 0; i <= panels; ++i) {
    const sin = Math.sin(i * step);
    const root = Math.sqrt(1 - m * sin * sin);
    const weight = i === 0 || i === panels ? 1 : (i % 2 === 0 ? 2 : 4);
    kSum += weight / root;
    eSum += weight * root;
  }
  return {K:kSum * step / 3, E:eSum * step / 3};
}
function evaluate(a, b, h, n1, n2, panels) {
  const m = 4 * a * b / ((a + b) ** 2 + h ** 2);
  // Avoid cancellation in small modulus and poorly resolved near-singularity.
  if (!(m >= 0.015 && m <= 0.995)) throw new RangeError('Elliptic cross-check requires 0.015 <= k^2 <= 0.995');
  const {K,E} = ellipticKE(m, panels);
  return MU0 * Math.sqrt(a * b) * ((2-m)*K - 2*E) / Math.sqrt(m) * n1 * n2;
}
export function maxwellEllipticMutualInductance({
  transmitterRadiusMm, receiverRadiusMm, separationMm,
  transmitterTurns = 1, receiverTurns = 1
}) {
  const a = positive(transmitterRadiusMm,'transmitterRadiusMm') / 1000;
  const b = positive(receiverRadiusMm,'receiverRadiusMm') / 1000;
  const h = nonnegative(separationMm,'separationMm') / 1000;
  const n1 = turns(transmitterTurns,'transmitterTurns');
  const n2 = turns(receiverTurns,'receiverTurns');
  if (Math.hypot(a-b,h) < 0.0005) throw new RangeError('Filaments touch or are too close for this ideal reference');
  const coarse = evaluate(a,b,h,n1,n2,2048);
  const fine = evaluate(a,b,h,n1,n2,4096);
  if (!(fine > 0) || !Number.isFinite(fine) || Math.abs(fine-coarse)/fine > 1e-6) {
    throw new Error('Elliptic numerical reference did not converge');
  }
  return {
    mutualInductanceHenries:fine,
    mutualInductanceMicrohenries:fine*1e6,
    method:'maxwell_complete_elliptic_integrals',
    evidenceKind:'theoretical_calculation_only',
    qualification:'Second mathematical representation only, NOT an independent experiment or measured performance'
  };
}
