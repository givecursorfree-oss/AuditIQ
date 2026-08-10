import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeSlash as EyeOff } from '@phosphor-icons/react';
import { PublicAuthShell } from '@/components/layout/PublicAuthShell';
import api from '@/services/api';

const PASSWORD_STRENGTH = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!PASSWORD_STRENGTH.test(password)) {
      setError('Password must be at least 8 characters with 1 uppercase letter, 1 number, and 1 special character (!@#$%^&*).');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr?.response?.data?.error || 'Unable to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <PublicAuthShell title="Invalid link" subtitle="This password reset link is missing or malformed.">
        <Link to="/forgot-password" className="btn-primary inline-flex w-full justify-center py-3">
          Request a new reset link
        </Link>
      </PublicAuthShell>
    );
  }

  if (done) {
    return (
      <PublicAuthShell title="Password updated" subtitle="Your password has been changed. Redirecting you to sign in…">
        <Link to="/login" className="btn-primary inline-flex w-full justify-center py-3">
          Sign in now
        </Link>
      </PublicAuthShell>
    );
  }

  return (
    <PublicAuthShell
      title="Choose a new password"
      subtitle="Your new password must be at least 8 characters with an uppercase letter, a number, and a special character."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            id="reset-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder=" "
            required
            autoComplete="new-password"
            className="input-floating pr-12"
          />
          <label htmlFor="reset-password" className="input-floating-label">
            New password
          </label>
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors focus:outline-none"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            id="reset-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder=" "
            required
            autoComplete="new-password"
            className="input-floating"
          />
          <label htmlFor="reset-confirm" className="input-floating-label">
            Confirm new password
          </label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 disabled:opacity-70">
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </PublicAuthShell>
  );
}
