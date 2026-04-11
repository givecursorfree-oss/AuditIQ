import { useState, useEffect, useCallback } from 'react';
import {
  Users, Shield, Building2, Plus, Search, Edit2, Trash2,
  Check, X, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
  UserPlus, Eye, Pencil, FileText, Download, ThumbsUp,
  History,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { User, Role, PermissionItem, Firm } from '../types';

type Tab = 'users' | 'roles' | 'firm' | 'audit-log';

// ─── Permission module labels ───
const MODULE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  dashboard: { label: 'Dashboard', icon: Eye },
  engagements: { label: 'Engagements', icon: FileText },
  workpapers: { label: 'Workpapers', icon: Pencil },
  documents: { label: 'Documents', icon: FileText },
  reports: { label: 'Reports', icon: Download },
  attendance: { label: 'Attendance', icon: Users },
  copilot: { label: 'AI Copilot', icon: Eye },
  settings: { label: 'Settings', icon: Shield },
  clients: { label: 'Clients', icon: Building2 },
};

const ACTION_LABELS: Record<string, string> = {
  view: 'View', create: 'Create', edit: 'Edit',
  delete: 'Delete', approve: 'Approve', export: 'Export',
};

export default function Settings() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<Tab>('users');

  // Only allow Partner/Admin access
  if (currentUser && !['Partner', 'Admin', 'Manager'].includes(currentUser.role)) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield size={48} className="mx-auto text-foreground-muted mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Access Restricted</h2>
          <p className="text-foreground-muted">You don&apos;t have permission to access settings.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'users' as Tab, label: 'Users', icon: Users },
    { id: 'roles' as Tab, label: 'Roles & Permissions', icon: Shield },
    { id: 'firm' as Tab, label: 'Firm Settings', icon: Building2 },
    { id: 'audit-log' as Tab, label: 'Audit Log', icon: History },
  ];

  // Hide Roles/Firm tabs from Manager
  const visibleTabs = currentUser?.role === 'Manager'
    ? tabs.filter((t) => t.id === 'users')
    : tabs;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-foreground-muted mt-1">Manage users, roles, permissions and firm configuration</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-surface rounded-xl p-1 border border-border w-full sm:w-fit overflow-x-auto">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-primary text-white shadow-sm'
                : 'text-foreground-muted hover:text-foreground hover:bg-hover-bg'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'firm' && <FirmTab />}
      {tab === 'audit-log' && <AuditLogTab />}
    </div>
  );
}

