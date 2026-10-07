import { parseConfig, type EngineConfig } from './config.ts';
import { parseMlp, type MlpModel } from './network.ts';

/** Feature order the networks were trained with. Checked at load time so a mismatch fails loudly. */
export const GENERIC_FEATURES = ['knee', 'hip', 'torso', 'shank', 'phi'] as const;
export const PERSONALIZED_FEATURES = [...GENERIC_FEATURES, 'femur_torso', 'shank_femur', 'leg_torso'] as const;

export interface ModelMeta {
  dataSource: string;
  createdUtc: string;
  nPeople: number;
  nReps: number;
  metrics: Record<string, number>;
}

export interface Engine {
  config: EngineConfig;
  personalized: MlpModel;
  generic: MlpModel;
  modelVersion: string;
  meta: ModelMeta;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function createEngine(configJson: unknown, modelJson: unknown): Engine {
  const config = parseConfig(configJson);
  const m = modelJson as Record<string, unknown> | null;
  if (!m || typeof m !== 'object') throw new Error('model.v1.json is not an object');

  const personalized = parseMlp(m['personalized'], 'personalized');
  const generic = parseMlp(m['generic'], 'generic');
  if (!sameList(personalized.features, PERSONALIZED_FEATURES)) {
    throw new Error(`personalized model expects [${personalized.features}], engine builds [${PERSONALIZED_FEATURES}]`);
  }
  if (!sameList(generic.features, GENERIC_FEATURES)) {
    throw new Error(`generic model expects [${generic.features}], engine builds [${GENERIC_FEATURES}]`);
  }

  const version = m['model_version'];
  if (typeof version !== 'string') throw new Error('model.v1.json: missing model_version');
  const meta = (m['meta'] ?? {}) as Record<string, unknown>;
  return {
    config,
    personalized,
    generic,
    modelVersion: version,
    meta: {
      dataSource: String(meta['data_source'] ?? 'unknown'),
      createdUtc: String(meta['created_utc'] ?? ''),
      nPeople: Number(meta['n_people'] ?? 0),
      nReps: Number(meta['n_reps'] ?? 0),
      metrics: (meta['metrics'] ?? {}) as Record<string, number>,
    },
  };
}
