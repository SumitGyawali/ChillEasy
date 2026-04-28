import * as tf from '@tensorflow/tfjs';

/**
 * Closed-form simple linear regression on a 10-point sliding window.
 * Returns predicted temperature at t+horizonMin minutes (relative to last sample).
 * Also returns slope, intercept, residual std, and MAE on training window.
 *
 * We compute coefficients with TensorFlow.js to honour the spec's TF.js requirement,
 * but algebraically (no gradient descent) for stability with tiny windows.
 */
export function fitAndPredict(window, horizonMin = 15) {
  if (!window || window.length < 3) return null;

  const t0 = new Date(window[0].timestamp).getTime();
  const xs = window.map((p) => (new Date(p.timestamp).getTime() - t0) / 60000); // minutes
  const ys = window.map((p) => (p.sensor1 + p.sensor2) / 2);

  const xT = tf.tensor1d(xs);
  const yT = tf.tensor1d(ys);

  const xMean = xT.mean();
  const yMean = yT.mean();
  const xCenter = xT.sub(xMean);
  const yCenter = yT.sub(yMean);
  const slopeT = xCenter.mul(yCenter).sum().div(xCenter.square().sum().add(1e-9));
  const interceptT = yMean.sub(slopeT.mul(xMean));

  const slope = slopeT.dataSync()[0];
  const intercept = interceptT.dataSync()[0];

  const preds = xT.mul(slope).add(intercept);
  const residuals = yT.sub(preds);
  const mae = residuals.abs().mean().dataSync()[0];
  const std = Math.sqrt(residuals.square().mean().dataSync()[0]);

  xT.dispose(); yT.dispose(); xMean.dispose(); yMean.dispose();
  xCenter.dispose(); yCenter.dispose(); slopeT.dispose(); interceptT.dispose();
  preds.dispose(); residuals.dispose();

  const xTarget = xs[xs.length - 1] + horizonMin;
  const tPred = slope * xTarget + intercept;

  return {
    slope, // °C/min
    intercept,
    mae,
    std,
    tPred,
    horizonMin,
    fitWindow: xs.map((x, i) => ({ x, y: ys[i], yhat: slope * x + intercept })),
    xLast: xs[xs.length - 1],
    xTarget,
  };
}

/**
 * Composite risk score 0–100.
 * Weights:
 *  - rate of change (slope °C/min)
 *  - distance from safe-zone midpoint (5°C ideal)
 *  - predicted potency loss rate
 *  - battery level (lower = higher risk)
 */
export function riskScore({ slope, currentTemp, predictedPotency, currentPotency, battery, threshold }) {
  const rate = Math.min(1, Math.abs(slope) / 1.0); // 1°C/min => max
  const dist = Math.min(1, Math.max(0, Math.abs(currentTemp - 5) - 3) / 8);
  const potencyDrop = Math.max(0, currentPotency - predictedPotency) / 30;
  const breach = predictedPotency < threshold ? 1 : 0;
  const bat = 1 - Math.min(1, Math.max(0, battery / 100));
  const score = 100 * (0.30 * rate + 0.25 * dist + 0.25 * Math.min(1, potencyDrop) + 0.10 * bat + 0.10 * breach);
  return Math.round(Math.min(100, Math.max(0, score)));
}
