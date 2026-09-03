import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, MagnifyingGlass as Search, Plus, PencilSimple as Edit, Trash as Trash2, X, UploadSimple as Upload, DownloadSimple as Download, CaretRight as ChevronRight,
  Phone, Envelope as Mail, MapPin, CreditCard, Buildings as Building, FileText, CurrencyDollar as DollarSign, Shield
} from '@phosphor-icons/react';
import api from '../services/api';
import { appAlert } from '../context/AppDialogContext';
import { getApiErrorMessage } from '@/lib/formPayload';
import { useAuth } from '../context/AuthContext';
import UserPresenceAvatar from '../components/UserPresenceAvatar';
import { SplitPaneLayout } from '@/components/layout/SplitPaneLayout';
import { AppPageContainer } from '@/components/layout/AppPageContainer';
import { AccessibleTabList, AccessibleTabPanel } from '@/components/ui/accessible-tabs';
import PageHeader from '@/components/layout/PageHeader';
import { EmptyState, ErrorBanner, LoadingCenter } from '@/components/layout/StatePanels';
import { Status, StatusIndicator, StatusLabel } from '@/components/ui/status';
import {
  normalizePresenceStatus,
  PRESENCE_LABELS,
  type PresenceStatus,
} from '@/lib/presence';
import { Button } from '@/components/ui/button';

interface EmployeeProfile {
  id: string;
  pan?: string;
  aadhaar?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  fatherName?: string;
  passportNo?: string;
  uanNumber?: string;
  currentAddress?: string;
  currentCity?: string;
  currentState?: string;
  currentPincode?: string;
  permanentAddress?: string;
  permanentCity?: string;
  permanentState?: string;
  permanentPincode?: string;
  bankName?: string;
  bankBranch?: string;
  accountNumber?: string;
  ifscCode?: string;
  emergencyName?: string;
  emergencyRelation?: string;
  emergencyPhone?: string;
  joiningDate?: string;
  department?: string;
  employeeCode?: string;
  employmentType?: string;
  probationEnd?: string;
  salaryStructure?: SalaryStructure;
  employeeDocuments?: EmployeeDoc[];
}

interface SalaryStructure {
  basicSalary: number;
  hra: number;
  da: number;
  specialAllowance: number;
  conveyance: number;
  medicalAllowance: number;
  otherAllowances: number;
  pf: number;
  esi: number;
  professionalTax: number;
  tds: number;
  otherDeductions: number;
  ctc: number;
  effectiveFrom?: string;
}

interface EmployeeDoc {
  id: string;
  docType: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  email: string;
  role: string;
  designation?: string;
  phone?: string;
  reportsToId?: string;
  reportsTo?: { firstName: string; lastName: string };
  employeeProfile?: EmployeeProfile;
  presenceStatus?: PresenceStatus;
}

type Tab = 'personal' | 'identity' | 'salary' | 'documents';

const EMPLOYEE_PROFILE_TABS: { key: Tab; icon: React.ElementType; label: string }[] = [
  { key: 'personal', icon: Users, label: 'Personal' },
  { key: 'identity', icon: CreditCard, label: 'ID & Address' },
  { key: 'salary', icon: DollarSign, label: 'Salary' },
  { key: 'documents', icon: FileText, label: 'Documents' },
];

const DOC_TYPES = ['PAN Card', 'Aadhaar Card', 'Passport', 'Driving License', 'Voter ID', 'Bank Statement', 'Offer Letter', 'Resignation Letter', 'Experience Letter', 'Educational Certificate', 'Other'];

const inrCurrencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatCurrency(n: number) {
  return inrCurrencyFormatter.format(n);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function Employees() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [tab, setTab] = useState<Tab>('personal');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [salaryData, setSalaryData] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === 'Partner' || user?.role === 'Admin';
  const canEdit = isAdmin || user?.role === 'Manager';

  const searchRef = useRef(search);
  searchRef.current = search;

  const fetchEmployees = useCallback(async () => {
    const q = searchRef.current;
    setLoadError(null);
    try {
      const { data } = await api.get('/employees', { params: q ? { search: q } : {} });
      setEmployees(data);
    } catch {
      setLoadError('Failed to load.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchEmployees(); }, [fetchEmployees]);

  async function fetchDetail(id: string) {
    try {
      const { data } = await api.get(`/employees/${id}`);
      setSelected(data);
    } catch { /* empty */ }
  }

  async function saveProfile() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/employees/${selected.id}/profile`, formData);
      await fetchDetail(selected.id);
      setEditing(false);
      await appAlert({ title: 'Saved', message: 'Employee profile updated.' });
    } catch (err) {
      await appAlert({ title: 'Could not save', message: getApiErrorMessage(err, 'Failed to save profile') });
    } finally { setSaving(false); }
  }

  async function saveSalary() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/employees/${selected.id}/salary`, salaryData);
      await fetchDetail(selected.id);
      setEditing(false);
      await appAlert({ title: 'Saved', message: 'Salary structure updated.' });
    } catch (err) {
      await appAlert({ title: 'Could not save', message: getApiErrorMessage(err, 'Failed to save salary') });
    } finally { setSaving(false); }
  }

  async function uploadDoc(file: File, docType: string) {
    if (!selected) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docType', docType);
    await api.post(`/employees/${selected.id}/documents`, fd);
    await fetchDetail(selected.id);
  }

  async function deleteDoc(docId: string) {
    if (!selected) return;
    await api.delete(`/employees/${selected.id}/documents/${docId}`);
    await fetchDetail(selected.id);
  }

  function startEdit() {
    if (!selected) return;
    const p = selected.employeeProfile || {} as EmployeeProfile;
    if (tab === 'salary') {
      const s = p.salaryStructure || {} as SalaryStructure;
      setSalaryData({
        basicSalary: s.basicSalary || 0, hra: s.hra || 0, da: s.da || 0,
        specialAllowance: s.specialAllowance || 0, conveyance: s.conveyance || 0,
        medicalAllowance: s.medicalAllowance || 0, otherAllowances: s.otherAllowances || 0,
        pf: s.pf || 0, esi: s.esi || 0, professionalTax: s.professionalTax || 0,
        tds: s.tds || 0, otherDeductions: s.otherDeductions || 0, ctc: s.ctc || 0,
      });
    } else {
      setFormData({
        pan: p.pan || '', aadhaar: p.aadhaar || '', dateOfBirth: p.dateOfBirth?.split('T')[0] || '',
        gender: p.gender || '', bloodGroup: p.bloodGroup || '', maritalStatus: p.maritalStatus || '',
        fatherName: p.fatherName || '', passportNo: p.passportNo || '', uanNumber: p.uanNumber || '',
        currentAddress: p.currentAddress || '', currentCity: p.currentCity || '',
        currentState: p.currentState || '', currentPincode: p.currentPincode || '',
        permanentAddress: p.permanentAddress || '', permanentCity: p.permanentCity || '',
        permanentState: p.permanentState || '', permanentPincode: p.permanentPincode || '',
        bankName: p.bankName || '', bankBranch: p.bankBranch || '',
        accountNumber: p.accountNumber || '', ifscCode: p.ifscCode || '',
        emergencyName: p.emergencyName || '', emergencyRelation: p.emergencyRelation || '',
        emergencyPhone: p.emergencyPhone || '', department: p.department || '',
        employeeCode: p.employeeCode || '', employmentType: p.employmentType || '',
        joiningDate: p.joiningDate?.split('T')[0] || '',
      });
    }
    setEditing(true);
  }

  const filtered = employees.filter(e =>
    `${e.firstName} ${e.lastName} ${e.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const profile = selected?.employeeProfile;

  return (
    <AppPageContainer className="flex min-h-[min(100dvh-6rem,900px)] flex-col">
      <PageHeader title="Employees" description="Statutory data and HR records" />

      <SplitPaneLayout
        hasSelection={!!selected}
        onClearSelection={() => {
          setSelected(null);
          setEditing(false);
        }}
        list={
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="p-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
              <input
                type="search"
                id="employees-search"
                placeholder="Search employees..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchEmployees()}
                className="input pl-9 text-sm"
                aria-label="Search employees"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <LoadingCenter className="py-10" />
            ) : loadError ? (
              <ErrorBanner message={loadError} onRetry={() => void fetchEmployees()} className="m-3" />
            ) : filtered.length === 0 ? (
              <EmptyState title="No employees found" />
            ) : (
              filtered.map(emp => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => { setSelected(emp); fetchDetail(emp.id); setTab('personal'); setEditing(false); }}
                  aria-current={selected?.id === emp.id ? 'true' : undefined}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover-bg transition-colors ${
                    selected?.id === emp.id ? 'list-item-active' : ''
                  }`}
                >
                  <UserPresenceAvatar
                    userId={emp.id}
                    initials={emp.initials}
                    presenceStatus={normalizePresenceStatus(emp.presenceStatus)}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{emp.firstName} {emp.lastName}</p>
                    <p className="text-xs text-foreground-muted truncate">{emp.designation || emp.role}</p>
                  </div>
                  <Status
                    status={normalizePresenceStatus(emp.presenceStatus)}
                    className="shrink-0 border-0 bg-transparent px-0 py-0 shadow-none"
                  >
                    <StatusIndicator />
                    <StatusLabel className="text-[10px]">
                      {PRESENCE_LABELS[normalizePresenceStatus(emp.presenceStatus)]}
                    </StatusLabel>
                  </Status>
                  <ChevronRight size={14} className="ml-auto text-foreground-muted shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
        }
        detail={
          !selected ? (
            <div className="hidden flex-col items-center justify-center p-8 text-foreground-muted lg:flex lg:min-h-[320px]">
              <Users size={48} className="mb-4 opacity-30" />
              <p className="text-sm">Select an employee to view details</p>
            </div>
          ) : (
            <div className="p-4 sm:p-6">
              {/* Employee Header */}
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
                <UserPresenceAvatar
                  userId={selected.id}
                  initials={selected.initials}
                  presenceStatus={normalizePresenceStatus(selected.presenceStatus)}
                  size="lg"
                />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{selected.firstName} {selected.lastName}</h2>
                  <p className="text-sm text-foreground-muted flex items-center gap-2 flex-wrap">
                    <span>{selected.designation || selected.role} · {selected.email}</span>
                    <Status
                      status={normalizePresenceStatus(selected.presenceStatus)}
                      className="inline-flex border-0 bg-transparent px-0 py-0 shadow-none"
                    >
                      <StatusIndicator />
                      <StatusLabel className="text-xs">
                        {PRESENCE_LABELS[normalizePresenceStatus(selected.presenceStatus)]}
                      </StatusLabel>
                    </Status>
                  </p>
                  {selected.reportsTo && (
                    <p className="text-xs text-foreground-muted mt-0.5">Reports to: {selected.reportsTo.firstName} {selected.reportsTo.lastName}</p>
                  )}
                </div>
                {canEdit && !editing && tab !== 'documents' && (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 sm:ml-auto" onClick={startEdit}>
                    <Edit size={14} /> Edit
                  </Button>
                )}
                {editing && (
                  <div className="flex items-center gap-2 sm:ml-auto">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={tab === 'salary' ? saveSalary : saveProfile}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}
              </div>

              <AccessibleTabList
                idPrefix="employee"
                ariaLabel="Employee profile sections"
                tabs={EMPLOYEE_PROFILE_TABS}
                active={tab}
                onChange={(key) => { setTab(key); setEditing(false); }}
                className="mb-6"
              />

              <AccessibleTabPanel id="employee-panel-personal" labelledBy="employee-tab-personal" hidden={tab !== 'personal'}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {editing ? (
                    <>
                      <Field label="Employee Code" value={formData.employeeCode} onChange={v => setFormData({...formData, employeeCode: v})} />
                      <Field label="Department" value={formData.department} onChange={v => setFormData({...formData, department: v})} />
                      <Field label="Date of Birth" value={formData.dateOfBirth} onChange={v => setFormData({...formData, dateOfBirth: v})} type="date" />
                      <Field label="Gender" value={formData.gender} onChange={v => setFormData({...formData, gender: v})} options={['Male', 'Female', 'Other']} />
                      <Field label="Blood Group" value={formData.bloodGroup} onChange={v => setFormData({...formData, bloodGroup: v})} options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} />
                      <Field label="Marital Status" value={formData.maritalStatus} onChange={v => setFormData({...formData, maritalStatus: v})} options={['Single', 'Married', 'Divorced', 'Widowed']} />
                      <Field label="Father's Name" value={formData.fatherName} onChange={v => setFormData({...formData, fatherName: v})} />
                      <Field label="Employment Type" value={formData.employmentType} onChange={v => setFormData({...formData, employmentType: v})} options={['Full-time', 'Part-time', 'Contract', 'Intern']} />
                      <Field label="Joining Date" value={formData.joiningDate} onChange={v => setFormData({...formData, joiningDate: v})} type="date" />
                      <Field label="Emergency Contact" value={formData.emergencyName} onChange={v => setFormData({...formData, emergencyName: v})} />
                      <Field label="Emergency Relation" value={formData.emergencyRelation} onChange={v => setFormData({...formData, emergencyRelation: v})} />
                      <Field label="Emergency Phone" value={formData.emergencyPhone} onChange={v => setFormData({...formData, emergencyPhone: v})} />
                    </>
                  ) : (
                    <>
                      <InfoRow icon={Building} label="Employee Code" value={profile?.employeeCode} />
                      <InfoRow icon={Building} label="Department" value={profile?.department} />
                      <InfoRow icon={Users} label="Date of Birth" value={profile?.dateOfBirth?.split('T')[0]} />
                      <InfoRow icon={Users} label="Gender" value={profile?.gender} />
                      <InfoRow icon={Shield} label="Blood Group" value={profile?.bloodGroup} />
                      <InfoRow icon={Users} label="Marital Status" value={profile?.maritalStatus} />
                      <InfoRow icon={Users} label="Father's Name" value={profile?.fatherName} />
                      <InfoRow icon={Building} label="Employment Type" value={profile?.employmentType} />
                      <InfoRow icon={Building} label="Joining Date" value={profile?.joiningDate?.split('T')[0]} />
                      <InfoRow icon={Phone} label="Emergency Contact" value={profile?.emergencyName} />
                      <InfoRow icon={Users} label="Emergency Relation" value={profile?.emergencyRelation} />
                      <InfoRow icon={Phone} label="Emergency Phone" value={profile?.emergencyPhone} />
                    </>
                  )}
                </div>
              </AccessibleTabPanel>

              <AccessibleTabPanel id="employee-panel-identity" labelledBy="employee-tab-identity" hidden={tab !== 'identity'}>
                <div className="space-y-6">
                  <Section title="Identity">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {editing ? (
                        <>
                          <Field label="PAN" value={formData.pan} onChange={v => setFormData({...formData, pan: v.toUpperCase()})} maxLength={10} />
                          <Field label="Aadhaar" value={formData.aadhaar} onChange={v => setFormData({...formData, aadhaar: v})} maxLength={12} />
                          <Field label="Passport No" value={formData.passportNo} onChange={v => setFormData({...formData, passportNo: v})} />
                          <Field label="UAN Number" value={formData.uanNumber} onChange={v => setFormData({...formData, uanNumber: v})} />
                        </>
                      ) : (
                        <>
                          <InfoRow icon={CreditCard} label="PAN" value={profile?.pan} />
                          <InfoRow icon={CreditCard} label="Aadhaar" value={profile?.aadhaar} />
                          <InfoRow icon={CreditCard} label="Passport" value={profile?.passportNo} />
                          <InfoRow icon={CreditCard} label="UAN" value={profile?.uanNumber} />
                        </>
                      )}
                    </div>
                  </Section>
                  <Section title="Current Address">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {editing ? (
                        <>
                          <Field label="Address" value={formData.currentAddress} onChange={v => setFormData({...formData, currentAddress: v})} full />
                          <Field label="City" value={formData.currentCity} onChange={v => setFormData({...formData, currentCity: v})} />
                          <Field label="State" value={formData.currentState} onChange={v => setFormData({...formData, currentState: v})} />
                          <Field label="Pincode" value={formData.currentPincode} onChange={v => setFormData({...formData, currentPincode: v})} maxLength={6} />
                        </>
                      ) : (
                        <>
                          <InfoRow icon={MapPin} label="Address" value={profile?.currentAddress} />
                          <InfoRow icon={MapPin} label="City" value={profile?.currentCity} />
                          <InfoRow icon={MapPin} label="State" value={profile?.currentState} />
                          <InfoRow icon={MapPin} label="Pincode" value={profile?.currentPincode} />
                        </>
                      )}
                    </div>
                  </Section>
                  <Section title="Permanent Address">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {editing ? (
                        <>
                          <Field label="Address" value={formData.permanentAddress} onChange={v => setFormData({...formData, permanentAddress: v})} full />
                          <Field label="City" value={formData.permanentCity} onChange={v => setFormData({...formData, permanentCity: v})} />
                          <Field label="State" value={formData.permanentState} onChange={v => setFormData({...formData, permanentState: v})} />
                          <Field label="Pincode" value={formData.permanentPincode} onChange={v => setFormData({...formData, permanentPincode: v})} maxLength={6} />
                        </>
                      ) : (
                        <>
                          <InfoRow icon={MapPin} label="Address" value={profile?.permanentAddress} />
                          <InfoRow icon={MapPin} label="City" value={profile?.permanentCity} />
                          <InfoRow icon={MapPin} label="State" value={profile?.permanentState} />
                          <InfoRow icon={MapPin} label="Pincode" value={profile?.permanentPincode} />
                        </>
                      )}
                    </div>
                  </Section>
                  <Section title="Bank Details">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {editing ? (
                        <>
                          <Field label="Bank Name" value={formData.bankName} onChange={v => setFormData({...formData, bankName: v})} />
                          <Field label="Branch" value={formData.bankBranch} onChange={v => setFormData({...formData, bankBranch: v})} />
                          <Field label="Account Number" value={formData.accountNumber} onChange={v => setFormData({...formData, accountNumber: v})} />
                          <Field label="IFSC Code" value={formData.ifscCode} onChange={v => setFormData({...formData, ifscCode: v})} />
                        </>
                      ) : (
                        <>
                          <InfoRow icon={Building} label="Bank" value={profile?.bankName} />
                          <InfoRow icon={Building} label="Branch" value={profile?.bankBranch} />
                          <InfoRow icon={CreditCard} label="Account No" value={profile?.accountNumber} />
                          <InfoRow icon={CreditCard} label="IFSC" value={profile?.ifscCode} />
                        </>
                      )}
                    </div>
                  </Section>
                </div>
              </AccessibleTabPanel>

              <AccessibleTabPanel id="employee-panel-salary" labelledBy="employee-tab-salary" hidden={tab !== 'salary'}>
                <div className="space-y-6">
                  {!isAdmin && !editing ? (
                    <div className="text-center py-10 text-foreground-muted">
                      <Shield size={40} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Salary details are restricted to Partners and Admins</p>
                    </div>
                  ) : (
                    <>
                      <Section title="Earnings">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {editing ? (
                            <>
                              <NumField label="Basic Salary" value={salaryData.basicSalary} onChange={v => setSalaryData({...salaryData, basicSalary: v})} />
                              <NumField label="HRA" value={salaryData.hra} onChange={v => setSalaryData({...salaryData, hra: v})} />
                              <NumField label="DA" value={salaryData.da} onChange={v => setSalaryData({...salaryData, da: v})} />
                              <NumField label="Special Allowance" value={salaryData.specialAllowance} onChange={v => setSalaryData({...salaryData, specialAllowance: v})} />
                              <NumField label="Conveyance" value={salaryData.conveyance} onChange={v => setSalaryData({...salaryData, conveyance: v})} />
                              <NumField label="Medical Allowance" value={salaryData.medicalAllowance} onChange={v => setSalaryData({...salaryData, medicalAllowance: v})} />
                              <NumField label="Other Allowances" value={salaryData.otherAllowances} onChange={v => setSalaryData({...salaryData, otherAllowances: v})} />
                            </>
                          ) : (
                            <>
                              <InfoRow icon={DollarSign} label="Basic" value={formatCurrency(profile?.salaryStructure?.basicSalary || 0)} />
                              <InfoRow icon={DollarSign} label="HRA" value={formatCurrency(profile?.salaryStructure?.hra || 0)} />
                              <InfoRow icon={DollarSign} label="DA" value={formatCurrency(profile?.salaryStructure?.da || 0)} />
                              <InfoRow icon={DollarSign} label="Special Allow." value={formatCurrency(profile?.salaryStructure?.specialAllowance || 0)} />
                              <InfoRow icon={DollarSign} label="Conveyance" value={formatCurrency(profile?.salaryStructure?.conveyance || 0)} />
                              <InfoRow icon={DollarSign} label="Medical" value={formatCurrency(profile?.salaryStructure?.medicalAllowance || 0)} />
                              <InfoRow icon={DollarSign} label="Other" value={formatCurrency(profile?.salaryStructure?.otherAllowances || 0)} />
                            </>
                          )}
                        </div>
                      </Section>
                      <Section title="Deductions">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {editing ? (
                            <>
                              <NumField label="PF" value={salaryData.pf} onChange={v => setSalaryData({...salaryData, pf: v})} />
                              <NumField label="ESI" value={salaryData.esi} onChange={v => setSalaryData({...salaryData, esi: v})} />
                              <NumField label="Professional Tax" value={salaryData.professionalTax} onChange={v => setSalaryData({...salaryData, professionalTax: v})} />
                              <NumField label="TDS" value={salaryData.tds} onChange={v => setSalaryData({...salaryData, tds: v})} />
                              <NumField label="Other Deductions" value={salaryData.otherDeductions} onChange={v => setSalaryData({...salaryData, otherDeductions: v})} />
                              <NumField label="CTC" value={salaryData.ctc} onChange={v => setSalaryData({...salaryData, ctc: v})} />
                            </>
                          ) : (
                            <>
                              <InfoRow icon={DollarSign} label="PF" value={formatCurrency(profile?.salaryStructure?.pf || 0)} />
                              <InfoRow icon={DollarSign} label="ESI" value={formatCurrency(profile?.salaryStructure?.esi || 0)} />
                              <InfoRow icon={DollarSign} label="Prof. Tax" value={formatCurrency(profile?.salaryStructure?.professionalTax || 0)} />
                              <InfoRow icon={DollarSign} label="TDS" value={formatCurrency(profile?.salaryStructure?.tds || 0)} />
                              <InfoRow icon={DollarSign} label="Other Ded." value={formatCurrency(profile?.salaryStructure?.otherDeductions || 0)} />
                              <InfoRow icon={DollarSign} label="CTC" value={formatCurrency(profile?.salaryStructure?.ctc || 0)} />
                            </>
                          )}
                        </div>
                      </Section>
                    </>
                  )}
                </div>
              </AccessibleTabPanel>

              <AccessibleTabPanel id="employee-panel-documents" labelledBy="employee-tab-documents" hidden={tab !== 'documents'}>
                <div className="space-y-4">
                  {canEdit && <DocUpload onUpload={uploadDoc} />}
                  {profile?.employeeDocuments?.length ? (
                    <div className="space-y-2">
                      {profile.employeeDocuments.map(doc => (
                        <div key={doc.id} className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border">
                          <FileText size={18} className="text-primary shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{doc.originalName}</p>
                            <p className="text-xs text-foreground-muted">{doc.docType} · {formatSize(doc.size)}</p>
                          </div>
                          <a
                            href={`${api.defaults.baseURL}/employees/${selected.id}/documents/${doc.id}/download`}
                            className="p-1.5 rounded hover:bg-hover-bg text-foreground-muted hover:text-foreground"
                          >
                            <Download size={15} />
                          </a>
                          {isAdmin && (
                            <button type="button" onClick={() => deleteDoc(doc.id)} className="p-1.5 rounded hover:bg-red-50 text-foreground-muted hover:text-red-600">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-muted text-center py-8">No documents uploaded</p>
                  )}
                </div>
              </AccessibleTabPanel>
            </div>
          )
        }
      />
    </AppPageContainer>
  );
}

// ─── Reusable components ───

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border">
      <Icon size={16} className="text-foreground-muted shrink-0" />
      <div>
        <p className="text-xs text-foreground-muted">{label}</p>
        <p className="text-sm font-medium text-foreground">{value || '—'}</p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', options, maxLength, full }: {
  label: string; value?: string; onChange: (v: string) => void;
  type?: string; options?: string[]; maxLength?: number; full?: boolean;
}) {
  const fieldId = `employee-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label htmlFor={fieldId} className="block text-xs font-medium text-foreground-muted mb-1">{label}</label>
      {options ? (
        <select id={fieldId} aria-label={label} value={value || ''} onChange={e => onChange(e.target.value)} className="input text-sm">
          <option value="">Select...</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          id={fieldId}
          type={type}
          aria-label={label}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          maxLength={maxLength}
          className="input text-sm"
        />
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value?: number; onChange: (v: number) => void }) {
  const fieldId = `employee-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div>
      <label htmlFor={fieldId} className="block text-xs font-medium text-foreground-muted mb-1">{label}</label>
      <input
        id={fieldId}
        type="number"
        min={0}
        aria-label={label}
        value={value ?? 0}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="input text-sm"
      />
    </div>
  );
}

function DocUpload({ onUpload }: { onUpload: (file: File, docType: string) => void }) {
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  return (
    <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border border-dashed">
      <select value={docType} onChange={e => setDocType(e.target.value)} className="input text-sm w-48">
        {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <Button asChild size="sm" variant="outline" className="cursor-pointer gap-1.5">
        <label>
          <Upload size={14} /> Upload
          <input type="file" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (f) onUpload(f, docType);
            e.target.value = '';
          }} />
        </label>
      </Button>
    </div>
  );
}