// ─────────────────────────────────────────────────
// USERS TAB
// ─────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
      console.error('Toggle user error:', err);
    }
  };

  const handleRoleChange = async (userId: string, roleId: string) => {
    try {
      await api.put(`/admin/users/${userId}`, { roleId });
      fetchData();
      setEditingId(null);
    } catch (err) {
      console.error('Change role error:', err);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <UserPlus size={16} /> Add User
        </button>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <CreateUserForm
          roles={roles}
          onCreated={() => { setShowCreate(false); fetchData(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Users Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">User</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Email</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Role</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Designation</th>
              <th className="text-center px-4 py-3 font-medium text-foreground-muted">Status</th>
              <th className="text-center px-4 py-3 font-medium text-foreground-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-hover-bg transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                      {u.initials}
                    </div>
                    <span className="font-medium text-foreground">{u.firstName} {u.lastName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-foreground-muted">{u.email}</td>
                <td className="px-4 py-3">
                  {editingId === u.id ? (
                    <select
                      defaultValue={u.roleRef?.id || ''}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      onBlur={() => setEditingId(null)}
                      autoFocus
                      className="bg-surface border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditingId(u.id)}
                      className="flex items-center gap-1 group"
                    >
                      <RoleBadge role={u.role} />
                      <Edit2 size={12} className="text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-foreground-muted">{u.designation || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <button
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
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => setEditingId(u.id)}
                    className="p-1.5 rounded hover:bg-hover-bg text-foreground-muted hover:text-foreground transition-colors"
                    title="Edit user"
                  >
                    <Edit2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Create User Form ───
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
    <div className="bg-card rounded-xl border border-border p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Create New User</h3>
      {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InputField label="First Name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} required />
        <InputField label="Last Name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} required />
        <InputField label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
        <InputField label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Role</label>
          <select
            value={form.roleId}
            onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <InputField label="Designation" value={form.designation} onChange={(v) => setForm({ ...form, designation: v })} />
        <InputField label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <div className="col-span-1 sm:col-span-2 flex justify-end gap-3 mt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-foreground-muted hover:text-foreground border border-border hover:bg-hover-bg transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {submitting ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────
// ROLES TAB
// ─────────────────────────────────────────────────
function RolesTab() {
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
    if (!confirm('Are you sure you want to delete this role?')) return;
    try {
      await api.delete(`/admin/roles/${id}`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete role');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-muted">
          {roles.length} roles configured • Admin can create custom roles and assign permissions
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> New Role
        </button>
      </div>

      {/* Create/Edit Role Form */}
      {(showCreate || editingRole) && (
        <RoleForm
          role={editingRole}
          allPermissions={allPermissions}
          onSaved={() => { setShowCreate(false); setEditingRole(null); fetchData(); }}
          onCancel={() => { setShowCreate(false); setEditingRole(null); }}
        />
      )}

      {/* Roles List */}
      <div className="space-y-3">
        {roles.map((role) => (
          <div key={role.id} className="bg-card rounded-xl border border-border overflow-hidden">
            {/* Role Header */}
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-hover-bg transition-colors"
              onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center text-primary">
                  <Shield size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{role.name}</h3>
                    {role.isSystem && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-foreground-muted/20 text-foreground-muted rounded font-medium">System</span>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted">{role.description || 'No description'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-foreground-muted">{role.userCount} users</span>
                <span className="text-sm text-foreground-muted">{role.permissions.length} permissions</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingRole(role); }}
                    className="p-1.5 rounded hover:bg-hover-bg text-foreground-muted hover:text-foreground transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  {!role.isSystem && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(role.id); }}
                      className="p-1.5 rounded hover:bg-danger/10 text-foreground-muted hover:text-danger transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {expandedRole === role.id ? <ChevronUp size={16} className="text-foreground-muted" /> : <ChevronDown size={16} className="text-foreground-muted" />}
              </div>
            </div>

            {/* Expanded Permissions Grid */}
            {expandedRole === role.id && (
              <div className="border-t border-border px-5 py-4">
                <PermissionsGrid permissions={role.permissions} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Role Create/Edit Form ───
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
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(
    new Set(role?.permissions.map((p) => p.id) || [])
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Group permissions by module
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
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save role');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">{role ? 'Edit Role' : 'Create New Role'}</h3>
      {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Role Name" value={name} onChange={setName} required />
          <InputField label="Description" value={description} onChange={setDescription} />
        </div>

        {/* Permissions Matrix */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-3">Permissions</label>
          <div className="bg-surface rounded-lg border border-border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 font-medium text-foreground-muted">Module</th>
                  {Object.keys(ACTION_LABELS).map((a) => (
                    <th key={a} className="text-center px-2 py-2 font-medium text-foreground-muted">{ACTION_LABELS[a]}</th>
                  ))}
                  <th className="text-center px-2 py-2 font-medium text-foreground-muted">All</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([module, perms]) => {
                  const allChecked = perms.every((p) => selectedPerms.has(p.id));
                  return (
                    <tr key={module} className="border-b border-border last:border-0 hover:bg-hover-bg">
                      <td className="px-4 py-2 font-medium text-foreground capitalize">{MODULE_LABELS[module]?.label || module}</td>
                      {Object.keys(ACTION_LABELS).map((action) => {
                        const perm = perms.find((p) => p.action === action);
                        return (
                          <td key={action} className="text-center px-2 py-2">
                            {perm ? (
                              <input
                                type="checkbox"
                                checked={selectedPerms.has(perm.id)}
                                onChange={() => togglePerm(perm.id)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50 cursor-pointer"
                              />
                            ) : (
                              <span className="text-foreground-muted">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center px-2 py-2">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={() => toggleModule(module)}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50 cursor-pointer"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-foreground-muted hover:text-foreground border border-border hover:bg-hover-bg transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {submitting ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Permissions Grid (read-only view) ───
function PermissionsGrid({ permissions }: { permissions: PermissionItem[] }) {
  const grouped = permissions.reduce<Record<string, string[]>>((acc, p) => {
    (acc[p.module] = acc[p.module] || []).push(p.action);
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-3 gap-3">
      {Object.entries(grouped).map(([module, actions]) => (
        <div key={module} className="bg-surface rounded-lg p-3 border border-border">
          <p className="text-xs font-semibold text-foreground capitalize mb-2">{MODULE_LABELS[module]?.label || module}</p>
          <div className="flex flex-wrap gap-1">
            {actions.map((a) => (
              <span key={a} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium">
                {ACTION_LABELS[a] || a}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────
// FIRM TAB
// ─────────────────────────────────────────────────
function FirmTab() {
  const [firm, setFirm] = useState<Firm | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Firm>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/admin/firm')
      .then(({ data }) => { setFirm(data); setForm(data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put('/admin/firm', form);
      setFirm(data);
      setEditing(false);
    } catch (err) {
      console.error('Failed to update firm:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const fields: { key: keyof Firm; label: string }[] = [
    { key: 'name', label: 'Firm Name' },
    { key: 'registrationNo', label: 'FRN' },
    { key: 'pan', label: 'PAN' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'pincode', label: 'Pincode' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'website', label: 'Website' },
  ];

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Firm Profile</h3>
          <p className="text-sm text-foreground-muted">Manage your CA firm details and contact information</p>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-hover-bg transition-colors">
            <Edit2 size={14} /> Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setForm(firm || {}); }} className="px-4 py-2 rounded-lg text-sm text-foreground-muted border border-border hover:bg-hover-bg transition-colors">
              <X size={14} />
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              <Check size={14} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-foreground-muted mb-1">{label}</label>
            {editing ? (
              <input
                type="text"
                value={(form as Record<string, any>)[key] || ''}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            ) : (
              <p className="text-sm text-foreground py-2">{(firm as Record<string, any>)?.[key] || '—'}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// AUDIT LOG TAB
// ─────────────────────────────────────────────────
function AuditLogTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    api.get(`/admin/audit-logs?page=${page}&limit=25`)
      .then(({ data }) => {
        setLogs(data.logs);
        setTotalPages(data.totalPages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Timestamp</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">User</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Action</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Entity</th>
              <th className="text-left px-4 py-3 font-medium text-foreground-muted">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-border last:border-0 hover:bg-hover-bg transition-colors">
                <td className="px-4 py-3 text-foreground-muted text-xs">
                  {new Date(log.createdAt).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3">
                  {log.user ? (
                    <span className="text-foreground">{log.user.firstName} {log.user.lastName}</span>
                  ) : (
                    <span className="text-foreground-muted">System</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium px-2 py-0.5 bg-primary/10 text-primary rounded">{log.action}</span>
                </td>
                <td className="px-4 py-3 text-foreground-muted">{log.entity}</td>
                <td className="px-4 py-3 text-foreground-muted text-xs max-w-xs truncate">{log.details || '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-foreground-muted">No audit logs found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded border border-border text-sm text-foreground-muted hover:text-foreground hover:bg-hover-bg disabled:opacity-50 transition-colors"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-foreground-muted">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded border border-border text-sm text-foreground-muted hover:text-foreground hover:bg-hover-bg disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    Admin: 'bg-danger/15 text-danger',
    Partner: 'bg-primary/15 text-primary',
    Manager: 'bg-purple-500/15 text-purple-400',
    Staff: 'bg-success/15 text-success',
    Intern: 'bg-warning/15 text-warning',
    Client: 'bg-foreground-muted/15 text-foreground-muted',
  };

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors[role] || colors.Staff}`}>
      {role}
    </span>
  );
}

function InputField({
  label,
  type = 'text',
  value,
  onChange,
  required = false,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </div>
  );
}
