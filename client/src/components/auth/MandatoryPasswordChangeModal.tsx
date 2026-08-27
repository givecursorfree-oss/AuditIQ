import React, { useState } from 'react';
import { ShieldCheck, Lock, Eye, EyeSlash, CheckCircle, XCircle } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PASSWORD_STRENGTH = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;

export function MandatoryPasswordChangeModal() {
  const { user, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = Boolean(user && user.mustChangePassword);

  if (!isOpen) return null;

  const hasLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*]/.test(newPassword);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;
  const isValid = hasLength && hasUpper && hasNumber && hasSpecial && matches && currentPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Please enter your current temporary password.');
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
      await refreshUser();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to update password. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock size={24} weight="bold" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            Mandatory Password Change
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-foreground-muted">
            For firm security, please update your temporary login password before accessing the system.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="current-pwd">Current / Temporary Password</Label>
            <div className="relative">
              <Input
                id="current-pwd"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter temporary password"
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
                {showCurrent ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-pwd">New Password</Label>
            <div className="relative">
              <Input
                id="new-pwd"
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
                {showNew ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-pwd">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirm-pwd"
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
                {showConfirm ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Real-time complexity check */}
          <div className="space-y-1 rounded-md border border-border/50 bg-surface/50 p-3 text-xs">
            <p className="font-semibold text-foreground-muted mb-1.5">Password Requirements:</p>
            <div className="grid grid-cols-2 gap-1.5 text-foreground-muted">
              <span className={`flex items-center gap-1.5 ${hasLength ? 'text-emerald-500' : ''}`}>
                {hasLength ? <CheckCircle size={14} weight="fill" /> : <XCircle size={14} />}
                8+ characters
              </span>
              <span className={`flex items-center gap-1.5 ${hasUpper ? 'text-emerald-500' : ''}`}>
                {hasUpper ? <CheckCircle size={14} weight="fill" /> : <XCircle size={14} />}
                1 uppercase letter
              </span>
              <span className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-500' : ''}`}>
                {hasNumber ? <CheckCircle size={14} weight="fill" /> : <XCircle size={14} />}
                1 number
              </span>
              <span className={`flex items-center gap-1.5 ${hasSpecial ? 'text-emerald-500' : ''}`}>
                {hasSpecial ? <CheckCircle size={14} weight="fill" /> : <XCircle size={14} />}
                1 special char (!@#$%)
              </span>
            </div>
            {newPassword.length > 0 && confirmPassword.length > 0 && (
              <div className={`mt-2 flex items-center gap-1.5 pt-1 border-t border-border/40 ${matches ? 'text-emerald-500' : 'text-danger'}`}>
                {matches ? <CheckCircle size={14} weight="fill" /> : <XCircle size={14} />}
                {matches ? 'Passwords match' : 'Passwords do not match'}
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={loading || !isValid}
          >
            <ShieldCheck size={18} />
            {loading ? 'Updating password…' : 'Set New Password & Continue'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
