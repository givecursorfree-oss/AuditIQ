import { useState } from 'react';
import AuditIQLogo from '@/components/brand/AuditIQLogo';
import { useAppConfig } from '../hooks/useAppConfig';
import { useNavigate, Link } from 'react-router-dom';
import {
  Buildings,
  User,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeSlash as EyeOff,
  CheckCircle,
  Warning,
  Envelope,
  Phone,
  MapPin,
  IdentificationCard,
} from '@phosphor-icons/react';
import api from '../services/api';

type RegistrationPath = null | 'client' | 'firm';

const ENTITY_TYPES = [
  'Individual',
  'Proprietorship',
  'Partnership',
  'LLP',
  'Private Limited',
  'Public Limited',
  'Trust',
  'HUF',
  'Other',
] as const;

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const PASSWORD_STRENGTH = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/;

function RegisterLegalFooter() {
  return (
    <footer className="py-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
      <Link to="/privacy-policy" className="hover:text-foreground">
        Privacy Policy
      </Link>
      <Link to="/terms-of-service" className="hover:text-foreground">
        Terms of Service
      </Link>
      <Link to="/security-compliance" className="hover:text-foreground">
        Security Compliance
      </Link>
    </footer>
  );
}

export default function Register() {
  const [path, setPath] = useState<RegistrationPath>(null);
  const navigate = useNavigate();
  const { allowStaffRegistration } = useAppConfig();

  if (path === null) {
    return <RoleSelection onSelect={setPath} allowStaffRegistration={allowStaffRegistration} />;
  }

  if (path === 'firm') {
    return <FirmRegistrationForm onBack={() => setPath(null)} />;
  }

  return <ClientRegistrationForm onBack={() => setPath(null)} />;
}

function RoleSelection({
  onSelect,
  allowStaffRegistration,
}: {
  onSelect: (p: RegistrationPath) => void;
  allowStaffRegistration: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-10">
          <AuditIQLogo className="h-16 w-auto mx-auto object-contain" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Create your account
        </h2>
        <p className="text-gray-500 text-center mb-10">
          Choose how you'd like to register with AuditIQ
        </p>

        <div className={`grid grid-cols-1 ${allowStaffRegistration ? 'sm:grid-cols-2' : ''} gap-5`}>
          <button
            type="button"
            onClick={() => onSelect('client')}
            className="group relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-500 hover:shadow-lg transition-[border-color,box-shadow] duration-200 text-left"
          >
            <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
              <User size={28} className="text-blue-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Register as a Client
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Track your engagements, share documents, and communicate with your CA firm
              </p>
            </div>
            <ArrowRight
              size={18}
              className="absolute top-4 right-4 text-gray-300 group-hover:text-blue-500 transition-colors"
            />
          </button>

          {allowStaffRegistration && (
            <button
              type="button"
              onClick={() => onSelect('firm')}
              className="group relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-500 hover:shadow-lg transition-[border-color,box-shadow] duration-200 text-left"
            >
              <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Buildings size={28} className="text-blue-600" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  Register as a Firm / Staff
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  For CA firm partners, managers, and staff to manage audits and engagements
                </p>
              </div>
              <ArrowRight
                size={18}
                className="absolute top-4 right-4 text-gray-300 group-hover:text-blue-500 transition-colors"
              />
            </button>
          )}
        </div>

        {!allowStaffRegistration && (
          <p className="mt-6 text-center text-sm text-gray-500">
            CA firm staff accounts are created by your administrator. Clients may register below.
          </p>
        )}

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-blue-600 font-semibold hover:underline underline-offset-4"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
      </div>
      <RegisterLegalFooter />
    </div>
  );
}

