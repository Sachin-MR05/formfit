/**
 * The default engine, built from the artifacts exported by Python (ml/scripts/export_for_frontend.py).
 * Import this from UI code. The rest of the engine stays free of JSON/Vite specifics so it is trivially testable.
 */
import configJson from './generated/config.json';
import modelJson from './generated/model.v1.json';
import { createEngine } from './engine.ts';

export const engine = createEngine(configJson, modelJson);
