import { useState } from 'react';
import { ShieldCheck, Copy, Check, Key, Lock, Eye, EyeSlash, CheckCircle, XCircle } from '@phosphor-icons/react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { appAlert } from '@/context/AppDialogContext';

interface SetupData {
  secret: string;
  otpauthUri: string;
}

const PASSWORD_STRENGTH = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*]/.test(newPassword);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;
  const isValid = hasLength && hasUpper && hasNumber && hasSpecial && matches && currentPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Please enter your current password.');
      return;
    }
    if (!PASSWORD_STRENGTH.test(newPassword)) {
      setError('New password does not satisfy all complexity requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Your password has been changed successfully.');
      await appAlert({
        title: 'Password Updated',
        message: 'Your account password has been updated successfully.',
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to change password. Please verify your current password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Key size={20} className="text-primary" />
          <CardTitle>Change Password</CardTitle>
        </div>
        <CardDescription>
          Update your login password regularly to keep your account secure.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sec-current-pwd">Current Password</Label>
            <div className="relative">
              <Input
                id="sec-current-pwd"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
              >
                {showCurrent ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sec-new-pwd">New Password</Label>
            <div className="relative">
              <Input
                id="sec-new-pwd"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Create new password"
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
              >
                {showNew ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sec-confirm-pwd">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="sec-confirm-pwd"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
              >
                {showConfirm ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Real-time complexity check */}
          <div className="space-y-1 rounded-md border border-border/50 bg-surface/50 p-3 text-xs">
            <p className="font-semibold text-foreground-muted mb-1">Password Requirements:</p>
            <div className="grid grid-cols-2 gap-1 text-foreground-muted">
              <span className={`flex items-center gap-1.5 ${hasLength ? 'text-emerald-500' : ''}`}>
                {hasLength ? <CheckCircle size={13} weight="fill" /> : <XCircle size={13} />}
                8+ characters
              </span>
              <span className={`flex items-center gap-1.5 ${hasUpper ? 'text-emerald-500' : ''}`}>
                {hasUpper ? <CheckCircle size={13} weight="fill" /> : <XCircle size={13} />}
                1 uppercase letter
              </span>
              <span className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-500' : ''}`}>
                {hasNumber ? <CheckCircle size={13} weight="fill" /> : <XCircle size={13} />}
                1 number
              </span>
              <span className={`flex items-center gap-1.5 ${hasSpecial ? 'text-emerald-500' : ''}`}>
                {hasSpecial ? <CheckCircle size={13} weight="fill" /> : <XCircle size={13} />}
                1 special char (!@#$%)
              </span>
            </div>
            {newPassword.length > 0 && confirmPassword.length > 0 && (
              <div className={`mt-1.5 flex items-center gap-1.5 pt-1 border-t border-border/40 ${matches ? 'text-emerald-500' : 'text-danger'}`}>
                {matches ? <CheckCircle size={13} weight="fill" /> : <XCircle size={13} />}
                {matches ? 'Passwords match' : 'Passwords do not match'}
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="gap-2"
            disabled={loading || !isValid}
          >
            <Lock size={16} />
            {loading ? 'Updating password…' : 'Update Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
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

  const copySecret = () => {
    if (!setup?.secret) return;
    navigator.clipboard.writeText(setup.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* ── User Self-Service Password Change ── */}
      <ChangePasswordCard />

      {/* ── Two-Factor Authentication ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-primary" />
              <CardTitle>Two-Factor Authentication (TOTP)</CardTitle>
            </div>
            <Badge variant={enabled ? 'success' : 'secondary'}>
              {enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <CardDescription>
            Add an extra layer of security to your account using an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!eligible && (
            <p className="text-sm text-muted-foreground">
              Two-factor authentication is currently available for Partner and Admin roles.
            </p>
          )}

          {eligible && error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {eligible && success && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
              {success}
            </div>
          )}

          {eligible && !enabled && !setup && (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                When enabled, you will need your password and a verification code from your authenticator app to sign in.
              </p>
              <Button onClick={startSetup} disabled={loading}>
                {loading ? 'Preparing…' : 'Set up two-factor authentication'}
              </Button>
            </div>
          )}

          {eligible && !enabled && setup && (
            <form onSubmit={confirmEnable} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>1. Add this key to your authenticator app</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={setup.secret}
                    className="font-mono text-sm tracking-wider"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copySecret}
                    title="Copy secret"
                  >
                    {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Account: <span className="font-mono">{user?.email}</span> · Issuer: <span className="font-mono">AuditIQ</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="twofa-code">2. Enter the 6-digit code from your app</Label>
                <Input
                  id="twofa-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  inputMode="numeric"
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
    </div>
  );
}
