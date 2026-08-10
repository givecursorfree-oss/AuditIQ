import { useState } from 'react';
import { ShieldCheck, Copy, Check } from '@phosphor-icons/react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SetupData {
  secret: string;
  otpauthUri: string;
}

export default function TwoFactorSettings() {
  const { user, refreshUser } = useAuth();
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  const enabled = Boolean(user?.twoFactorEnabled);
  const eligible = ['Partner', 'Admin'].includes(user?.role ?? '');

  const extractError = (err: unknown) =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Something went wrong';

  const startSetup = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/2fa/setup');
      setSetup({ secret: data.secret, otpauthUri: data.otpauthUri });
      setCode('');
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/2fa/enable', { code });
      setSetup(null);
      setSuccess('Two-factor authentication is now enabled. You will be asked for a code at every sign-in.');
      await refreshUser();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/2fa/disable', { password: disablePassword, code: disableCode });
      setShowDisable(false);
      setDisablePassword('');
      setDisableCode('');
      setSuccess('Two-factor authentication has been disabled.');
      await refreshUser();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  const copySecret = async () => {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (!eligible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck size={20} /> Two-Factor Authentication</CardTitle>
          <CardDescription>
            TOTP two-factor authentication is currently available for Partner and Admin accounts.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck size={20} /> Two-Factor Authentication</CardTitle>
            <CardDescription className="mt-1.5">
              Protect your account with time-based one-time codes from an authenticator app
              (Google Authenticator, Microsoft Authenticator, Authy, 1Password).
            </CardDescription>
          </div>
          <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}

        {!enabled && !setup && (
          <Button onClick={startSetup} disabled={loading}>
            {loading ? 'Preparing…' : 'Set up two-factor authentication'}
          </Button>
        )}

        {!enabled && setup && (
          <form onSubmit={confirmEnable} className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
              <p className="text-sm font-medium">1. Add this account to your authenticator app</p>
              <p className="text-xs text-muted-foreground break-all">
                Open your authenticator app, choose &ldquo;Enter a setup key&rdquo;, and paste the secret below
                (account: {user?.email}, type: time-based).
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-background px-3 py-2 text-sm font-mono tracking-wider break-all border border-border">
                  {setup.secret}
                </code>
                <Button type="button" variant="outline" size="icon" onClick={copySecret} title="Copy secret">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground break-all">
                Or use this link on a device with an authenticator installed:{' '}
                <a href={setup.otpauthUri} className="text-primary underline underline-offset-2">open in authenticator</a>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="totp-enable-code">2. Enter the 6-digit code shown in the app</Label>
              <Input
                id="totp-enable-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="max-w-[160px] text-center font-mono tracking-[0.3em]"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading || code.length !== 6}>
                {loading ? 'Verifying…' : 'Verify and enable'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setSetup(null); setError(''); }}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {enabled && !showDisable && (
          <Button variant="outline" onClick={() => { setShowDisable(true); setSuccess(''); setError(''); }}>
            Disable two-factor authentication
          </Button>
        )}

        {enabled && showDisable && (
          <form onSubmit={disable} className="space-y-4 max-w-sm">
            <p className="text-sm text-muted-foreground">
              Confirm your password and a current authenticator code to disable 2FA.
            </p>
            <div className="space-y-2">
              <Label htmlFor="disable-password">Password</Label>
              <Input
                id="disable-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disable-code">Authenticator code</Label>
              <Input
                id="disable-code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="123456"
                className="max-w-[160px] text-center font-mono tracking-[0.3em]"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={loading || !disablePassword || disableCode.length !== 6}>
                {loading ? 'Disabling…' : 'Disable 2FA'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowDisable(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
