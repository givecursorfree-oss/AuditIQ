import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicAuthShell } from '@/components/layout/PublicAuthShell';
import api from '@/services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
    } catch {
      setError('Unable to process your request. Please try again or contact your firm administrator.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <PublicAuthShell
        title="Check your email"
        subtitle="If an account exists for that address, we sent password reset instructions."
      >
        <p className="text-sm text-muted-foreground">
          Did not receive it? Check spam or contact your CA firm administrator to reset your password.
        </p>
        <Link to="/login" className="btn-primary inline-flex mt-6 w-full justify-center py-3">
          Return to sign in
        </Link>
      </PublicAuthShell>
    );
  }

  return (
    <PublicAuthShell
      title="Reset your password"
      subtitle="Enter the email linked to your AuditIQ account. We will send reset instructions if the account exists."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type="email"
            id="forgot-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder=" "
            required
            autoComplete="email"
            className="input-floating"
          />
          <label htmlFor="forgot-email" className="input-floating-label">
            Work email
          </label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 disabled:opacity-70">
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </PublicAuthShell>
  );
}
