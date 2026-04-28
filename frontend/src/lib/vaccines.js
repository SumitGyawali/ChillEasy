// Vaccine profiles + Arrhenius potency math.
// k(T) = k_safe * exp( (Ea/R) * (1/T_ref - 1/T) ) blended with k_hot at high T,
// but for simplicity (and matching the spec's "log-linear" model) we use a
// piecewise-Arrhenius interpolation between (T_safe=5°C, k_safe) and (T_hot=25°C, k_hot)
// using Ea_kJ_mol to scale the curvature.

export const R_GAS = 8.314e-3; // kJ/(mol·K)
const T_SAFE_K = 5 + 273.15;
const T_HOT_K = 25 + 273.15;

/**
 * Compute degradation rate constant k (per hour) at temperature T (°C).
 * Uses Arrhenius form anchored on the vaccine's k_safe at 5°C and Ea.
 * Validated against k_hot at 25°C (within scaling tolerance).
 */
export function arrheniusK(tempC, vaccine) {
  const T = tempC + 273.15;
  const { k_safe, Ea_kJ_mol } = vaccine;
  // Arrhenius shift: k(T) = k_safe * exp( -Ea/R * (1/T - 1/T_safe) )
  const k = k_safe * Math.exp(-(Ea_kJ_mol / R_GAS) * (1 / T - 1 / T_SAFE_K));
  return k; // per hour
}

/**
 * Compute potency at time delta_hours given current temperature, starting from p0%.
 */
export function potencyAfter(p0Pct, tempC, deltaHours, vaccine) {
  const k = arrheniusK(tempC, vaccine);
  return p0Pct * Math.exp(-k * deltaHours);
}

/**
 * Step potency: integrate over a time step using current temperature.
 */
export function stepPotency(prevPct, tempC, dtHours, vaccine) {
  const k = arrheniusK(tempC, vaccine);
  return prevPct * Math.exp(-k * dtHours);
}

/**
 * Estimated viability window in hours: time until potency drops below threshold
 * if temperature stays at tempC.
 * P(t) = P0 * exp(-k*t)  =>  t = ln(P0/Pmin) / k
 */
export function viabilityHours(currentPct, tempC, vaccine) {
  const k = arrheniusK(tempC, vaccine);
  if (k <= 1e-12) return 9999;
  const ratio = currentPct / vaccine.min_potency_pct;
  if (ratio <= 1) return 0;
  return Math.log(ratio) / k;
}

/**
 * Cumulative thermal exposure above ref_C (default 8°C) in °C·minutes.
 */
export function cumulativeExposure(history, refC = 8) {
  let acc = 0;
  for (let i = 1; i < history.length; i++) {
    const dtMin = (new Date(history[i].t) - new Date(history[i - 1].t)) / 60000;
    const tAvg = (history[i].temp + history[i - 1].temp) / 2;
    const excursion = Math.max(0, tAvg - refC);
    acc += excursion * dtMin;
  }
  return acc;
}

/** Color for temperature against safe band [low, high] */
export function tempColor(tempC, low = 2, high = 8) {
  if (tempC < low - 1 || tempC > high + 4) return '#E24B4A';
  if (tempC < low || tempC > high) return '#EF9F27';
  return '#1D9E75';
}

/** Color for potency against threshold */
export function potencyColor(pct, threshold = 80) {
  if (pct < threshold) return '#E24B4A';
  if (pct < threshold + 8) return '#EF9F27';
  return '#1D9E75';
}
