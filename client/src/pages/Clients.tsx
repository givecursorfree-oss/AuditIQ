import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Buildings,
  MagnifyingGlass as Search,
  UserPlus,
  UserCircle,
  Briefcase,
  CheckCircle,
  CaretRight as ChevronRight,
  Warning,
} from '@phosphor-icons/react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import PageHeader from '../components/layout/PageHeader';
import PageLoading from '../components/layout/PageLoading';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import { Badge } from '../components/ui/badge';
import { NavCountBadge } from '../components/ui/nav-count-badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { isTeamAssignmentBlocked, LETTER_GATE_MESSAGE, engagementHasTeam } from '@/lib/letterGatePolicy';
import EngagementTeamMultiSelect from '@/components/engagement/EngagementTeamMultiSelect';

interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  role: string;
  designation?: string | null;
  hierarchyLevel?: { code: string } | null;
}

interface EngagementSummary {
  id: string;
  title: string;
  type: string;
  financialYear: string;
  status: string;
  currentStage: string;
  partnerInChargeId: string | null;
  managerId: string | null;
  articleAssistantId: string | null;
  letterStatus?: string | null;
  createdAt: string;
  partnerInCharge?: { id: string; firstName: string; lastName: string; initials: string } | null;
  manager?: { id: string; firstName: string; lastName: string; initials: string } | null;
}

interface ClientRow {
  id: string;
  name: string;
  legalName?: string | null;
  pan?: string | null;
  gstin?: string | null;
  category?: string | null;
  status: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  createdAt: string;
  engagements: EngagementSummary[];
  portalUsers: { id: string; email: string; fullName: string }[];
  _count: { engagements: number };
}

interface UnassignedEngagement extends EngagementSummary {
  client: {
    id: string;
    name: string;
    status: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    pan?: string | null;
    category?: string | null;
  };
}