function FirmRegistrationForm({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'Partner',
    firmName: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/register', {
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        firmName: form.firmName || undefined,
      });
      navigate('/login?registered=1');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Registration failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <AuditIQLogo className="h-16 w-auto mx-auto object-contain" />
        </div>

        <div className="card p-8">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <h2 className="text-xl font-bold text-gray-900 mb-1">
            Firm / Staff Registration
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Set up your firm&apos;s audit workspace
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  aria-label="First Name"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-[background-color,border-color,box-shadow]"
                  placeholder="Rajesh"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  aria-label="Last Name"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-[background-color,border-color,box-shadow]"
                  placeholder="Sharma"
                />
              </div>
            </div>

            <div>
              <label htmlFor="firmName" className="block text-sm font-medium text-gray-700 mb-1.5">
                Firm Name
              </label>
              <input
                id="firmName"
                name="firmName"
                aria-label="Firm Name"
                value={form.firmName}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-[background-color,border-color,box-shadow]"
                placeholder="M.K. Dandeker & Co LLP"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                aria-label="Email"
                value={form.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-[background-color,border-color,box-shadow]"
                placeholder="partner@firm.in"
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1.5">
                Role
              </label>
              <select
                id="role"
                name="role"
                aria-label="Role"
                value={form.role}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-[background-color,border-color,box-shadow]"
              >
                <option value="Partner">Partner</option>
                <option value="Manager">Manager</option>
                <option value="Staff">Staff</option>
              </select>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  aria-label="Password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-[background-color,border-color,box-shadow]"
                  placeholder="Min 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  aria-label="Confirm Password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-[background-color,border-color,box-shadow]"
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 px-4 flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none mt-2"
            >
              {loading ? 'Creating account...' : 'Create Account'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-blue-600 font-semibold hover:underline underline-offset-4"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
      </div>
      <RegisterLegalFooter />
    </div>
  );
}

