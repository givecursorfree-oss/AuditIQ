import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useNavBadgesOptional } from '@/context/NavBadgesContext';
import { usePortalSocket } from '@/hooks/usePortalSocket';
import api from '@/services/api';
import { CLIENT_PORTAL_TABS } from './constants';
import type {
  AuditQueryRow,
  ClientDocument,
  ClientEngagement,
  ClientInvoice,
  ClientPreferences,
  ClientProfile,
  ClientReport,
  DocRequest,
  EngagementDetail,
  EngagementRequestForm,
  LetterInPreparation,
  NewAuditQuery,
  PendingLetter,
  ServiceRequestRow,
  TimelineStage,
} from './types';

export interface ClientPortalContextValue {
  user: ReturnType<typeof useAuth>['user'];
  profile: ClientProfile | null;
  loading: boolean;
  engagements: ClientEngagement[];
  documents: ClientDocument[];
  docRequests: DocRequest[];
  invoices: ClientInvoice[];
  reports: ClientReport[];
  auditQueries: AuditQueryRow[];
  auditQueriesError: string | null;
  preferences: ClientPreferences | null;
  serviceRequests: ServiceRequestRow[];
  serviceRequestsLoading: boolean;
  pendingLetters: PendingLetter[];
  lettersInPreparation: LetterInPreparation[];
  selectedEngagementId: string | null;
  setSelectedEngagementId: (id: string | null) => void;
  uploadEngagementId: string;
  setUploadEngagementId: (id: string) => void;
  timelineStages: TimelineStage[];
  timelineLoading: boolean;
  engagementDetail: EngagementDetail | null;
  detailLoading: boolean;
  checklistUploading: string | null;
  uploadMessage: string | null;
  uploadError: string | null;
  setUploadError: (msg: string | null) => void;
  uploading: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  showRequestForm: boolean;
  reqStep: number;
  setReqStep: (step: number | ((s: number) => number)) => void;
  reqForm: EngagementRequestForm;
  setReqForm: React.Dispatch<React.SetStateAction<EngagementRequestForm>>;
  reqSaving: boolean;
  reqError: string;
  reqSuccess: boolean;
  reportQueryText: Record<string, string>;
  setReportQueryText: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  newQuery: NewAuditQuery;
  setNewQuery: React.Dispatch<React.SetStateAction<NewAuditQuery>>;
  querySubmitError: string;
  querySubmitting: boolean;
  prefsSaving: boolean;
  reviewLetterId: string | null;
  setReviewLetterId: (id: string | null) => void;
  reviewLetterLoading: boolean;
  reviewLetterContent: string;
  letterSignatoryName: string;
  setLetterSignatoryName: (name: string) => void;
  letterAccepting: string | null;
  selectedEngagement: ClientEngagement | null;
  selectedUploadEngagement: ClientEngagement | null;
  uploadAllowed: boolean;
  activeCount: number;
  completedCount: number;
  pendingRequests: number;
  openAuditQueryCount: number;
  pendingDocsCount: number;
  pendingServiceRequests: ServiceRequestRow[];
  pendingActivationEngagements: ClientEngagement[];
  hasDashboardContent: boolean;
  documentsForEngagement: ClientDocument[];
  openRequestForm: () => void;
  closeRequestForm: () => void;
  toggleService: (code: string) => void;
  submitEngagementRequest: (e?: React.FormEvent) => Promise<void>;
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleChecklistUpload: (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  downloadClientDocument: (documentId: string) => Promise<void>;
  openLetterReview: (letterId: string) => Promise<void>;
  acceptEngagementLetter: (letterId: string) => Promise<void>;
  refreshEngagementDetail: () => Promise<void>;
  setEngagementDetail: React.Dispatch<React.SetStateAction<EngagementDetail | null>>;
  setReports: React.Dispatch<React.SetStateAction<ClientReport[]>>;
  setAuditQueries: React.Dispatch<React.SetStateAction<AuditQueryRow[]>>;
  setAuditQueriesError: React.Dispatch<React.SetStateAction<string | null>>;
  setPreferences: React.Dispatch<React.SetStateAction<ClientPreferences | null>>;
  savePreferences: () => Promise<void>;
  submitAuditQuery: () => Promise<void>;
  acknowledgeReport: (reportId: string) => Promise<void>;
  raiseReportQuery: (reportId: string) => Promise<void>;
  acknowledgeEngagementReport: (reportId: string, engagementId: string) => Promise<void>;
  submitEngagementReportQuery: (reportId: string, engagementId: string) => Promise<void>;
}

const ClientPortalContext = createContext<ClientPortalContextValue | null>(null);

export function useClientPortal() {
  const ctx = useContext(ClientPortalContext);
  if (!ctx) {
    throw new Error('useClientPortal must be used within ClientPortalProvider');
  }
  return ctx;
}

export function ClientPortalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const navBadges = useNavBadgesOptional();

  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [engagements, setEngagements] = useState<ClientEngagement[]>([]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [docRequests, setDocRequests] = useState<DocRequest[]>([]);
  const [selectedEngagementId, setSelectedEngagementId] = useState<string | null>(null);
  const [timelineStages, setTimelineStages] = useState<TimelineStage[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [engagementDetail, setEngagementDetail] = useState<EngagementDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [checklistUploading, setChecklistUploading] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadEngagementId, setUploadEngagementId] = useState('');
  const [activeTab, setActiveTab] = useState('tracking');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqStep, setReqStep] = useState(1);
  const [reqForm, setReqForm] = useState<EngagementRequestForm>({
    selectedServices: [],
    financialYear: 'FY 2025-26',
    customYear: '',
    notes: '',
  });
  const [reqSaving, setReqSaving] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqSuccess, setReqSuccess] = useState(false);
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [auditQueries, setAuditQueries] = useState<AuditQueryRow[]>([]);
  const [auditQueriesError, setAuditQueriesError] = useState<string | null>(null);
  const [querySubmitError, setQuerySubmitError] = useState('');
  const [querySubmitting, setQuerySubmitting] = useState(false);
  const [preferences, setPreferences] = useState<ClientPreferences | null>(null);
  const [reportQueryText, setReportQueryText] = useState<Record<string, string>>({});
  const [newQuery, setNewQuery] = useState<NewAuditQuery>({ engagementId: '', subject: '', body: '' });
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [pendingLetters, setPendingLetters] = useState<PendingLetter[]>([]);
  const [lettersInPreparation, setLettersInPreparation] = useState<LetterInPreparation[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestRow[]>([]);
  const [serviceRequestsLoading, setServiceRequestsLoading] = useState(true);
  const [letterAccepting, setLetterAccepting] = useState<string | null>(null);
  const [reviewLetterId, setReviewLetterId] = useState<string | null>(null);
  const [reviewLetterLoading, setReviewLetterLoading] = useState(false);
  const [reviewLetterContent, setReviewLetterContent] = useState('');
  const [letterSignatoryName, setLetterSignatoryName] = useState('');

  const loadLetterInbox = useCallback(async () => {
    try {
      const { data } = await api.get<{
        awaitingSignature: PendingLetter[];
        inPreparation: LetterInPreparation[];
      }>('/client/engagement-letters/inbox');
      setPendingLetters(data.awaitingSignature ?? []);
      setLettersInPreparation(data.inPreparation ?? []);
    } catch {
      setPendingLetters([]);
      setLettersInPreparation([]);
    }
  }, []);

  const loadServiceRequests = useCallback(async () => {
    setServiceRequestsLoading(true);
    try {
      const { data } = await api.get<ServiceRequestRow[]>('/client/requests');
      setServiceRequests(data);
      return data;
    } catch {
      setServiceRequests([]);
      return [] as ServiceRequestRow[];
    } finally {
      setServiceRequestsLoading(false);
    }
  }, []);

  // Real-time portal pushes (e.g. engagement letter sent) — refresh without manual reload.
  usePortalSocket(
    useCallback(() => {
      void loadLetterInbox();
      void loadServiceRequests();
      void navBadges?.refresh();
    }, [loadLetterInbox, loadServiceRequests, navBadges])
  );

  const selectedEngagement = useMemo(
    () => engagements.find((e) => e.id === selectedEngagementId) ?? null,
    [engagements, selectedEngagementId]
  );

  const activeCount = engagements.filter((e) => e.isActivated).length;
  const pendingActivationEngagements = useMemo(
    () => engagements.filter((e) => !e.isActivated),
    [engagements]
  );
  const selectedUploadEngagement = useMemo(
    () => engagements.find((e) => e.id === uploadEngagementId) ?? null,
    [engagements, uploadEngagementId]
  );
  const uploadAllowed = Boolean(selectedUploadEngagement?.isActivated);
  const completedCount = engagements.filter((e) =>
    ['Completed', 'Closed', 'Filed'].includes(e.status)
  ).length;
  const pendingRequests = docRequests.filter((r) => r.status === 'Pending').length;
  const openAuditQueryCount = auditQueries.filter((q) => q.status === 'Open').length;
  const pendingDocsCount = useMemo(() => {
    const checklistPending = engagements
      .filter((e) => e.isActivated)
      .reduce((sum, e) => sum + (e.pendingDocuments ?? 0), 0);
    return checklistPending + pendingRequests;
  }, [engagements, pendingRequests]);

  const pendingServiceRequests = useMemo(
    () => serviceRequests.filter((r) => r.status === 'pending'),
    [serviceRequests]
  );
  const hasDashboardContent = engagements.length > 0 || serviceRequests.length > 0;

  const documentsForEngagement = useMemo(() => {
    if (!uploadEngagementId) return documents;
    return documents.filter((d) => d.engagementId === uploadEngagementId);
  }, [documents, uploadEngagementId]);

  useEffect(() => {
    async function load() {
      const urlEngagementId = searchParams.get('engagementId');
      const urlTab = searchParams.get('tab');

      try {
        const meRes = await api.get<ClientProfile>('/client/me');
        setProfile(meRes.data);
      } catch {
        setProfile(null);
      }

      const [engRes, docRes, reqRes, invRes, repRes, prefRes, lettersRes] = await Promise.all([
        api.get<ClientEngagement[]>('/client/engagements').catch(() => ({ data: [] as ClientEngagement[] })),
        api.get<ClientDocument[]>('/client/documents').catch(() => ({ data: [] as ClientDocument[] })),
        api.get<DocRequest[]>('/client/document-requests').catch(() => ({ data: [] as DocRequest[] })),
        api.get<ClientInvoice[]>('/client/invoices').catch(() => ({ data: [] })),
        api.get<ClientReport[]>('/client/reports').catch(() => ({ data: [] })),
        api.get<ClientPreferences>('/client/preferences').catch(() => ({ data: null })),
        api.get('/client/engagement-letters/inbox').catch(() => ({ data: { awaitingSignature: [], inPreparation: [] } })),
      ]);
      setEngagements(engRes.data);
      setDocuments(docRes.data);
      setDocRequests(reqRes.data);
      setInvoices(invRes.data);
      setReports(repRes.data);
      setPreferences(prefRes.data);
      const inbox = lettersRes.data as {
        awaitingSignature?: PendingLetter[];
        inPreparation?: LetterInPreparation[];
      };
      setPendingLetters(inbox.awaitingSignature ?? []);
      setLettersInPreparation(inbox.inPreparation ?? []);
      await loadServiceRequests();
      const preferredEngagement =
        urlEngagementId && engRes.data.some((e) => e.id === urlEngagementId) ? urlEngagementId : null;
      if (engRes.data.length > 0) {
        const pick =
          preferredEngagement ??
          engRes.data.find((e) => e.isActivated)?.id ??
          engRes.data[0].id;
        setSelectedEngagementId(pick);
        setUploadEngagementId(pick);
      }
      if (urlTab && CLIENT_PORTAL_TABS.has(urlTab)) {
        setActiveTab(urlTab);
      }

      try {
        const qRes = await api.get<AuditQueryRow[]>('/client/audit-queries');
        setAuditQueries(qRes.data);
        setAuditQueriesError(null);
      } catch (e: unknown) {
        const ax = e as { response?: { data?: { error?: string } } };
        setAuditQueries([]);
        setAuditQueriesError(ax.response?.data?.error || 'Audit queries are temporarily unavailable.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [loadServiceRequests, searchParams]);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab && CLIENT_PORTAL_TABS.has(urlTab)) {
      setActiveTab(urlTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (loading) return;
    if (searchParams.get('tab')) return;
    if (engagements.length === 0 && pendingServiceRequests.length > 0) {
      setActiveTab('requests');
    }
  }, [loading, engagements.length, pendingServiceRequests.length, searchParams]);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout>;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        navigate('/login?session=expired');
      }, 30 * 60 * 1000);
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, resetIdle));
    resetIdle();
    return () => {
      clearTimeout(idleTimer);
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
    };
  }, [navigate]);

  useEffect(() => {
    if (!selectedEngagementId) {
      setTimelineStages([]);
      setEngagementDetail(null);
      return;
    }
    let cancelled = false;
    setTimelineLoading(true);
    setDetailLoading(true);
    Promise.all([
      api.get<{ stages: TimelineStage[] }>(`/client/engagements/${selectedEngagementId}/timeline`),
      api.get<EngagementDetail>(`/client/engagements/${selectedEngagementId}`),
    ])
      .then(([timelineRes, detailRes]) => {
        if (!cancelled) {
          setTimelineStages(timelineRes.data.stages);
          setEngagementDetail(detailRes.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTimelineStages([]);
          setEngagementDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTimelineLoading(false);
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEngagementId]);

  const refreshEngagementDetail = useCallback(async () => {
    if (!selectedEngagementId) return;
    const [engRes, detailRes] = await Promise.all([
      api.get<ClientEngagement[]>('/client/engagements'),
      api.get<EngagementDetail>(`/client/engagements/${selectedEngagementId}`),
    ]);
    setEngagements(engRes.data);
    setEngagementDetail(detailRes.data);
  }, [selectedEngagementId]);

  const downloadClientDocument = useCallback(async (documentId: string) => {
    try {
      const { data } = await api.post(`/client/documents/${documentId}/download-url`);
      window.open(data.url, '_blank');
    } catch {
      setUploadMessage('Unable to download this file. Please try again.');
    }
  }, []);

  const openLetterReview = useCallback(async (letterId: string) => {
    setReviewLetterId(letterId);
    setLetterSignatoryName('');
    setReviewLetterContent('');
    setReviewLetterLoading(true);
    try {
      const { data } = await api.get<{ generatedContent?: string | null }>(
        `/client/engagement-letters/${letterId}`
      );
      setReviewLetterContent(data.generatedContent ?? '');
    } catch {
      setUploadError('Unable to load engagement letter. Please contact your CA firm.');
      setReviewLetterId(null);
    } finally {
      setReviewLetterLoading(false);
    }
  }, []);

  const acceptEngagementLetter = useCallback(
    async (letterId: string) => {
      const name = letterSignatoryName.trim();
      if (!name) {
        setUploadError('Please enter the authorised signatory name.');
        return;
      }
      setLetterAccepting(letterId);
      setUploadError('');
      try {
        await api.patch(`/client/engagement-letters/${letterId}/accept`, { signatoryName: name });
        setPendingLetters((prev) => prev.filter((l) => l.id !== letterId));
        setReviewLetterId(null);
        await loadLetterInbox();
        await loadServiceRequests();
        void navBadges?.refresh();
      } catch {
        setUploadError('Could not sign engagement letter. Please contact your firm.');
      } finally {
        setLetterAccepting(null);
      }
    },
    [letterSignatoryName, loadLetterInbox, loadServiceRequests, navBadges]
  );

  const handleChecklistUpload = useCallback(
    async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setChecklistUploading(itemId);
      setUploadMessage(null);
      setUploadError(null);
      try {
        const form = new FormData();
        form.append('file', file);
        const { data } = await api.post(`/client/checklist/${itemId}/upload`, form);
        setUploadMessage(data.message || 'Your document has been received and logged.');
        await refreshEngagementDetail();
        const docRes = await api.get<ClientDocument[]>('/client/documents');
        setDocuments(docRes.data);
      } catch (err: unknown) {
        const ax = err as { response?: { data?: { error?: string; code?: string } } };
        setUploadError(ax.response?.data?.error || 'Upload failed. Please try again.');
      } finally {
        setChecklistUploading(null);
        e.target.value = '';
      }
    },
    [refreshEngagementDetail]
  );

  const openRequestForm = useCallback(() => {
    setReqStep(1);
    setReqForm({ selectedServices: [], financialYear: 'FY 2025-26', customYear: '', notes: '' });
    setReqError('');
    setReqSuccess(false);
    setShowRequestForm(true);
  }, []);

  const toggleService = useCallback((code: string) => {
    setReqForm((prev) => ({
      ...prev,
      selectedServices: prev.selectedServices.includes(code)
        ? prev.selectedServices.filter((c) => c !== code)
        : [...prev.selectedServices, code],
    }));
  }, []);

  const closeRequestForm = useCallback(() => {
    setShowRequestForm(false);
    setReqSuccess(false);
  }, []);

  const submitEngagementRequest = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (reqStep < 3) {
        setReqStep((s) => s + 1);
        return;
      }
      const fy = reqForm.financialYear === 'Other' ? reqForm.customYear : reqForm.financialYear.replace('FY ', '');
      const duplicate = serviceRequests.some(
        (r) =>
          r.status === 'pending' &&
          r.financialYears?.includes(fy) &&
          reqForm.selectedServices.every((s) => r.selectedServices?.includes(s)) &&
          r.selectedServices?.length === reqForm.selectedServices.length
      );
      if (duplicate) {
        setReqError('You already have a pending request for this service and financial year. Check the Requests tab.');
        return;
      }
      setReqSaving(true);
      setReqError('');
      try {
        await api.post('/client/requests', {
          selectedServices: reqForm.selectedServices,
          financialYears: [fy],
          notes: reqForm.notes || undefined,
        });
        await loadServiceRequests();
        await loadLetterInbox();
        setReqSuccess(true);
      } catch (err: unknown) {
        const ax = err as { response?: { data?: { error?: string } } };
        setReqError(ax.response?.data?.error || 'Failed to submit request. Please try again.');
      } finally {
        setReqSaving(false);
      }
    },
    [reqStep, reqForm, serviceRequests, loadServiceRequests, loadLetterInbox]
  );

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !uploadEngagementId) return;

      if (!uploadAllowed) {
        setUploadError(
          'Document upload is not available yet. Your CA firm must assign a team to this engagement first — you will see "In progress" instead of "Pending Allocation" when uploads are unlocked.'
        );
        e.target.value = '';
        return;
      }

      setUploading(true);
      setUploadMessage(null);
      setUploadError(null);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('engagementId', uploadEngagementId);
        const { data } = await api.post('/client/documents/upload', form);
        setUploadMessage(data.message || 'Your document has been received and logged.');
        const docRes = await api.get<ClientDocument[]>('/client/documents');
        setDocuments(docRes.data);
      } catch (err: unknown) {
        const ax = err as { response?: { data?: { error?: string; code?: string } } };
        setUploadError(ax.response?.data?.error || 'Upload failed. Please try again.');
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    },
    [uploadEngagementId, uploadAllowed]
  );

  const savePreferences = useCallback(async () => {
    if (!preferences) return;
    setPrefsSaving(true);
    try {
      const { data } = await api.patch<ClientPreferences>('/client/preferences', preferences);
      setPreferences(data);
    } finally {
      setPrefsSaving(false);
    }
  }, [preferences]);

  const submitAuditQuery = useCallback(async () => {
    setQuerySubmitting(true);
    setQuerySubmitError('');
    try {
      await api.post('/client/audit-queries', newQuery);
      const qList = await api.get<AuditQueryRow[]>('/client/audit-queries');
      setAuditQueries(qList.data);
      setAuditQueriesError(null);
      setNewQuery({ engagementId: '', subject: '', body: '' });
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } };
      setQuerySubmitError(ax.response?.data?.error || 'Could not submit your query. Please try again.');
    } finally {
      setQuerySubmitting(false);
    }
  }, [newQuery]);

  const acknowledgeReport = useCallback(async (reportId: string) => {
    await api.post(`/client/reports/${reportId}/acknowledge`);
    const rep = await api.get<ClientReport[]>('/client/reports');
    setReports(rep.data);
  }, []);

  const raiseReportQuery = useCallback(
    async (reportId: string) => {
      const q = (reportQueryText[reportId] ?? '').trim();
      if (!q) return;
      await api.post(`/client/reports/${reportId}/query`, { query: q });
      const [rep, qList] = await Promise.all([
        api.get<ClientReport[]>('/client/reports'),
        api.get<AuditQueryRow[]>('/client/audit-queries'),
      ]);
      setReports(rep.data);
      setAuditQueries(qList.data);
      setReportQueryText((p) => ({ ...p, [reportId]: '' }));
    },
    [reportQueryText]
  );

  const acknowledgeEngagementReport = useCallback(async (reportId: string, engagementId: string) => {
    await api.post(`/client/reports/${reportId}/acknowledge`);
    const d = await api.get<EngagementDetail>(`/client/engagements/${engagementId}`);
    setEngagementDetail(d.data);
  }, []);

  const submitEngagementReportQuery = useCallback(
    async (reportId: string, engagementId: string) => {
      const q = (reportQueryText[reportId] ?? '').trim();
      if (!q) return;
      await api.post(`/client/reports/${reportId}/query`, { query: q });
      const d = await api.get<EngagementDetail>(`/client/engagements/${engagementId}`);
      setEngagementDetail(d.data);
      setReportQueryText((p) => ({ ...p, [reportId]: '' }));
    },
    [reportQueryText]
  );

  const value = useMemo<ClientPortalContextValue>(
    () => ({
      user,
      profile,
      loading,
      engagements,
      documents,
      docRequests,
      invoices,
      reports,
      auditQueries,
      auditQueriesError,
      preferences,
      serviceRequests,
      serviceRequestsLoading,
      pendingLetters,
      lettersInPreparation,
      selectedEngagementId,
      setSelectedEngagementId,
      uploadEngagementId,
      setUploadEngagementId,
      timelineStages,
      timelineLoading,
      engagementDetail,
      detailLoading,
      checklistUploading,
      uploadMessage,
      uploadError,
      setUploadError,
      uploading,
      activeTab,
      setActiveTab,
      showRequestForm,
      reqStep,
      setReqStep,
      reqForm,
      setReqForm,
      reqSaving,
      reqError,
      reqSuccess,
      reportQueryText,
      setReportQueryText,
      newQuery,
      setNewQuery,
      querySubmitError,
      querySubmitting,
      prefsSaving,
      reviewLetterId,
      setReviewLetterId,
      reviewLetterLoading,
      reviewLetterContent,
      letterSignatoryName,
      setLetterSignatoryName,
      letterAccepting,
      selectedEngagement,
      selectedUploadEngagement,
      uploadAllowed,
      activeCount,
      completedCount,
      pendingRequests,
      openAuditQueryCount,
      pendingDocsCount,
      pendingServiceRequests,
      pendingActivationEngagements,
      hasDashboardContent,
      documentsForEngagement,
      openRequestForm,
      closeRequestForm,
      toggleService,
      submitEngagementRequest,
      handleUpload,
      handleChecklistUpload,
      downloadClientDocument,
      openLetterReview,
      acceptEngagementLetter,
      refreshEngagementDetail,
      setEngagementDetail,
      setReports,
      setAuditQueries,
      setAuditQueriesError,
      setPreferences,
      savePreferences,
      submitAuditQuery,
      acknowledgeReport,
      raiseReportQuery,
      acknowledgeEngagementReport,
      submitEngagementReportQuery,
    }),
    [
      user,
      profile,
      loading,
      engagements,
      documents,
      docRequests,
      invoices,
      reports,
      auditQueries,
      auditQueriesError,
      preferences,
      serviceRequests,
      serviceRequestsLoading,
      pendingLetters,
      lettersInPreparation,
      selectedEngagementId,
      uploadEngagementId,
      timelineStages,
      timelineLoading,
      engagementDetail,
      detailLoading,
      checklistUploading,
      uploadMessage,
      uploadError,
      uploading,
      activeTab,
      showRequestForm,
      reqStep,
      reqForm,
      reqSaving,
      reqError,
      reqSuccess,
      reportQueryText,
      newQuery,
      querySubmitError,
      querySubmitting,
      prefsSaving,
      reviewLetterId,
      reviewLetterLoading,
      reviewLetterContent,
      letterSignatoryName,
      letterAccepting,
      selectedEngagement,
      selectedUploadEngagement,
      uploadAllowed,
      activeCount,
      completedCount,
      pendingRequests,
      openAuditQueryCount,
      pendingDocsCount,
      pendingServiceRequests,
      pendingActivationEngagements,
      hasDashboardContent,
      documentsForEngagement,
      openRequestForm,
      closeRequestForm,
      toggleService,
      submitEngagementRequest,
      handleUpload,
      handleChecklistUpload,
      downloadClientDocument,
      openLetterReview,
      acceptEngagementLetter,
      refreshEngagementDetail,
      savePreferences,
      submitAuditQuery,
      acknowledgeReport,
      raiseReportQuery,
      acknowledgeEngagementReport,
      submitEngagementReportQuery,
    ]
  );

  return <ClientPortalContext.Provider value={value}>{children}</ClientPortalContext.Provider>;
}
