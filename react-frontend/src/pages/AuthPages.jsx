import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { GitBranch as Github, LockKeyhole, Mail, MoveRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { authApi } from '../lib/api';
import { AUTH_URL } from '../lib/config';

function AuthFrame({ children, subtitle }) {
  return <main className="auth-screen">
    <section className="auth-card">
      <Link to="/login" className="brand-lockup"><span className="brand-mark">TP</span><span>Task Pilot</span></Link>
      <p className="auth-subtitle">{subtitle}</p>
      {children}
    </section>
    <p className="auth-note">A calmer way to keep your work moving.</p>
  </main>;
}

export function Login() {
  const { accessToken, isLoading, saveSession, githubEnabled } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [params] = useSearchParams();

  useEffect(() => {
    if (params.get('verified')) setNotice('Email verified. Sign in to continue.');
    else if (location.state?.notice) setNotice(location.state.notice);
  }, [params, location.state]);
  if (!isLoading && accessToken) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault(); setError(''); setVerificationNeeded(false); setBusy(true);
    try {
      const response = await authApi.post('/auth/login', form);
      saveSession(response.data);
      const destination = typeof location.state?.from === 'string' && location.state.from.startsWith('/') ? location.state.from : '/';
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not sign in. Please try again.');
      setVerificationNeeded(requestError.response?.status === 403);
    } finally { setBusy(false); }
  };

  return <AuthFrame subtitle="Sign in to your workspace">
    {notice && <div className="notice-box">{notice}</div>}
    <form className="stack-form" onSubmit={submit}>
      <label>Email address<span className="input-wrap"><Mail size={17} /><input type="email" autoComplete="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></span></label>
      <label>Password<span className="input-wrap"><LockKeyhole size={17} /><input type="password" autoComplete="current-password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></span></label>
      {error && <div className="form-error" role="alert">{error}{verificationNeeded && <button type="button" className="text-link-button verify-inline" onClick={async () => { try { const r = await authApi.post('/auth/resend-verification', { email: form.email }); setNotice(r.data.message); } catch { setError('Could not send a verification link. Please try again.'); } }}>{notice || 'Resend verification email'}</button>}</div>}
      <div className="form-between"><Link to="/forgot-password">Forgot password?</Link></div>
      <button className="primary-button full-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<MoveRight size={17} /></button>
    </form>
    {githubEnabled && <><div className="auth-divider"><span>or</span></div><a className="secondary-button full-button" href={`${AUTH_URL}/auth/github`}><Github size={18} /> Continue with GitHub</a></>}
    <p className="auth-switch">New to Task Pilot? <Link to="/register">Create an account</Link></p>
  </AuthFrame>;
}

export function Register() {
  const { githubEnabled } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setNotice('');
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await authApi.post('/auth/register', { email: form.email, password: form.password });
      setNotice(response.data.message);
      setForm({ email: '', password: '', confirm: '' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not create your account. Please try again.');
    } finally { setBusy(false); }
  };
  return <AuthFrame subtitle="Create an account to organize your work">
    {notice ? <div className="success-panel"><Mail size={24} /><h2>Check your inbox</h2><p>{notice}</p><Link className="primary-button" to="/login">Back to sign in</Link></div> : <form className="stack-form" onSubmit={submit}>
      <label>Email address<span className="input-wrap"><Mail size={17} /><input type="email" autoComplete="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></span></label>
      <label>Password <small>At least 12 characters</small><span className="input-wrap"><LockKeyhole size={17} /><input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></span></label>
      <label>Confirm password<span className="input-wrap"><LockKeyhole size={17} /><input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} /></span></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="primary-button full-button" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}<MoveRight size={17} /></button>
    </form>}
    {githubEnabled && <><div className="auth-divider"><span>or</span></div><a className="secondary-button full-button" href={`${AUTH_URL}/auth/github`}><Github size={18} /> Sign up with GitHub</a></>}
    <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
  </AuthFrame>;
}

export function AuthCallback() {
  const { accessToken, isLoading } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const error = search.get('error');
  const next = ['/github', '/settings'].includes(search.get('next')) ? search.get('next') : '/';
  useEffect(() => { if (!isLoading && accessToken) navigate(next, { replace: true }); }, [accessToken, isLoading, navigate, next]);
  if (error) return <AuthFrame subtitle="GitHub sign-in could not be completed"><div className="form-error">The GitHub sign-in or connection could not be completed. Return and try again.</div><Link className="primary-button full-button" to="/login">Back to sign in</Link></AuthFrame>;
  return <div className="full-screen-state">Finishing sign-in…</div>;
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState('Verifying your email…');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setMessage('This verification link is missing its token.'); setFailed(true); return; }
    authApi.post('/auth/verify-email', { token }).then(r => setMessage(r.data.message)).catch(e => { setMessage(e.response?.data?.message || 'This link could not be verified.'); setFailed(true); });
  }, [params]);
  return <AuthFrame subtitle="Email verification"><div className={failed ? 'form-error' : 'notice-box'}>{message}</div><Link className="primary-button full-button" to="/login?verified=1">Continue to sign in</Link></AuthFrame>;
}

export function ForgotPassword() {
  const [email, setEmail] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const r = await authApi.post('/auth/forgot-password', { email }); setMessage(r.data.message); }
    catch (e) { setError(e.response?.data?.message || 'Could not request a reset link.'); }
    finally { setBusy(false); }
  };
  return <AuthFrame subtitle="We’ll email you a secure password reset link">
    {message ? <div className="notice-box">{message}</div> : <form className="stack-form" onSubmit={submit}><label>Email address<span className="input-wrap"><Mail size={17} /><input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></span></label>{error && <div className="form-error">{error}</div>}<button className="primary-button full-button" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button></form>}
    <p className="auth-switch"><Link to="/login">Back to sign in</Link></p>
  </AuthFrame>;
}

export function ResetPassword() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try { const r = await authApi.post('/auth/reset-password', { token: params.get('token'), password }); navigate(`/login?reset=1`, { replace: true, state: { notice: r.data.message } }); }
    catch (e) { setError(e.response?.data?.message || 'Could not reset the password.'); }
    finally { setBusy(false); }
  };
  return <AuthFrame subtitle="Choose a new password"><form className="stack-form" onSubmit={submit}><label>New password<span className="input-wrap"><LockKeyhole size={17} /><input type="password" minLength={12} maxLength={256} required value={password} onChange={e => setPassword(e.target.value)} /></span></label><label>Confirm password<span className="input-wrap"><LockKeyhole size={17} /><input type="password" minLength={12} maxLength={256} required value={confirm} onChange={e => setConfirm(e.target.value)} /></span></label>{error && <div className="form-error">{error}</div>}<button className="primary-button full-button" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></form></AuthFrame>;
}