function ClientRegistrationForm({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({
    fullName: '',
    entityType: '' as string,
    pan: '',
    gstin: '',
    dateOfBirth: '',
    email: '',
    mobile: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    password: '',
    confirmPassword: '',
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [docAccessAccepted, setDocAccessAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const passwordChecks = {
    length: form.password.length >= 8,
    uppercase: /[A-Z]/.test(form.password),
    number: /[0-9]/.test(form.password),
    special: /[!@#$%^&*]/.test(form.password),
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!form.fullName.trim()) errs.fullName = 'Full name is required';
    if (!form.entityType) errs.entityType = 'Entity type is required';
    if (!PAN_REGEX.test(form.pan)) errs.pan = 'Invalid PAN format (e.g. ABCDE1234F)';
    if (
      form.gstin &&
      form.entityType !== 'Individual' &&
      !GSTIN_REGEX.test(form.gstin)
    )
      errs.gstin = 'Invalid GSTIN format';
    if (!form.email) errs.email = 'Email is required';
    if (!MOBILE_REGEX.test(form.mobile))
      errs.mobile = 'Enter a valid 10-digit mobile number';
    if (!form.password || !PASSWORD_STRENGTH.test(form.password))
      errs.password = 'Password does not meet requirements';
    if (form.password.length < 8)
      errs.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword)
      errs.confirmPassword = 'Passwords do not match';
    if (!termsAccepted) errs.terms = 'You must accept the Terms of Service';
    if (!docAccessAccepted)
      errs.docAccess = 'You must authorise document access';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setLoading(true);
    try {
      await api.post('/auth/register-client', {
        email: form.email,
        password: form.password,
        firstName: form.fullName.split(' ')[0] || form.fullName,
        lastName: form.fullName.split(' ').slice(1).join(' '),
        entityType: form.entityType,
        entityName: form.fullName,
        pan: form.pan.toUpperCase(),
        gstin: form.gstin ? form.gstin.toUpperCase() : undefined,
        mobile: form.mobile,
        address: form.address,
        city: form.city,
        state: form.state,
        pinCode: form.pinCode,
        dateOfBirth: form.dateOfBirth || undefined,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Registration failed. Please try again.';
      setServerError(message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6">
            <AuditIQLogo className="h-16 w-auto mx-auto object-contain" />
          </div>
          <div className="card p-10">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={36} weight="fill" className="text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Account Created
            </h2>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Your account has been created. Please verify your email to
              continue.
            </p>
            <Link
              to="/login"
              className="btn-primary inline-flex items-center gap-2 py-3 px-8"
            >
              Go to Login
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const inputCls =
    'w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-[background-color,border-color,box-shadow] text-gray-900';
  const errorInputCls =
    'w-full px-4 py-2.5 bg-red-50/50 border border-red-300 rounded-xl focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10 outline-none transition-[background-color,border-color,box-shadow] text-red-900';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <div className="flex-1 flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <AuditIQLogo className="h-16 w-auto mx-auto object-contain" />
        </div>

        <div className="card p-8">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <h2 className="text-xl font-bold text-gray-900 mb-1">
            Client Registration
          </h2>
          <p className="text-sm text-gray-500 mb-8">
            Register to track engagements and share documents with your CA firm
          </p>

          {serverError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm font-medium flex items-start gap-3">
              <Warning size={18} className="flex-shrink-0 mt-0.5" />
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Entity Details */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <IdentificationCard size={20} className="text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                  Entity Details
                </h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="fullName" className={labelCls}>
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    aria-label="Full Name"
                    value={form.fullName}
                    onChange={handleChange}
                    className={errors.fullName ? errorInputCls : inputCls}
                    placeholder="Name of individual or entity"
                  />
                  {errors.fullName && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.fullName}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="entityType" className={labelCls}>
                      Entity Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="entityType"
                      name="entityType"
                      aria-label="Entity Type"
                      value={form.entityType}
                      onChange={handleChange}
                      className={errors.entityType ? errorInputCls : inputCls}
                    >
                      <option value="">Select type</option>
                      {ENTITY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    {errors.entityType && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.entityType}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="pan" className={labelCls}>
                      PAN Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="pan"
                      name="pan"
                      aria-label="PAN Number"
                      value={form.pan}
                      onChange={(e) => {
                        const v = e.target.value.toUpperCase().slice(0, 10);
                        setForm((prev) => ({ ...prev, pan: v }));
                        if (errors.pan)
                          setErrors((prev) => {
                            const n = { ...prev };
                            delete n.pan;
                            return n;
                          });
                      }}
                      maxLength={10}
                      className={errors.pan ? errorInputCls : inputCls}
                      placeholder="ABCDE1234F"
                    />
                    {errors.pan && (
                      <p className="text-red-500 text-xs mt-1">{errors.pan}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {form.entityType && form.entityType !== 'Individual' && (
                    <div>
                      <label htmlFor="gstin" className={labelCls}>GSTIN</label>
                      <input
                        id="gstin"
                        name="gstin"
                        aria-label="GSTIN"
                        value={form.gstin}
                        onChange={(e) => {
                          const v = e.target.value.toUpperCase().slice(0, 15);
                          setForm((prev) => ({ ...prev, gstin: v }));
                          if (errors.gstin)
                            setErrors((prev) => {
                              const n = { ...prev };
                              delete n.gstin;
                              return n;
                            });
                        }}
                        maxLength={15}
                        className={errors.gstin ? errorInputCls : inputCls}
                        placeholder="22ABCDE1234F1Z5"
                      />
                      {errors.gstin && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.gstin}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label htmlFor="dateOfBirth" className={labelCls}>
                      {form.entityType === 'Individual'
                        ? 'Date of Birth'
                        : 'Date of Incorporation'}
                    </label>
                    <input
                      id="dateOfBirth"
                      name="dateOfBirth"
                      type="date"
                      aria-label={form.entityType === 'Individual' ? 'Date of Birth' : 'Date of Incorporation'}
                      value={form.dateOfBirth}
                      onChange={handleChange}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Contact Details */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Envelope size={20} className="text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                  Contact Details
                </h3>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="client-email" className={labelCls}>
                      Primary Email <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Envelope
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        id="client-email"
                        name="email"
                        type="email"
                        aria-label="Primary Email"
                        value={form.email}
                        onChange={handleChange}
                        required
                        className={`${errors.email ? errorInputCls : inputCls} pl-9`}
                        placeholder="you@example.com"
                      />
                    </div>
                    {errors.email && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="mobile" className={labelCls}>
                      Mobile Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        id="mobile"
                        name="mobile"
                        aria-label="Mobile Number"
                        value={form.mobile}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setForm((prev) => ({ ...prev, mobile: v }));
                          if (errors.mobile)
                            setErrors((prev) => {
                              const n = { ...prev };
                              delete n.mobile;
                              return n;
                            });
                        }}
                        maxLength={10}
                        className={`${errors.mobile ? errorInputCls : inputCls} pl-9`}
                        placeholder="9876543210"
                      />
                    </div>
                    {errors.mobile && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.mobile}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="address" className={labelCls}>Street Address</label>
                  <div className="relative">
                    <MapPin
                      size={16}
                      className="absolute left-3 top-3 text-gray-400"
                    />
                    <input
                      id="address"
                      name="address"
                      aria-label="Street Address"
                      value={form.address}
                      onChange={handleChange}
                      className={`${inputCls} pl-9`}
                      placeholder="123 Main Street"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="city" className={labelCls}>City</label>
                    <input
                      id="city"
                      name="city"
                      aria-label="City"
                      value={form.city}
                      onChange={handleChange}
                      className={inputCls}
                      placeholder="Mumbai"
                    />
                  </div>
                  <div>
                    <label htmlFor="state" className={labelCls}>State</label>
                    <input
                      id="state"
                      name="state"
                      aria-label="State"
                      value={form.state}
                      onChange={handleChange}
                      className={inputCls}
                      placeholder="Maharashtra"
                    />
                  </div>
                  <div>
                    <label htmlFor="pinCode" className={labelCls}>PIN Code</label>
                    <input
                      id="pinCode"
                      name="pinCode"
                      aria-label="PIN Code"
                      value={form.pinCode}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setForm((prev) => ({ ...prev, pinCode: v }));
                      }}
                      maxLength={6}
                      className={inputCls}
                      placeholder="400001"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Login Credentials */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Eye size={20} className="text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                  Login Credentials
                </h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="client-password" className={labelCls}>
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="client-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      aria-label="Password"
                      value={form.password}
                      onChange={handleChange}
                      className={`${errors.password ? errorInputCls : inputCls} pr-10`}
                      placeholder="Create a strong password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.password}
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {[
                      { key: 'length', label: 'Min 8 characters' },
                      { key: 'uppercase', label: '1 uppercase letter' },
                      { key: 'number', label: '1 number' },
                      { key: 'special', label: '1 special char (!@#$%^&*)' },
                    ].map(({ key, label }) => (
                      <div
                        key={key}
                        className={`flex items-center gap-1.5 text-xs ${
                          passwordChecks[key as keyof typeof passwordChecks]
                            ? 'text-green-600'
                            : 'text-gray-400'
                        }`}
                      >
                        <CheckCircle
                          size={12}
                          weight={
                            passwordChecks[key as keyof typeof passwordChecks]
                              ? 'fill'
                              : 'regular'
                          }
                        />
                        {label}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="client-confirm-password" className={labelCls}>
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="client-confirm-password"
                      name="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      aria-label="Confirm Password"
                      value={form.confirmPassword}
                      onChange={handleChange}
                      className={`${errors.confirmPassword ? errorInputCls : inputCls} pr-10`}
                      placeholder="Re-enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirm ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Consent */}
            <section>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked);
                      if (errors.terms)
                        setErrors((prev) => {
                          const n = { ...prev };
                          delete n.terms;
                          return n;
                        });
                    }}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span
                    className={`text-sm ${errors.terms ? 'text-red-600' : 'text-gray-600'}`}
                  >
                    I agree to the{' '}
                    <a href="/terms-of-service" className="text-blue-600 underline">
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="/privacy-policy" className="text-blue-600 underline">
                      Privacy Policy
                    </a>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={docAccessAccepted}
                    onChange={(e) => {
                      setDocAccessAccepted(e.target.checked);
                      if (errors.docAccess)
                        setErrors((prev) => {
                          const n = { ...prev };
                          delete n.docAccess;
                          return n;
                        });
                    }}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span
                    className={`text-sm ${errors.docAccess ? 'text-red-600' : 'text-gray-600'}`}
                  >
                    I authorise the firm to access my submitted documents for the
                    purpose of the engagement
                  </span>
                </label>
              </div>
            </section>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 px-4 flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
            >
              {loading ? 'Creating account...' : 'Create Client Account'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-blue-600 font-semibold hover:underline underline-offset-4"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
      </div>
      <RegisterLegalFooter />
    </div>
  );
}
