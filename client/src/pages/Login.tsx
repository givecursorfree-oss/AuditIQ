import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, ShieldCheck, Bot, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } }; code?: string; message?: string };
      const message = axErr?.response?.data?.error
        || (axErr?.code === 'ERR_NETWORK' ? 'Cannot connect to server. Please ensure the backend is running on port 3001.' : null)
        || axErr?.message
        || 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const demoUsers = [
    { role: 'Partner', email: 'rajesh@auditiq.in', color: '#0058bc' },
    { role: 'Manager', email: 'priya@auditiq.in', color: '#7c3aed' },
    { role: 'Staff', email: 'ankit@auditiq.in', color: '#059669' },
    { role: 'Staff', email: 'neha@auditiq.in', color: '#059669' },
    { role: 'Intern', email: 'rohan@auditiq.in', color: '#d97706' },
    { role: 'Client', email: 'vikram@reliance.in', color: '#6b7280' },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-hidden" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>

      {/* ── LEFT: Branding Panel ── */}
      <section className="relative hidden md:flex md:w-1/2 lg:w-3/5 items-center justify-center p-12 overflow-hidden bg-[#1a1c1d]">
        {/* Background image + overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuA4FEVC11qP_czTlKWHP3aND9QMfknjO7GKO8Uc4o09p27SVZ0fxMKsKnij-cCJ7P_5qyI--jgwoG5YhW_ISlgB0b-mlI9OBUoECi5aQM7g5yWjWAAByWFsoHCRAD8Q3ngzqb67y2tsZgoqf-Yj6OWGQQbTFIjpLN7cOxIY4s4wQ8w4T-q33x8A6cJhZcXGK6jGwGcIBXSgHCB7IL0uz7nEHyWXVcMNWYeIiWvgoLTy23kTJW2no1OyVTiQGPuqosKqubLGUnVIooaY"
            alt=""
            className="w-full h-full object-cover opacity-40 grayscale contrast-125"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top right, #1a1c1d 40%, rgba(26,28,29,0.75) 70%, rgba(0,88,188,0.28) 100%)' }} />
        </div>

        {/* Content */}
        <div className="relative z-10 w-full max-w-xl">
          <div className="mb-16">
            <img src="/logo.png" alt="AuditIQ" className="h-48 md:h-56 w-auto object-contain mb-8 brightness-0 invert drop-shadow-2xl" />
            <div className="h-1.5 w-24 rounded-full mb-8 bg-[#0070eb]" />
            <p className="text-2xl font-light text-[#e2e2e4] leading-relaxed tracking-tight max-w-md">
              Purpose-built for Indian CA firms — manage every audit engagement from planning and fieldwork to reporting, with built-in ICAI & GST compliance intelligence.
            </p>
          </div>

          {/* Glass card */}
          <div
            className="rounded-xl p-8 flex flex-col gap-6"
            style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg flex-shrink-0" style={{ background: 'rgba(0,88,188,0.22)' }}>
                <ShieldCheck size={20} className="text-[#adc6ff]" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">ICAI-Compliant Audit Lifecycle</h3>
                <p className="text-[#c1c6d7] text-sm mt-1">End-to-end engagement management built for Indian CA firms — Statutory, Tax, GST &amp; Internal audits.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg flex-shrink-0" style={{ background: 'rgba(0,88,188,0.22)' }}>
                <Bot size={20} className="text-[#adc6ff]" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">AI-Powered Copilot</h3>
                <p className="text-[#c1c6d7] text-sm mt-1">Intelligent assistant for SA references, Form 3CD, materiality calculations &amp; regulatory guidance.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="absolute bottom-10 left-12">
          <span className="text-[0.65rem] tracking-[0.2em] uppercase font-bold text-[#717786]">© 2026 AuditIQ Enterprise Solutions</span>
        </div>
      </section>

      {/* ── RIGHT: Login Form ── */}
      <section className="flex-1 flex flex-col bg-white justify-center items-center px-6 py-12 sm:px-12 md:px-14 lg:px-20 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Mobile-only logo */}
          <div className="md:hidden mb-10 flex justify-center">
            <img src="/logo.png" alt="AuditIQ" className="h-28 w-auto object-contain" />
          </div>

          <header className="mb-10 text-center sm:text-left">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-2">Sign In</h2>
            <p className="text-base text-gray-500 leading-relaxed">Welcome back. Please enter your credentials to access your dashboard.</p>
          </header>

          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm font-medium">
              {error}
            </div>
          )}
          {infoMsg && (
            <div className="mb-8 p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-sm font-medium flex justify-between items-start">
              <span>{infoMsg}</span>
              <button type="button" onClick={() => setInfoMsg('')} className="ml-4 text-blue-400 hover:text-blue-700 font-bold leading-none flex-shrink-0 transition-colors">×</button>
            </div>
          )}

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
                className="peer block w-full px-4 pt-6 pb-2 text-gray-900 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all duration-200"
              />
              <label
                htmlFor="login-email"
                className="absolute left-4 top-4 text-sm font-medium text-gray-500 origin-top-left transition-all duration-200 pointer-events-none
                  peer-focus:-translate-y-2 peer-focus:scale-[0.85] peer-focus:text-blue-600
                  peer-[:not(:placeholder-shown)]:-translate-y-2 peer-[:not(:placeholder-shown)]:scale-[0.85]"
              >
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
                  className="peer block w-full px-4 pt-6 pb-2 pr-12 text-gray-900 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all duration-200"
                />
                <label
                  htmlFor="login-password"
                  className="absolute left-4 top-4 text-sm font-medium text-gray-500 origin-top-left transition-all duration-200 pointer-events-none
                    peer-focus:-translate-y-2 peer-focus:scale-[0.85] peer-focus:text-blue-600
                    peer-[:not(:placeholder-shown)]:-translate-y-2 peer-[:not(:placeholder-shown)]:scale-[0.85]"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <div className="flex justify-end pt-1">
                <a href="#" className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline underline-offset-4 transition-colors">Forgot password?</a>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-semibold py-3.5 px-4 rounded-xl shadow-sm hover:shadow transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none mt-2"
              style={{ background: '#0058bc' }}
              onMouseEnter={(e) => !loading && ((e.currentTarget as HTMLButtonElement).style.background = '#004aa3')}
              onMouseLeave={(e) => !loading && ((e.currentTarget as HTMLButtonElement).style.background = '#0058bc')}
            >
              {loading ? 'Signing in...' : 'Sign in to dashboard'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-xs font-semibold tracking-wider uppercase text-gray-400">Or continue with</span>
            </div>
          </div>

          {/* SSO / SAML */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <button type="button" onClick={() => setInfoMsg('SSO (Single Sign-On) is available for enterprise customers. Contact your IT administrator to configure OIDC/SAML integration with your identity provider.')} className="flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors font-semibold text-gray-700 text-sm shadow-sm">
              <ShieldCheck size={18} className="text-blue-600" />
              SSO
            </button>
            <button type="button" onClick={() => setInfoMsg('SAML authentication requires enterprise configuration. Contact your administrator or email enterprise@auditiq.in for setup.')} className="flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors font-semibold text-gray-700 text-sm shadow-sm">
              <KeyRound size={18} className="text-blue-600" />
              SAML
            </button>
          </div>

          {/* Demo Credentials */}
          <div className="p-5 rounded-xl border border-gray-200 bg-gray-50/50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center justify-between">
              Demo Credentials
              <span className="text-[10px] font-medium opacity-70 normal-case tracking-normal text-gray-400">Tap to auto-fill</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {demoUsers.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => { setEmail(u.email); setPassword('password123'); }}
                  className="text-left p-2.5 rounded-lg bg-white hover:bg-blue-50 transition-colors border border-gray-200 hover:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                >
                  <span className="text-xs font-bold block mb-0.5" style={{ color: u.color }}>{u.role}</span>
                  <span className="text-[10px] text-gray-500 block leading-tight truncate" title={u.email}>{u.email}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Register link */}
          <footer className="mt-8 text-center sm:text-left">
            <p className="text-sm text-gray-600 font-medium">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-600 hover:text-blue-700 font-semibold hover:underline underline-offset-4 ml-1 transition-all">
                Register here
              </Link>
            </p>
          </footer>
        </div>

        {/* Footer links */}
        <div className="mt-auto pt-12 flex flex-wrap justify-center gap-x-8 gap-y-4">
          {['Privacy Policy', 'Terms of Service', 'Security Compliance'].map((label) => (
            <a
              key={label}
              href="#"
              className="text-xs font-semibold tracking-wider uppercase text-gray-400 hover:text-gray-600 transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
