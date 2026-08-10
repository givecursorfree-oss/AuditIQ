import { useState, useEffect, useCallback } from 'react';
import {
  MagnifyingGlass as Search,
  PencilSimple as Edit2,
  ToggleLeft,
  ToggleRight,
  UserPlus,
  Key as KeyRound,
  SpinnerGap as Loader2,
} from '@phosphor-icons/react';
import api from '../../services/api';
import { appAlert } from '../../context/AppDialogContext';
import type { User, Role } from '../../types';
import { getApiErrorMessage } from '@/lib/formPayload';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ROLE_BADGE_VARIANTS: Record<string, 'destructive' | 'default' | 'secondary' | 'success' | 'warning' | 'outline'> = {
  Admin: 'destructive',
  Partner: 'default',
  Manager: 'secondary',
  Staff: 'success',
  Intern: 'warning',
  Client: 'outline',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={ROLE_BADGE_VARIANTS[role] || 'secondary'}>
      {role}
    </Badge>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onSaved,
}: {
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await api.put(`/admin/users/${user.id}`, { password });
      onSaved();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || 'Failed to update password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new login password for {user?.firstName} {user?.lastName} ({user?.email})
          </DialogDescription>
        </DialogHeader>
        <form key={user?.id} onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Update password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserForm({
  roles,
  onCreated,
  onCancel,
}: {
  roles: Role[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    email: '', password: '', firstName: '', lastName: '',
    roleId: roles[0]?.id || '', designation: '', phone: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/admin/users', form);
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name</Label>
          <Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name</Label>
          <Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="roleId">Role</Label>
          <select
            id="roleId"
            value={form.roleId}
            onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input-border bg-input-bg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="designation">Designation</Label>
          <Input id="designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitting ? 'Creating...' : 'Create User'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function SettingsUsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/roles'),
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = users.filter((u) =>
    `${u.firstName} ${u.lastName} ${u.email} ${u.role}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      await api.put(`/admin/users/${userId}`, { isActive: !isActive });
      fetchData();
    } catch (err) {
      await appAlert({ title: 'Could not update user', message: getApiErrorMessage(err, 'Failed to update user status') });
    }
  };

  const handleRoleChange = async (userId: string, roleId: string) => {
    try {
      await api.put(`/admin/users/${userId}`, { roleId });
      fetchData();
      setEditingId(null);
    } catch (err) {
      await appAlert({ title: 'Could not change role', message: getApiErrorMessage(err, 'Failed to change role') });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <UserPlus size={16} className="mr-2" /> Add User
        </Button>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>Add a new employee with login credentials</DialogDescription>
          </DialogHeader>
          <CreateUserForm
            roles={roles}
            onCreated={() => { setShowCreate(false); fetchData(); }}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

      <ResetPasswordDialog
        user={resetUser}
        onClose={() => setResetUser(null)}
        onSaved={() => { setResetUser(null); fetchData(); }}
      />

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                      {u.initials}
                    </div>
                    <span className="font-medium text-foreground">{u.firstName} {u.lastName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-foreground-muted">{u.email}</TableCell>
                <TableCell>
                  {editingId === u.id ? (
                    <select
                      defaultValue={u.roleRef?.id || ''}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      onBlur={() => setEditingId(null)}
                      autoFocus
                      className="bg-surface border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingId(u.id)}
                      className="flex items-center gap-1 group"
                    >
                      <RoleBadge role={u.role} />
                      <Edit2 size={12} className="text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-foreground-muted">{u.designation || '—'}</TableCell>
                <TableCell className="text-center">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(u.id, u.isActive)}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${
                      u.isActive
                        ? 'bg-success/15 text-success'
                        : 'bg-danger/15 text-danger'
                    }`}
                  >
                    {u.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    {u.isActive ? 'Active' : 'Inactive'}
                  </button>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setResetUser(u)}
                      title="Reset password"
                      className="h-8 w-8"
                    >
                      <KeyRound size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingId(u.id)}
                      title="Change role"
                      className="h-8 w-8"
                    >
                      <Edit2 size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-foreground-muted py-8">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
