import { getEnv } from './env.js';
import { getEmbeddingModelName, isSemanticSearchEnabled } from './typesense.js';
import { isPaddleOcrReachable } from './paddleOcr.js';

export type SearchServicesStatus = {
  typesense: 'ok' | 'unreachable';
  tika: 'ok' | 'unreachable';
  paddleOcr: 'ok' | 'unreachable' | 'disabled';
  semantic: 'enabled' | 'disabled' | 'unavailable';
  embeddingModel: string | null;
  mode: 'hybrid' | 'keyword' | 'mysql';
};

let cached: { at: number; status: SearchServicesStatus } | null = null;
const CACHE_MS = 30_000;

export async function getSearchServicesStatus(): Promise<SearchServicesStatus> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.status;
  }

  const env = getEnv();
  let typesense: SearchServicesStatus['typesense'] = 'unreachable';
  let tika: SearchServicesStatus['tika'] = 'unreachable';
  let paddleOcr: SearchServicesStatus['paddleOcr'] = env.PADDLE_OCR_URL ? 'unreachable' : 'disabled';

  try {
    const r = await fetch(`${env.TYPESENSE_HOST.replace(/\/$/, '')}/health`, {
      headers: { 'X-TYPESENSE-API-KEY': env.TYPESENSE_API_KEY },
      signal: AbortSignal.timeout(2000),
    });
    typesense = r.ok ? 'ok' : 'unreachable';
  } catch {
    typesense = 'unreachable';
  }

  try {
    const r = await fetch(`${env.TIKA_URL.replace(/\/$/, '')}/tika`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    tika = r.ok || r.status === 405 ? 'ok' : 'unreachable';
  } catch {
    tika = 'unreachable';
  }

  if (env.PADDLE_OCR_URL) {
    paddleOcr = (await isPaddleOcrReachable()) ? 'ok' : 'unreachable';
  }

  const embeddingModel = isSemanticSearchEnabled() ? getEmbeddingModelName() : null;
  let semantic: SearchServicesStatus['semantic'] = 'disabled';
  if (embeddingModel) {
    semantic = typesense === 'ok' ? 'enabled' : 'unavailable';
  }

  let mode: SearchServicesStatus['mode'] = 'mysql';
  if (typesense === 'ok') {
    mode = semantic === 'enabled' ? 'hybrid' : 'keyword';
  }

  const status: SearchServicesStatus = {
    typesense,
    tika,
    paddleOcr,
    semantic,
    embeddingModel,
    mode,
  };
  cached = { at: Date.now(), status };
  return status;
}

export async function isTypesenseReachable(): Promise<boolean> {
  const s = await getSearchServicesStatus();
  return s.typesense === 'ok';
}
