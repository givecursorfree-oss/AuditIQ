import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Plus, MagnifyingGlass as Search, FileText as FileCheck, CaretDown as ChevronDown, CaretRight as ChevronRight, CheckCircle as CheckCircle2,
  Clock, WarningCircle as AlertCircle, X, ChatCircle as MessageSquare, PaperPlaneTilt as Send
} from '@phosphor-icons/react';
import api from '../services/api';
import type { Workpaper } from '../types';
import { ApprovalStatusBadge } from '@/components/mkd/WorkflowStatusBadge';
import { useAuth } from '../context/AuthContext';
import { appAlert } from '../context/AppDialogContext';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { clickableDivProps, modalBackdropProps } from '@/lib/interactiveProps';

const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft',
  Prepared: 'Prepared',
  'Under Review': 'Under Review',
  Reviewed: 'Reviewed',
  Approved: 'Approved',
  'Needs Revision': 'Needs Revision',
};

export default function Workpapers() {
  const { user } = useAuth();
  const [workpapers, setWorkpapers] = useState<Workpaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchWorkpapers = useCallback(() => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    api.get(`/workpapers?${params.toString()}`)
      .then(({ data }) => setWorkpapers(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filterStatus]);

  const fetchWorkpapersRef = useRef(fetchWorkpapers);
  fetchWorkpapersRef.current = fetchWorkpapers;

  useEffect(() => { fetchWorkpapers(); }, [fetchWorkpapers]);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeUsers, setActiveUsers] = useState<string[]>([]); // simplified for the active expanded workpaper

  useEffect(() => {
    const apiOrigin = import.meta.env.VITE_API_URL
      || (window.location.origin.includes('localhost:5173') ? 'http://localhost:3001' : window.location.origin);
    const newSocket = io(apiOrigin, {
      withCredentials: true,
    });
    setSocket(newSocket);
    return () => { newSocket.close(); };
  }, []);

  useEffect(() => {
    if (socket && expandedId && user) {
      setActiveUsers([]);
      socket.emit('join-workpaper', { workpaperId: expandedId, user: { name: user.firstName } });
      
      const handleUserJoined = (joinedUser: any) => {
        setActiveUsers(prev => [...new Set([...prev, joinedUser.name])]);
      };
      
      const handleUserLeft = (leftUser: any) => {
        setActiveUsers(prev => prev.filter(n => n !== leftUser.name));
      };
      
      const handleUpdated = () => { fetchWorkpapersRef.current(); };

      socket.on('user-joined', handleUserJoined);
      socket.on('user-left', handleUserLeft);
      socket.on('workpaper-updated', handleUpdated);

      return () => {
        socket.emit('leave-workpaper', { workpaperId: expandedId, user: { name: user.firstName } });
        socket.off('user-joined', handleUserJoined);
        socket.off('user-left', handleUserLeft);
        socket.off('workpaper-updated', handleUpdated);
      };
    }
  }, [socket, expandedId, user?.id, user?.firstName]);

  const filtered = workpapers.filter(w =>
    w.title.toLowerCase().includes(search.toLowerCase()) ||
    w.reference.toLowerCase().includes(search.toLowerCase())
  );

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.patch(`/workpapers/${id}/status`, { status });
      fetchWorkpapers();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      void appAlert({ title: 'Update failed', message: ax.response?.data?.error || 'Failed to update workpaper status' });
    }
  };

  return (
    <AppPageContainer className="space-y-6">
      <PageHeader
        title="Workpapers"
        description={`${filtered.length} workpapers`}
        actions={
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus size={16} /> New workpaper
          </Button>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search workpapers..." aria-label="Search workpapers" className="input-field pl-9" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status" className="input-field w-full sm:w-48">
          <option value="">All Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((wp) => (
            <div key={wp.id} className="card">
              <div
                className="flex items-center justify-between cursor-pointer"
                {...clickableDivProps(
                  () => setExpandedId(expandedId === wp.id ? null : wp.id),
                  expandedId === wp.id ? `Collapse ${wp.title}` : `Expand ${wp.title}`
                )}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="icon-well-md">
                    <FileCheck size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{wp.title}</p>
                      <ApprovalStatusBadge status={STATUS_LABEL[wp.status] || wp.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-foreground-muted mt-0.5">
                      <span>{wp.reference}</span>
                      <span>•</span>
                      <span>{wp.type}</span>
                      {wp.section && <><span>•</span><span>{wp.section}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {expandedId === wp.id ? <ChevronDown size={16} className="text-foreground-muted" /> : <ChevronRight size={16} className="text-foreground-muted" />}
                </div>
              </div>

              {expandedId === wp.id && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  {activeUsers.length > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                        Active now: {activeUsers.join(', ')}
                      </p>
                    </div>
                  )}
                  {wp.conclusion && (
                    <p className="text-sm text-foreground-muted"><span className="text-foreground-muted font-medium">Conclusion:</span> {wp.conclusion}</p>
                  )}

                  {/* Audit Steps */}
                  {wp.auditSteps && wp.auditSteps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-foreground-muted uppercase mb-2">Audit Steps</p>
                      <div className="space-y-1">
                        {wp.auditSteps.map((step) => (
                          <div key={step.id} className="flex items-center gap-3 text-sm">
                            {step.isCompleted ? (
                              <CheckCircle2 size={14} className="text-success flex-shrink-0" />
                            ) : (
                              <AlertCircle size={14} className="text-foreground-muted flex-shrink-0" />
                            )}
                            <span className="text-foreground-muted flex-1">{step.description}</span>
                            <span className="text-xs text-foreground-muted">{step.isCompleted ? 'Done' : 'Pending'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    {wp.status === 'Draft' && (
                      <button type="button" onClick={() => handleStatusChange(wp.id, 'Prepared')} className="btn-primary text-xs py-1.5 px-3">Mark Prepared</button>
                    )}
                    {wp.status === 'Prepared' && (
                      <button type="button" onClick={() => handleStatusChange(wp.id, 'Under Review')} className="btn-primary text-xs py-1.5 px-3">Submit for Review</button>
                    )}
                    {wp.status === 'Under Review' && user?.role === 'Manager' && (
                      <>
                        <button type="button" onClick={() => handleStatusChange(wp.id, 'Reviewed')} className="btn-primary text-xs py-1.5 px-3">Approve</button>
                        <button type="button" onClick={() => handleStatusChange(wp.id, 'Needs Revision')} className="btn-danger text-xs py-1.5 px-3">Request Revision</button>
                      </>
                    )}
                    {wp.status === 'Reviewed' && user?.role === 'Partner' && (
                      <button type="button" onClick={() => handleStatusChange(wp.id, 'Approved')} className="btn-primary text-xs py-1.5 px-3">Final Approve</button>
                    )}
                    {wp.status === 'Needs Revision' && (
                      <button type="button" onClick={() => handleStatusChange(wp.id, 'Prepared')} className="btn-secondary text-xs py-1.5 px-3">Resume Work</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-16">
              <FileCheck size={40} className="mx-auto text-foreground-muted mb-3" />
              <p className="text-foreground-muted font-medium">No workpapers found</p>
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateWorkpaperModal onClose={() => setShowCreate(false)} onCreated={fetchWorkpapers} />}
    </AppPageContainer>
  );
}

// ─── Create Workpaper Modal ───
function CreateWorkpaperModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', engagementId: '', type: 'Standard', reference: '', section: '',
  });
  const [engagements, setEngagements] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/engagements').then(({ data }) => {
      const list = (data.engagements || []).map((e: { id: string; title: string }) => ({ id: e.id, title: e.title }));
      setEngagements(list);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/workpapers', form);
      onCreated();
      onClose();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" {...modalBackdropProps(onClose, 'Close create workpaper dialog')}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">New Workpaper</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-hover-bg"><X size={18} className="text-foreground-muted" /></button>
        </div>
        {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="wp-create-title" className="block text-sm font-medium text-foreground-muted mb-1.5">Title</label>
            <input id="wp-create-title" aria-label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="input-field" placeholder="Cash & Bank Balance Working" />
          </div>
          <div>
            <label htmlFor="wp-create-engagement" className="block text-sm font-medium text-foreground-muted mb-1.5">Engagement</label>
            <select id="wp-create-engagement" aria-label="Engagement" value={form.engagementId} onChange={(e) => setForm({ ...form, engagementId: e.target.value })} required className="input-field">
              <option value="">Select engagement</option>
              {engagements.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="wp-create-type" className="block text-sm font-medium text-foreground-muted mb-1.5">Type</label>
              <select id="wp-create-type" aria-label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field">
                <option value="Standard">Standard</option>
                <option value="CARO">CARO</option>
                <option value="SA">SA</option>
                <option value="GST">GST</option>
                <option value="TDS">TDS</option>
                <option value="Lead Schedule">Lead Schedule</option>
              </select>
            </div>
            <div>
              <label htmlFor="wp-create-section" className="block text-sm font-medium text-foreground-muted mb-1.5">Section</label>
              <input id="wp-create-section" aria-label="Section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} required className="input-field" placeholder="Assets" />
            </div>
          </div>
          <div>
            <label htmlFor="wp-create-reference" className="block text-sm font-medium text-foreground-muted mb-1.5">Reference</label>
            <input id="wp-create-reference" aria-label="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required className="input-field" placeholder="WP-001" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Workpaper'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
