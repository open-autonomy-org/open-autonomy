// Bayesian burn-rate / runway estimate. Daily spend (cents/day) is modelled with a Normal–Inverse-Gamma
// conjugate prior (unknown mean and variance), so the posterior for the mean is a fat-tailed Student-t:
// with few or noisy days it stays near a weak prior with a wide credible interval, and tightens toward the
// empirical mean as completed days accrue. Idle days count as $0. Runway = balance ÷ μ, as an interval.

export interface BurnPrior {
  mean_usd_cents: number;
  strength_days: number;
  var_shape: number;
  var_scale: number;
}

// Weakly informative: ~$0.50/day, worth ~3 pseudo-days, with generous day-to-day variance.
export const DEFAULT_BURN_PRIOR: BurnPrior = { mean_usd_cents: 50, strength_days: 3, var_shape: 2, var_scale: 2500 };

export interface RunwayEstimate {
  burn_per_day_usd_cents: number;
  burn_lo_usd_cents: number;
  burn_hi_usd_cents: number;
  runway_days: number | null;
  runway_lo_days: number | null;
  runway_hi_days: number | null;
  days_observed: number;
  confident: boolean;
}

export function estimateRunway(balanceCents: number, daily: number[], prior: BurnPrior = DEFAULT_BURN_PRIOR): RunwayEstimate {
  const n = daily.length;
  const sum = daily.reduce((a, b) => a + b, 0);
  const mean = n ? sum / n : 0;
  const ss = daily.reduce((a, b) => a + (b - mean) ** 2, 0);
  const { mean_usd_cents: mu0, strength_days: k0, var_shape: a0, var_scale: b0 } = prior;
  const kN = k0 + n;
  const muN = (k0 * mu0 + sum) / kN;
  const aN = a0 + n / 2;
  const bN = b0 + 0.5 * ss + (k0 * n * (mean - mu0) ** 2) / (2 * kN);
  const nu = 2 * aN;
  const scale = Math.sqrt(bN / (aN * kN));
  const t = studentTQuantile(0.9, nu);
  const burnLo = Math.max(0.1, muN - t * scale);
  const burnHi = muN + t * scale;
  const funded = balanceCents > 0;
  return {
    burn_per_day_usd_cents: Math.round(muN),
    burn_lo_usd_cents: Math.round(burnLo),
    burn_hi_usd_cents: Math.round(burnHi),
    runway_days: funded && muN > 0 ? balanceCents / muN : null,
    runway_lo_days: funded ? balanceCents / burnHi : null,
    runway_hi_days: funded ? balanceCents / burnLo : null,
    days_observed: n,
    confident: n >= 3 && burnHi / burnLo <= 4,
  };
}

// Student-t quantile via a Cornish–Fisher expansion around the normal quantile.
function studentTQuantile(p: number, nu: number): number {
  const z = normInv(p);
  if (!Number.isFinite(nu) || nu > 200) return z;
  const z3 = z ** 3, z5 = z ** 5, z7 = z ** 7;
  const g1 = (z3 + z) / 4;
  const g2 = (5 * z5 + 16 * z3 + 3 * z) / 96;
  const g3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / 384;
  return z + g1 / nu + g2 / nu ** 2 + g3 / nu ** 3;
}

// Inverse standard-normal CDF (Acklam's rational approximation).
function normInv(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];
  const plow = 0.02425, phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
