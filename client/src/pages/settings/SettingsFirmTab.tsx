import { useState, useEffect } from 'react';
import {
  PencilSimple as Edit2,
  Check,
  X,
  SpinnerGap as Loader2,
} from '@phosphor-icons/react';
import api from '../../services/api';
import { appAlert } from '../../context/AppDialogContext';
import type { Firm } from '../../types';
import { getApiErrorMessage, pickFormPayload } from '@/lib/formPayload';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const FIRM_FIELD_KEYS = [
  'name', 'registrationNo', 'pan', 'gstin', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'website',
] as const;

const FIRM_FIELDS: { key: keyof Firm; label: string }[] = [
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

export default function SettingsFirmTab() {
  const [firm, setFirm] = useState<Firm | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Firm>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/firm')
      .then(({ data }) => { setFirm(data); setForm(data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form.name?.trim()) {
      setError('Firm name is required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = pickFormPayload(form as Record<string, unknown>, [...FIRM_FIELD_KEYS]);
      const { data } = await api.put('/admin/firm', payload);
      setFirm(data);
      setForm(data);
      setEditing(false);
      await appAlert({ title: 'Saved', message: 'Firm settings updated successfully.' });
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to update firm settings');
      setError(message);
      await appAlert({ title: 'Could not save', message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Firm Profile</CardTitle>
          <CardDescription>Manage your CA firm details and contact information</CardDescription>
        </div>
        {!editing ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Edit2 size={14} /> Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => { setEditing(false); setForm(firm || {}); setError(''); }}>
              <X size={14} />
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check size={14} />}
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIRM_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <Label>{label}</Label>
              {editing ? (
                <Input
                  value={(form as Record<string, any>)[key] || ''}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              ) : (
                <p className="text-sm text-foreground py-2">{(firm as Record<string, any>)?.[key] || '—'}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
