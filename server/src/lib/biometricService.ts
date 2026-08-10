import { getEnv } from './env.js';
import logger from './logger.js';

/**
 * Biometric (fingerprint) attendance integration point.
 *
 * Late-hours claims are cross-checked against both the computer log-off time and
 * the fingerprint device log-off time, subject to manager approval. Real devices
 * (eSSL, ZKTeco, etc.) expose vendor-specific APIs, so this is a pluggable
 * provider: when `BIOMETRIC_API_URL` is configured it queries that endpoint,
 * otherwise it returns null and the claim proceeds on the computer log-off alone.
 *
 * ponytail: single HTTP provider with a 5s timeout, no retry/caching — upgrade to
 * a per-vendor adapter + queue if multiple device brands need supporting.
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

class NullBiometricProvider implements BiometricProvider {
  async getLogoffTime(): Promise<string | null> {
    return null;
  }
}

let _provider: BiometricProvider | undefined;

export function getBiometricProvider(): BiometricProvider {
  if (_provider) return _provider;
  const env = getEnv();
  _provider = env.BIOMETRIC_API_URL
    ? new HttpBiometricProvider(env.BIOMETRIC_API_URL, env.BIOMETRIC_API_KEY)
    : new NullBiometricProvider();
  return _provider;
}

/** Convenience wrapper used by claim creation. */
export function getFingerprintLogoffTime(staffId: string, date: Date): Promise<string | null> {
  return getBiometricProvider().getLogoffTime(staffId, date);
}
