import dotenv from 'dotenv';
import { z } from 'zod';
import logger from './logger.js';

let dotenvLoaded = false;

function loadDotenv(): void {
  if (!dotenvLoaded) {
    dotenv.config();
    dotenvLoaded = true;
  }
}

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  // Optional with defaults
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  /**
   * Extra browser origins allowed for CORS (comma-separated), e.g.
   * `https://audit-iq-one.vercel.app,https://auditiq.mkdandeker.com`
   * Always includes CLIENT_URL.
   */
  CLIENT_ORIGINS: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().optional()
  ),
  /** Optional cookie Domain for split deploy, e.g. `.mkdandeker.com` (leading dot). */
  COOKIE_DOMAIN: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().optional()
  ),
  /** Force SameSite=None for cross-site SPA (e.g. vercel.app → custom API). Default auto. */
  COOKIE_SAMESITE: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.enum(['lax', 'none', 'strict']).optional()
  ),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),

  // File uploads
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),

  // Password Vault — AES-256-GCM (must be exactly 32 bytes when decoded)
  // Hex string (64 chars), base64 (44 chars), or any string >=32 chars (will be hashed to 32 bytes)
  VAULT_ENCRYPTION_KEY: z.string().min(16).default('dev-vault-key-change-in-production-32bytes'),

  // Email (SMTP) — optional; if missing, emails are logged but not sent
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('AuditIQ <no-reply@auditiq.local>'),

  // When true, skip client email verification (useful without SMTP). If unset,
  // verification is required only when SMTP_HOST is configured.
  SKIP_EMAIL_VERIFICATION: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  // Firm storage root for client folder auto-creation
  CLIENT_STORAGE_ROOT: z.string().default('uploads/clients'),

  // Background scheduler interval (minutes)
  SCHEDULER_INTERVAL_MIN: z.coerce.number().default(60),

  // Document search (Typesense + Tika — File Brain–style stack)
  TYPESENSE_HOST: z.string().default('http://localhost:8108'),
  TYPESENSE_API_KEY: z.string().default('auditiq-typesense-dev-key'),
  TIKA_URL: z.string().default('http://localhost:9998'),
  /** Built-in Typesense ONNX model (same family as File Brain). */
  TYPESENSE_EMBEDDING_MODEL: z
    .string()
    .default('ts/paraphrase-multilingual-mpnet-base-v2'),
  SEMANTIC_SEARCH_ENABLED: z.preprocess(
    (v) => (v === undefined || v === '' ? 'true' : v),
    z.enum(['true', 'false']).transform((x) => x === 'true')
  ),
  /** Hybrid search: 0 = keyword only, 1 = semantic only (Typesense alpha for vector rank). */
  SEMANTIC_SEARCH_ALPHA: z.coerce.number().min(0).max(1).default(0.45),
  /** Max wait for Typesense per search request (ms); then MySQL results only. */
  TYPESENSE_SEARCH_TIMEOUT_MS: z.coerce.number().min(1000).max(60000).default(4500),

  // Government portal sync provider: 'none' (manual only), 'playwright' (browser automation)
  PORTAL_SYNC_PROVIDER: z.preprocess(
    (v) => (v === undefined || v === '' ? 'none' : v),
    z.enum(['none', 'playwright'])
  ),

  // Biometric / fingerprint attendance device API (optional)
  // When set, late-hours claims fetch the fingerprint log-off time for cross-check.
  BIOMETRIC_API_URL: z
    .preprocess((v) => (v === '' || v == null ? undefined : v), z.string().url().optional()),
  BIOMETRIC_API_KEY: z.string().optional(),

  // Google Drive OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z
    .preprocess((v) => (v === '' || v == null ? undefined : v), z.string().url().optional()),

  // Production hardening (default off — enable only for dev/bootstrap)
  ALLOW_STAFF_REGISTRATION: z.preprocess(
    (v) => (v === undefined || v === '' ? 'false' : v),
    z.enum(['true', 'false']).transform((x) => x === 'true')
  ),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function validateEnv(): Env {
  if (_env) return _env;

  loadDotenv();
  // Empty optional cookie fields → unset (compose may pass "")
  if (process.env.COOKIE_DOMAIN === '') delete process.env.COOKIE_DOMAIN;
  if (process.env.COOKIE_SAMESITE === '') delete process.env.COOKIE_SAMESITE;
  if (process.env.GOOGLE_REDIRECT_URI === '') delete process.env.GOOGLE_REDIRECT_URI;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    logger.error('Environment validation failed', { errors });
    console.error('\n❌ Invalid environment variables:');
    for (const [key, msgs] of Object.entries(errors)) {
      console.error(`  ${key}: ${msgs?.join(', ')}`);
    }
    console.error('\nPlease check your .env file.\n');
    process.exit(1);
  }

  _env = result.data;

  if (_env.NODE_ENV === 'production') {
    const vaultKey = process.env.VAULT_ENCRYPTION_KEY ?? '';
    if (
      !vaultKey ||
      vaultKey === 'dev-vault-key-change-in-production-32bytes' ||
      vaultKey.length < 32
    ) {
      console.error(
        '\n❌ VAULT_ENCRYPTION_KEY must be set to a unique 32+ character secret in production.\n'
      );
      process.exit(1);
    }

    if (
      _env.SEMANTIC_SEARCH_ENABLED &&
      _env.TYPESENSE_API_KEY === 'auditiq-typesense-dev-key'
    ) {
      console.error(
        '\n❌ TYPESENSE_API_KEY is still the development default. Set a unique key in production.\n'
      );
      process.exit(1);
    }

    // Portal links, password-reset and verification emails are built from
    // CLIENT_URL. If it's still the localhost default in production, clients
    // would receive links that open on their own machine instead of the app.
    if (/localhost|127\.0\.0\.1/.test(_env.CLIENT_URL)) {
      console.error(
        '\n❌ CLIENT_URL is still a localhost address. Set it to your public app URL (e.g. https://app.yourfirm.com) so portal and email links resolve correctly.\n'
      );
      process.exit(1);
    }
  }

  return _env;
}

export function getEnv(): Env {
  if (!_env) {
    return validateEnv();
  }
  return _env;
}

/** Deduped list of allowed SPA origins (CLIENT_URL + CLIENT_ORIGINS). */
export function getClientOrigins(env: Env = getEnv()): string[] {
  const extra = (env.CLIENT_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const primary = env.CLIENT_URL.replace(/\/$/, '');
  return [...new Set([primary, ...extra])];
}

/** True when any allowed SPA origin is cross-site vs a typical custom API host (needs SameSite=None). */
export function needsCrossSiteCookies(env: Env = getEnv()): boolean {
  return getClientOrigins(env).some((origin) => {
    try {
      return new URL(origin).hostname.endsWith('.vercel.app');
    } catch {
      return false;
    }
  });
}
