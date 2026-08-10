import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Plus,
  PencilSimple as Edit2,
  Trash as Trash2,
  CaretDown as ChevronDown,
  CaretUp as ChevronUp,
  SpinnerGap as Loader2,
} from '@phosphor-icons/react';
import api from '../../services/api';
import { appAlert, appConfirm } from '../../context/AppDialogContext';
import { useAuth } from '../../context/AuthContext';
import type { Role, PermissionItem } from '../../types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ACTION_LABELS, MODULE_LABELS } from './settingsConstants';
import { clickableDivProps } from '@/lib/interactiveProps';

function PermissionsGrid({ permissions }: { permissions: PermissionItem[] }) {
  const grouped = permissions.reduce<Record<string, string[]>>((acc, p) => {
    (acc[p.module] = acc[p.module] || []).push(p.action);
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Object.entries(grouped).map(([module, actions]) => (
        <Card key={module} className="p-3">
          <p className="text-xs font-semibold text-foreground capitalize mb-2">{MODULE_LABELS[module]?.label || module}</p>
          <div className="flex flex-wrap gap-1">
            {actions.map((a) => (
              <Badge key={a} variant="secondary" className="text-[10px]">
                {ACTION_LABELS[a] || a}
              </Badge>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RoleForm({
  role,
  allPermissions,
  onSaved,
  onCancel,
}: {
  role: Role | null;
  allPermissions: PermissionItem[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(
    new Set(role?.permissions.map((p) => p.id) || [])
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const grouped = allPermissions.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.module] = acc[p.module] || []).push(p);
    return acc;
  }, {});

  const togglePerm = (id: string) => {
    const next = new Set(selectedPerms);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedPerms(next);
  };

  const toggleModule = (module: string) => {
    const modulePerms = grouped[module];
    const allSelected = modulePerms.every((p) => selectedPerms.has(p.id));
    const next = new Set(selectedPerms);
    modulePerms.forEach((p) => {
      if (allSelected) next.delete(p.id); else next.add(p.id);
    });
    setSelectedPerms(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { name, description, permissionIds: Array.from(selectedPerms) };
      if (role) {
        await api.put(`/admin/roles/${role.id}`, payload);
      } else {
        await api.post('/admin/roles', payload);
      }
      window.dispatchEvent(
        new CustomEvent('auditiq:permissions-updated', { detail: { roleName: name } })
      );
      if (user?.role === name || user?.role === role?.name) {
        await refreshUser();
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save role');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-6">
      <CardHeader className="p-0 pb-4">
        <CardTitle>{role ? 'Edit Role' : 'Create New Role'}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="roleName">Role Name</Label>
              <Input id="roleName" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleDesc">Description</Label>
              <Input id="roleDesc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="mb-3 block">Permissions</Label>
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    {Object.keys(ACTION_LABELS).map((a) => (
                      <TableHead key={a} className="text-center">{ACTION_LABELS[a]}</TableHead>
                    ))}
                    <TableHead className="text-center">All</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(grouped).map(([module, perms]) => {
                    const allChecked = perms.every((p) => selectedPerms.has(p.id));
                    return (
                      <TableRow key={module}>
                        <TableCell className="font-medium capitalize">{MODULE_LABELS[module]?.label || module}</TableCell>
                        {Object.keys(ACTION_LABELS).map((action) => {
                          const perm = perms.find((p) => p.action === action);
                          return (
                            <TableCell key={action} className="text-center">
                              {perm ? (
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={selectedPerms.has(perm.id)}
                                  aria-label={`${MODULE_LABELS[module]?.label || module} ${ACTION_LABELS[action]} permission`}
                                  onClick={() => togglePerm(perm.id)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                                    selectedPerms.has(perm.id) ? 'bg-primary' : 'bg-input-border'
                                  }`}
                                >
                                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
                                    selectedPerms.has(perm.id) ? 'translate-x-4' : 'translate-x-0'
                                  }`} />
                                </button>
                              ) : (
                                <span className="text-foreground-muted">—</span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={allChecked}
                            aria-label={`${MODULE_LABELS[module]?.label || module} all permissions`}
                            onClick={() => toggleModule(module)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                              allChecked ? 'bg-primary' : 'bg-input-border'
                            }`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
                              allChecked ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SettingsRolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get('/admin/roles'),
        api.get('/admin/permissions'),
      ]);
      setRoles(rolesRes.data);
      setAllPermissions(permsRes.data);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: 'Delete role',
      message: 'Are you sure you want to delete this role?',
      destructive: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/roles/${id}`);
      fetchData();
    } catch (err: any) {
      await appAlert({ title: 'Could not delete role', message: err.response?.data?.error || 'Failed to delete role' });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-muted">
          {roles.length} roles configured • Toggle module permissions to show or hide sidebar items in real time
        </p>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Role
        </Button>
      </div>

      {(showCreate || editingRole) && (
        <RoleForm
          role={editingRole}
          allPermissions={allPermissions}
          onSaved={() => { setShowCreate(false); setEditingRole(null); fetchData(); }}
          onCancel={() => { setShowCreate(false); setEditingRole(null); }}
        />
      )}

      <div className="space-y-3">
        {roles.map((role) => (
          <Card key={role.id} className="overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-accent transition-colors"
              {...clickableDivProps(
                () => setExpandedRole(expandedRole === role.id ? null : role.id),
                expandedRole === role.id ? `Collapse ${role.name} role` : `Expand ${role.name} role`
              )}
            >
              <div className="flex items-center gap-3">
                <div className="icon-well-md">
                  <Shield size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{role.name}</h3>
                    {role.isSystem && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                  </div>
                  <p className="text-xs text-foreground-muted">{role.description || 'No description'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-foreground-muted">{role.userCount} users</span>
                <span className="text-sm text-foreground-muted">{role.permissions.length} permissions</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditingRole(role); }}>
                    <Edit2 size={14} />
                  </Button>
                  {!role.isSystem && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(role.id); }}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
                {expandedRole === role.id ? <ChevronUp size={16} className="text-foreground-muted" /> : <ChevronDown size={16} className="text-foreground-muted" />}
              </div>
            </div>

            {expandedRole === role.id && (
              <div className="border-t border-border px-5 py-4">
                <PermissionsGrid permissions={role.permissions} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
