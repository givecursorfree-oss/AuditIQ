import { useEffect, useState } from 'react';

import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { CheckCircle, Warning, ArrowRight } from '@phosphor-icons/react';

import api from '../services/api';

import { PublicAuthShell } from '@/components/layout/PublicAuthShell';

import { Button } from '@/components/ui/button';

type VerifyState =
  | { status: 'loading' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [state, setState] = useState<VerifyState>({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'Verification link is invalid.' });
      return;
    }

    const controller = new AbortController();
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    api
      .get(`/auth/verify-email?token=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(({ data }) => {
        setState({
          status: 'success',
          message: data.message || 'Email verified successfully.',
        });
        redirectTimer = setTimeout(() => navigate('/login?verified=1'), 2500);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: err?.response?.data?.error || 'Verification failed. The link may have expired.',
        });
      });

    return () => {
      controller.abort();
      if (redirectTimer !== undefined) clearTimeout(redirectTimer);
    };
  }, [token, navigate]);

  if (state.status === 'loading') {
    return (
      <PublicAuthShell title="Verify email" subtitle="Confirming your email address…">
        <div className="flex flex-col items-center py-6">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Verifying your email…</p>
        </div>
      </PublicAuthShell>
    );
  }

  if (state.status === 'success') {
    return (
      <PublicAuthShell title="Email verified" subtitle={state.message}>
        <div className="flex flex-col items-center py-4 text-center">
          <div className="w-14 h-14 bg-success/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle size={32} weight="fill" className="text-success" />
          </div>
          <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
        </div>
      </PublicAuthShell>
    );
  }

  return (
    <PublicAuthShell title="Verification failed" subtitle={state.message}>
      <div className="flex flex-col items-center py-4 text-center gap-4">
        <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center">
          <Warning size={32} className="text-destructive" />
        </div>
        <Button asChild>
          <Link to="/login">
            Go to sign in
            <ArrowRight size={16} className="ml-2" />
          </Link>
        </Button>
      </div>
    </PublicAuthShell>
  );
}
