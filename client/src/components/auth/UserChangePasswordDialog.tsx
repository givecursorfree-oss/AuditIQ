import React, { useState } from 'react';
import { Key, Lock, Eye, EyeSlash, CheckCircle, XCircle } from '@phosphor-icons/react';
import api from '@/services/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { appAlert } from '@/context/AppDialogContext';

const PASSWORD_STRENGTH = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;

interface UserChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserChangePasswordDialog({ open, onOpenChange }: UserChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

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
      handleOpenChange(false);
      await appAlert({
        title: 'Password Updated',
        message: 'Your account password has been changed successfully.',
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to change password. Please verify your current password and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-2">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Key size={22} weight="bold" />
          </div>
          <DialogTitle className="text-center text-lg font-bold">
            Change Your Password
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-foreground-muted">
            Enter your current password and choose a secure new password for your account.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          <div className="space-y-1">
            <Label htmlFor="current-account-pwd">Current Password</Label>
            <div className="relative">
              <Input
                id="current-account-pwd"
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

          <div className="space-y-1">
            <Label htmlFor="new-account-pwd">New Password</Label>
            <div className="relative">
              <Input
                id="new-account-pwd"
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

          <div className="space-y-1">
            <Label htmlFor="confirm-account-pwd">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirm-account-pwd"
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
          <div className="space-y-1 rounded-md border border-border/50 bg-surface/50 p-2.5 text-xs">
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

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="gap-1.5"
              disabled={loading || !isValid}
            >
              <Lock size={16} />
              {loading ? 'Updating…' : 'Change Password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