interface OverviewData {
  clients: ClientRow[];
  incoming: {
    prospectClients: ClientRow[];
    unassignedEngagements: UnassignedEngagement[];
    total: number;
  };
  staff: StaffUser[];
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'success'> = {
  Active: 'success',
  Prospect: 'secondary',
  Inactive: 'outline',
};

export default function Clients() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const engagementIdFromUrl = searchParams.get('engagementId');
  const canAssign = ['Partner', 'Admin', 'Manager'].includes(user?.role || '');
  const canImportHrList = ['Partner', 'Admin', 'HR'].includes(user?.role || '');
  const [importing, setImporting] = useState(false);

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState(
    searchParams.get('tab') === 'incoming' || engagementIdFromUrl ? 'incoming' : 'all'
  );
  const [selectedEngagementId, setSelectedEngagementId] = useState<string | null>(engagementIdFromUrl);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: overview } = await api.get<OverviewData>('/clients/overview');
      setData(overview);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load clients.' });
    } finally {
      setLoading(false);
    }
  }

  async function importHrClientList() {
    setImporting(true);
    setMessage(null);
    try {
      const { data: result } = await api.post<{
        sourceCount: number;
        created: number;
        skippedExisting: number;
        totalClientsInFirm: number;
      }>('/hr-masters/clients/import-crm');
      setMessage({
        type: 'success',
        text: `HR list: ${result.created} new clients created, ${result.skippedExisting} already existed (${result.totalClientsInFirm} total in firm).`,
      });
      await load();
    } catch {
      setMessage({ type: 'error', text: 'Failed to import HR client list.' });
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!data || !engagementIdFromUrl) return;
    const match = data.incoming.unassignedEngagements.find((e) => e.id === engagementIdFromUrl);
    if (match) {
      setTab('incoming');
      setSelectedEngagementId(match.id);
    }
  }, [data, engagementIdFromUrl]);

  const filteredClients = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.clients.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.contactEmail?.toLowerCase().includes(q) ||
        c.pan?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const selectedEngagement = useMemo(() => {
    if (!data || !selectedEngagementId) return null;
    return data.incoming.unassignedEngagements.find((e) => e.id === selectedEngagementId) ?? null;
  }, [data, selectedEngagementId]);

  const selectedProspect = useMemo(() => {
    if (!data || !selectedClientId) return null;
    return data.incoming.prospectClients.find((c) => c.id === selectedClientId) ?? null;
  }, [data, selectedClientId]);

  useEffect(() => {
    if (selectedEngagement) {
      setSelectedClientId(null);
    }
  }, [selectedEngagement]);

  async function handleActivateClient(clientId: string) {
    if (!canAssign) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.patch(`/clients/${clientId}/activate`);
      setMessage({ type: 'success', text: 'Client marked as Active.' });
      setSelectedClientId(null);
      await load();
    } catch {
      setMessage({ type: 'error', text: 'Could not activate client.' });
    } finally {
      setSaving(false);
    }
  }

  const letterGateBlocked = selectedEngagement
    ? isTeamAssignmentBlocked(selectedEngagement.letterStatus, engagementHasTeam(selectedEngagement))
    : false;

  if (loading) {
    return <PageLoading />;
  }

  if (!data) {
    return (
      <AppPageContainer>
        <PageHeader title="Clients" />
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {message?.text ?? 'Failed to load clients. Please refresh or try again.'}
        </div>
        <Button variant="outline" onClick={() => load()}>
          Retry
        </Button>
      </AppPageContainer>
    );
  }

  const incoming = data.incoming;

  return (
    <AppPageContainer>
      <PageHeader
        title="Clients"
        description="View your client portfolio and assign incoming registrations to the right team."
        badge={
          incoming.total > 0 ? (
            <Badge variant="secondary" className="w-fit text-foreground">
              {incoming.total} incoming {incoming.total === 1 ? 'item' : 'items'} need attention
            </Badge>
          ) : undefined
        }
        actions={
          canImportHrList ? (
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => void importHrClientList()}
            >
              {importing ? 'Importing…' : 'Import HR client list (689)'}
            </Button>
          ) : undefined
        }
      />

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-danger/30 bg-danger/10 text-danger'
          }`}
        >
          {message.text}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All clients ({data.clients.length})</TabsTrigger>
          <TabsTrigger value="incoming">
            Incoming
            <NavCountBadge count={incoming.total} className="!ml-1.5 shrink-0" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-4">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
            <input
              type="search"
              placeholder="Search by name, email, or PAN…"
              aria-label="Search clients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field w-full pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Engagements</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((c) => (
                    <TableRow key={c.id} className="hover:bg-hover-bg/50">
                      <TableCell>
                        <p className="font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-foreground-muted">
                          {c.pan ? <span className="font-data">{c.pan}</span> : c.category || '—'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-foreground-secondary">{c.contactName || '—'}</p>
                        <p className="text-xs text-foreground-muted">{c.contactEmail || '—'}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'}>{c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-foreground-secondary">
                        {c._count.engagements} active
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/engagements?client=${c.id}`)}
                        >
                          View
                          <ChevronRight size={14} className="ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredClients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-foreground-muted">
                        No clients match your search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incoming" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-4">
              {/* New registrations */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-foreground">
                    <UserPlus size={18} className="text-primary" />
                    New client registrations
                  </CardTitle>
                  <CardDescription>
                    Self-registered clients awaiting review and activation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {incoming.prospectClients.length === 0 ? (
                    <p className="text-sm text-foreground-muted py-4 text-center">No pending registrations</p>
                  ) : (
                    incoming.prospectClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedClientId(c.id);
                          setSelectedEngagementId(null);
                        }}
                        className={`w-full text-left rounded-lg border p-4 transition-colors ${
                          selectedClientId === c.id
                            ? 'border-foreground/30 bg-surface-muted ring-1 ring-border'
                            : 'border-border bg-card hover:bg-hover-bg'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-foreground">{c.name}</p>
                            <p className="text-xs text-foreground-muted mt-0.5">
                              {c.contactEmail} · {c.category || 'Entity'}
                            </p>
                            {c.pan && (
                              <p className="text-xs text-foreground-muted">
                                PAN <span className="font-data">{c.pan}</span>
                              </p>
                            )}
                          </div>
                          <Badge variant="secondary">Prospect</Badge>
                        </div>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Unassigned engagement requests */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-foreground">
                    <Briefcase size={18} className="text-warning" />
                    Engagement requests (unassigned)
                  </CardTitle>
                  <CardDescription>
                    Client-requested work without a partner or manager assigned yet.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {incoming.unassignedEngagements.length === 0 ? (
                    <p className="text-sm text-foreground-muted py-4 text-center">All engagements are assigned</p>
                  ) : (
                    incoming.unassignedEngagements.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelectedEngagementId(e.id)}
                        className={`w-full text-left rounded-lg border p-4 transition-colors ${
                          selectedEngagementId === e.id
                            ? 'border-foreground/30 bg-surface-muted ring-1 ring-border'
                            : 'border-border bg-card hover:bg-hover-bg'
                        }`}
                      >
                        <p className="font-semibold text-foreground text-sm">{e.title}</p>
                        <p className="text-xs text-foreground-muted mt-1">
                          {e.client.name} · {e.type} · FY {e.financialYear}
                        </p>
                        <p className="text-xs text-foreground-muted mt-0.5">
                          Stage: {e.currentStage} · {new Date(e.createdAt).toLocaleDateString('en-IN')}
                        </p>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Assignment panel */}
            <Card className="h-fit xl:sticky xl:top-4">
              <CardHeader>
                <CardTitle className="text-base text-foreground">Assign & activate</CardTitle>
                <CardDescription>
                  Select an item on the left, then assign team members or activate the client.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedEngagement && !selectedProspect && (
                  <div className="text-center py-8 text-foreground-muted">
                    <UserCircle size={40} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Select a registration or engagement request</p>
                  </div>
                )}

                {selectedProspect && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-foreground">
                      <p className="font-medium">{selectedProspect.name}</p>
                      <p className="text-foreground-muted text-xs mt-1">{selectedProspect.contactEmail}</p>
                      {selectedProspect.engagements[0] && (
                        <p className="text-xs text-foreground-secondary mt-2">
                          Request: {selectedProspect.engagements[0].title}
                        </p>
                      )}
                    </div>
                    {canAssign ? (
                      <Button
                        className="w-full"
                        onClick={() => handleActivateClient(selectedProspect.id)}
                        disabled={saving}
                      >
                        <CheckCircle size={18} className="mr-2" />
                        Activate client
                      </Button>
                    ) : (
                      <p className="text-xs text-foreground-muted">Only Partner, Admin, or Manager can activate.</p>
                    )}
                    {selectedProspect.engagements[0] && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setSelectedEngagementId(selectedProspect.engagements[0].id)}
                      >
                        Assign team to engagement
                      </Button>
                    )}
                  </div>
                )}

                {selectedEngagement && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                      <div className="flex gap-2">
                        <Warning size={18} className="text-warning shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{selectedEngagement.title}</p>
                          <p className="text-xs text-foreground-muted mt-1">{selectedEngagement.client.name}</p>
                        </div>
                      </div>
                    </div>

                    {canAssign ? (
                      <>
                        {letterGateBlocked && (
                          <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded p-2">
                            {LETTER_GATE_MESSAGE}
                          </p>
                        )}
                        <EngagementTeamMultiSelect
                          engagementId={selectedEngagement.id}
                          disabled={letterGateBlocked}
                          onSaved={() => {
                            setMessage({ type: 'success', text: 'Team assigned successfully.' });
                            setSelectedEngagementId(null);
                            void load();
                          }}
                        />
                      </>
                    ) : (
                      <p className="text-xs text-foreground-muted">Only Partner, Admin, or Manager can assign teams.</p>
                    )}

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => navigate(`/engagements/${selectedEngagement.id}`)}
                    >
                      Open engagement
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AppPageContainer>
  );
}
