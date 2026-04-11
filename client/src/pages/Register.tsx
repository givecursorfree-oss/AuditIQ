import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Register() {
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
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
      await register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        firmName: form.firmName || undefined,
      });
      navigate('/');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Registration failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="AuditIQ – Smart Audit Platform" className="h-16 w-auto mx-auto object-contain dark:brightness-0 dark:invert" />
        </div>

        {/* Card */}
        <div className="card">
          <h2 className="text-lg font-semibold text-foreground mb-1">Create Account</h2>
          <p className="text-sm text-foreground-muted mb-6">Set up your firm&apos;s audit workspace</p>

          {error && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">First Name</label>
                <input name="firstName" value={form.firstName} onChange={handleChange} required className="input-field" placeholder="Rajesh" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Last Name</label>
                <input name="lastName" value={form.lastName} onChange={handleChange} required className="input-field" placeholder="Sharma" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Firm Name</label>
              <input name="firmName" value={form.firmName} onChange={handleChange} className="input-field" placeholder="Sharma & Associates" />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} required className="input-field" placeholder="partner@firm.in" />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Role</label>
              <select name="role" value={form.role} onChange={handleChange} className="input-field">
                <option value="Partner">Partner</option>
                <option value="Manager">Manager</option>
                <option value="Staff">Staff</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Password</label>
              <div className="relative">
                <input name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={handleChange} required className="input-field pr-10" placeholder="Min 8 characters" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">Confirm Password</label>
              <div className="relative">
                <input name="confirmPassword" type={showConfirm ? 'text' : 'password'} value={form.confirmPassword} onChange={handleChange} required className="input-field pr-10" placeholder="Confirm your password" />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? 'Creating account...' : 'Create Account'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-foreground-muted">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
