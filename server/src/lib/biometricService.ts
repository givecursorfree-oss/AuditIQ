import { getEnv } from './env.js';
import logger from './logger.js';
import { getStoredFingerprintLogoffTime } from './biometricImport.js';

/**
 * Biometric (fingerprint) attendance integration point.
 *
 * Prefer imported BiometricDay rows (HR spreadsheet upload). Optionally fall
 * back to BIOMETRIC_API_URL when configured.
 *
 * ponytail: DB first, then single HTTP provider with a 5s timeout — upgrade to
 * a per-vendor adapter + queue if live device APIs need supporting.
 */
export interface BiometricProvider {
  /** Returns the last fingerprint punch-out time as "HH:MM" for the day, or null. */
  getLogoffTime(staffId: string, date: Date): Promise<string | null>;
}

class HttpBiometricProvider implements BiometricProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string
  ) {}

  async getLogoffTime(staffId: string, date: Date): Promise<string | null> {
    const day = date.toISOString().slice(0, 10);
    const url = `${this.baseUrl.replace(/\/$/, '')}/logoff?staffId=${encodeURIComponent(staffId)}&date=${day}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { logoffTime?: string | null };
      const t = data.logoffTime;
      return typeof t === 'string' && /^\d{2}:\d{2}$/.test(t) ? t : null;
    } catch (err) {
      logger.warn('Biometric provider lookup failed', { error: (err as Error).message });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

class ImportedThenHttpProvider implements BiometricProvider {
  constructor(private readonly http: BiometricProvider | null) {}

  async getLogoffTime(staffId: string, date: Date): Promise<string | null> {
    const fromImport = await getStoredFingerprintLogoffTime(staffId, date);
    if (fromImport) return fromImport;
    if (this.http) return this.http.getLogoffTime(staffId, date);
    return null;
  }
}

let _provider: BiometricProvider | undefined;

export function getBiometricProvider(): BiometricProvider {
  if (_provider) return _provider;
  const env = getEnv();
  const http = env.BIOMETRIC_API_URL
    ? new HttpBiometricProvider(env.BIOMETRIC_API_URL, env.BIOMETRIC_API_KEY)
    : null;
  _provider = new ImportedThenHttpProvider(http);
  return _provider;
}

/** Convenience wrapper used by claim creation. */
export function getFingerprintLogoffTime(staffId: string, date: Date): Promise<string | null> {
  return getBiometricProvider().getLogoffTime(staffId, date);
}
