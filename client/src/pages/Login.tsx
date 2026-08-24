import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeSlash as EyeOff, ArrowRight, ShieldCheck, Key as KeyRound } from '@phosphor-icons/react';
import { LiquidGlassCard } from '@/components/ui/liquid-glass-card';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../hooks/useAppConfig';
import { isAttendanceEligible, tryAttendanceCheckIn, requestAttendanceLocation } from '../lib/attendancePopup';
import { attendanceLoginNotice } from '../lib/attendanceLoginNotice';
import { formatApiError } from '@/lib/apiErrors';
import { appToast, gooeyToast } from '@/context/AppToastContext';
import { appConfirm } from '@/context/AppDialogContext';
import AuditIQLogo from '@/components/brand/AuditIQLogo';

const LOGIN_FEATURE_IMAGES = {
  auditLifecycle: '/feature-audit-lifecycle.avif',
  documentSearch: '/feature-document-search.png',
} as const;

const LOGIN_COPYRIGHT_YEAR = new Date().getFullYear();

function LoginFeature({
  imageSrc,
  imageAlt,
  title,
  description,
}: {
  imageSrc: string;
  imageAlt: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-5">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm sm:size-20">
        <img src={imageSrc} alt={imageAlt} className="size-full object-cover" loading="lazy" />
      </div>
      <div className="min-w-0 pt-1">
        <h3 className="text-base font-semibold tracking-tight text-white sm:text-lg">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-300/90">{description}</p>
      </div>
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState('');
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const { login, verifyTwoFactor, sessionError } = useAuth();
  const { allowStaffRegistration } = useAppConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('verified') === '1') {
      setInfoMsg('Your email has been verified. You can now sign in.');
    }
    if (searchParams.get('registered') === '1') {
      setInfoMsg('Registration submitted. Check your email if verification is required, then sign in.');
    }
    if (searchParams.get('session') === 'expired') {
      setInfoMsg('Your session has expired for security. Please log in again.');
    }
  }, [searchParams]);

  const finishLogin = async (
    loggedInUser: { id?: string; role: string }
  ) => {
    const path = loggedInUser.role === 'Client' ? '/client/dashboard' : '/';
    if (loggedInUser.id && isAttendanceEligible(loggedInUser.role)) {
      let loadingId: string | number | undefined;
      try {
        const gps = await requestAttendanceLocation({ confirm: appConfirm });
        loadingId = gooeyToast.info('Getting GPS…', {
          description: 'Device coordinates vs office pin (not Wi‑Fi/IP). Prefer phone.',
          timing: { displayDuration: 2_147_483_647 },
          showTimestamp: false,
        });
        await tryAttendanceCheckIn(loggedInUser.id, 'manual-login', {
          skipIfAlreadyDone: true,
          forcePopup: false,
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracyMeters: gps.accuracyMeters,
          gpsAttempted: true,
        });
        if (loadingId != null) gooeyToast.dismiss(loadingId);
        appToast({
          variant: 'success',
          title: 'Attendance marked',
          message: `GPS check-in · ±${Math.round(gps.accuracyMeters)}m`,
        });
      } catch (err: unknown) {
        if (loadingId != null) gooeyToast.dismiss(loadingId);
        const notice = attendanceLoginNotice(err);
        appToast({
          persist: true,
          variant: notice.variant,
          title: notice.title,
          message: notice.message,
          action: {
            label: 'Open Attendance',
            onClick: () => navigate('/attendance'),
          },
        });
      }
    }
    navigate(path);
  };

  const extractError = (err: unknown): string => formatApiError(err, 'login');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.kind === '2fa-required') {
        setPreAuthToken(result.preAuthToken);
        setTotpCode('');
        return;
      }
      await finishLogin(result.user);
    } catch (err: unknown) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preAuthToken) return;
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await verifyTwoFactor(preAuthToken, totpCode);
      await finishLogin(loggedInUser);
    } catch (err: unknown) {
      const message = extractError(err);
      setError(message);
      // Pre-auth session expired — back to password step
      if (message.toLowerCase().includes('expired')) {
        setPreAuthToken(null);
        setTotpCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell min-h-screen flex flex-col md:flex-row overflow-hidden" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* ── LEFT: Branding Panel ── */}
      <section className="brand-panel relative hidden md:flex md:w-1/2 lg:w-3/5 items-center justify-center p-12 overflow-hidden">
        {/* Background image + overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src="/logo-bg.png"
            alt=""
            className="w-full h-full object-cover opacity-40 grayscale contrast-125"
          />
          <div className="absolute inset-0 brand-panel-overlay" />
        </div>

        {/* Content */}
        <div className="relative z-10 w-full max-w-xl">
          <div className="mb-16">
            <AuditIQLogo forceTheme="dark" className="h-48 md:h-56 w-auto max-w-md object-contain mb-8" />
            <div className="brand-panel-accent" />
            <p className="text-2xl font-light text-slate-200 leading-relaxed tracking-tight max-w-md">
              Purpose-built for Indian CA firms, manage every audit engagement from planning and fieldwork to reporting, with built-in ICAI and GST compliance intelligence.
            </p>
          </div>

          <LiquidGlassCard
            glassSize="lg"
            className="rounded-2xl border border-white/15 ring-1 ring-white/10"
          >
            <div className="flex flex-col gap-6">
              <LoginFeature
                imageSrc={LOGIN_FEATURE_IMAGES.auditLifecycle}
                imageAlt="ICAI-compliant audit lifecycle"
                title="ICAI-Compliant Audit Lifecycle"
                description="End-to-end engagement management built for Indian CA firms, statutory, tax, GST and internal audits."
              />
              <div className="h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" aria-hidden />
              <LoginFeature
                imageSrc={LOGIN_FEATURE_IMAGES.documentSearch}
                imageAlt="Smart document search"
                title="Smart Document Search"
                description="Find any file by name or content inside PDFs and Office documents, synced from Google Drive."
              />
            </div>
          </LiquidGlassCard>
        </div>

        {/* Copyright */}
        <div className="absolute bottom-10 left-12">
          <span className="text-[0.65rem] tracking-[0.2em] uppercase font-bold text-slate-500">© {LOGIN_COPYRIGHT_YEAR} AuditIQ Enterprise Solutions</span>
        </div>
      </section>

      {/* ── RIGHT: Login Form ── */}
      <section className="flex-1 flex flex-col bg-surface justify-center items-center px-6 py-12 sm:px-12 md:px-14 lg:px-20 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Mobile-only logo */}
          <div className="md:hidden mb-10 flex justify-center">
            <AuditIQLogo className="h-12 w-auto object-contain" />
          </div>

          <header className="mb-10 text-center sm:text-left">
            <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
              {preAuthToken ? 'Two-Factor Authentication' : 'Sign In'}
            </h1>
            <p className="text-base text-foreground-muted leading-relaxed">
              {preAuthToken
                ? 'Enter the 6-digit code from your authenticator app to complete sign-in.'
                : 'Enter your email and password to sign in.'}
            </p>
          </header>

          {sessionError && (
            <output className="mb-8 alert-warning flex list-none justify-between items-start gap-3" role="status">
              <span>{sessionError}</span>
            </output>
          )}
          {error && <div className="mb-8 alert-danger" role="alert">{error}</div>}
          {infoMsg && (
            <output className="mb-8 alert-info flex list-none justify-between items-start gap-3">
              <span>{infoMsg}</span>
              <button type="button" onClick={() => setInfoMsg('')} aria-label="Dismiss message" className="shrink-0 text-primary/70 hover:text-primary font-bold leading-none transition-colors">×</button>
            </output>
          )}

          {preAuthToken ? (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-5">
              <div className="relative">
                <input
                  type="text"
                  id="login-totp"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder=" "
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="input-floating text-center text-2xl tracking-[0.5em] font-mono"
                />
                <label htmlFor="login-totp" className="input-floating-label">
                  Authentication code
                </label>
              </div>
              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none mt-2"
              >
                {loading ? 'Verifying…' : 'Verify and sign in'}
                {!loading && <ShieldCheck size={18} />}
              </button>
              <p className="text-xs text-foreground-muted text-center">
                Next, allow location. Attendance is marked when you are at the office (phone GPS).
              </p>
              <button
                type="button"
                onClick={() => { setPreAuthToken(null); setTotpCode(''); setError(''); }}
                className="w-full text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
              >
                Back to password sign-in
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email – floating label */}
            <div className="relative">
              <input
                type="email"
                id="login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                required
                className="input-floating"
              />
              <label htmlFor="login-email" className="input-floating-label">
                Corporate Email
              </label>
            </div>

            {/* Password – floating label */}
            <div className="space-y-2">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=" "
                  required
                  className="input-floating pr-12"
                />
                <label htmlFor="login-password" className="input-floating-label">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <div className="flex justify-end pt-1">
                <Link to="/forgot-password" className="text-sm font-medium text-primary hover:text-primary-hover hover:underline underline-offset-4 transition-colors">Forgot password?</Link>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none mt-2"
            >
                {loading ? 'Signing in…' : 'Sign in'}
                {!loading && <ArrowRight size={18} />}
              </button>
            {loading ? (
              <p className="text-xs text-foreground-muted text-center">
                Allow location when asked. You stay signed in even if attendance is not marked.
              </p>
            ) : (
              <p className="text-xs text-foreground-muted text-center">
                After sign-in, your browser will ask for location. Attendance uses phone GPS at the office. Desktop location is often rejected.
              </p>
            )}
          </form>
          )}

          {import.meta.env.DEV && (
            <p className="mt-4 text-xs text-foreground-muted text-center sm:text-left">
              Dev login (after <code className="text-[0.7rem]">npm run db:reset:force</code>):{' '}
              <span className="font-mono">partner@mkd.co</span> / <span className="font-mono">Admin@123</span>
              <span className="text-foreground-muted mx-1">·</span>
              <span className="font-mono">client@mkd.co</span> for portal
            </p>
          )}

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-4 text-xs font-semibold tracking-wider uppercase text-foreground-muted label-caps">Or continue with</span>
            </div>
          </div>

          {/* SSO / SAML */}
          <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <button type="button" onClick={() => setInfoMsg('SSO (Single Sign-On) is available for enterprise customers. Contact your IT administrator to configure OIDC/SAML integration with your identity provider.')} className="btn-secondary flex items-center justify-center gap-2.5 py-3 text-sm font-semibold">
              <ShieldCheck size={18} className="text-primary" />
              SSO
            </button>
            <button type="button" onClick={() => setInfoMsg('SAML authentication requires enterprise configuration. Contact your administrator or email enterprise@auditiq.in for setup.')} className="btn-secondary flex items-center justify-center gap-2.5 py-3 text-sm font-semibold">
              <KeyRound size={18} className="text-primary" />
              SAML
            </button>
          </div>

          {/* Register link — client self-service; staff accounts via admin when registration is locked */}
          <footer className="mt-8 text-center sm:text-left">
            <p className="text-sm text-foreground-secondary font-medium">
              {allowStaffRegistration ? (
                <>
                  Don&apos;t have an account?{' '}
                  <Link to="/register" className="text-primary hover:text-primary-hover font-semibold hover:underline underline-offset-4 ml-1 transition-all">
                    Register here
                  </Link>
                </>
              ) : (
                <>
                  Client?{' '}
                  <Link to="/register" className="text-primary hover:text-primary-hover font-semibold hover:underline underline-offset-4 ml-1 transition-all">
                    Register your business
                  </Link>
                </>
              )}
            </p>
          </footer>
        </div>

        {/* Footer links */}
        <div className="mt-auto pt-12 flex flex-wrap justify-center gap-x-8 gap-y-4">
          {['Privacy Policy', 'Terms of Service', 'Security Compliance'].map((label) => (
            <Link
              key={label}
              to={`/${label.toLowerCase().replace(/ /g, '-')}`}
              className="text-xs font-semibold tracking-wider uppercase text-foreground-muted hover:text-foreground-secondary transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
