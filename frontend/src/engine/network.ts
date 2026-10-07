/** Forward pass of the exported MLPs (ReLU hidden layers, sigmoid output). */
export interface MlpModel {
  features: string[];
  mean: number[];
  scale: number[];
  /** W[layer][input][output] (scikit-learn `coefs_` layout) */
  W: number[][][];
  b: number[][];
}

function isNumArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

export function parseMlp(json: unknown, name: string): MlpModel {
  const o = json as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') throw new Error(`${name}: model is not an object`);
  const { features, mean, scale, W, b } = o as Record<string, unknown>;
  if (!Array.isArray(features) || !features.every((f) => typeof f === 'string')) throw new Error(`${name}: bad features`);
  if (!isNumArray(mean) || !isNumArray(scale)) throw new Error(`${name}: bad mean/scale`);
  if (!Array.isArray(W) || !Array.isArray(b) || W.length !== b.length || W.length < 2) throw new Error(`${name}: bad layers`);
  if (mean.length !== features.length || scale.length !== features.length) throw new Error(`${name}: scaler size mismatch`);

  let inDim = features.length;
  (W as unknown[]).forEach((layer, i) => {
    const rows = layer as unknown[];
    if (!Array.isArray(rows) || rows.length !== inDim) throw new Error(`${name}: layer ${i} expects ${inDim} inputs`);
    const outDim = (rows[0] as unknown[]).length;
    if (!rows.every((r) => isNumArray(r) && r.length === outDim)) throw new Error(`${name}: layer ${i} is ragged`);
    const bias = (b as unknown[])[i];
    if (!isNumArray(bias) || bias.length !== outDim) throw new Error(`${name}: layer ${i} bias mismatch`);
    inDim = outDim;
  });
  if (inDim !== 1) throw new Error(`${name}: output layer must have a single unit`);
  return { features: features as string[], mean, scale, W: W as number[][][], b: b as number[][] };
}

/** Probability that the rep is good form (0..1). */
export function predictProba(m: MlpModel, x: readonly number[]): number {
  if (x.length !== m.features.length) throw new Error(`expected ${m.features.length} features, got ${x.length}`);
  let a = x.map((v, i) => (v - m.mean[i]!) / m.scale[i]!);
  for (let l = 0; l < m.W.length; l++) {
    const W = m.W[l]!;
    const bias = m.b[l]!;
    const out = new Array<number>(bias.length);
    for (let j = 0; j < bias.length; j++) {
      let s = bias[j]!;
      for (let i = 0; i < a.length; i++) s += a[i]! * W[i]![j]!;
      out[j] = s;
    }
    a = l < m.W.length - 1 ? out.map((v) => Math.max(0, v)) : out;
  }
  return 1 / (1 + Math.exp(-a[0]!));
}
