import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, KeyRound, Mail, Shield, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { authApi, authRequest } from '../lib/api';

export default function SettingsPage() {
  const { accessToken, user, setUser } = useAuth();
  const [email, setEmail] = useState(user?.pendingEmail || user?.email || '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reloadAccount = async () => {
    const response = await authRequest(accessToken, { url: '/auth/me' });
    setUser(response.data.user);
  };
  useEffect(() => {
    authRequest(accessToken, { url: '/auth/me' }).then(response => setUser(response.data.user)).catch(() => {});
  }, [accessToken, setUser]);
  useEffect(() => { setEmail(user?.pendingEmail || user?.email || ''); }, [user?.email, user?.pendingEmail]);
  const addEmail = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setStatus('');
    try { const response = await authRequest(accessToken, { url: '/auth/email', method: 'post', data: { email } }); setStatus(response.data.message); await reloadAccount(); }
    catch (e) { setError(e.response?.data?.message || 'Could not update your email.'); }
    finally { setBusy(false); }
  };
  const resendVerification = async () => {
    setBusy(true); setError(''); setStatus('');
    try { const response = await authApi.post('/auth/resend-verification', { email: user.pendingEmail || user.email }); setStatus(response.data.message); }
    catch (e) { setError(e.response?.data?.message || 'Could not send a verification link.'); }
    finally { setBusy(false); }
  };
  const setAccountPassword = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setStatus('');
    try { const response = await authRequest(accessToken, { url: '/auth/set-password', method: 'post', data: { password } }); setStatus(response.data.message); setPassword(''); await reloadAccount(); }
    catch (e) { setError(e.response?.data?.message || 'Could not enable password sign-in.'); }
    finally { setBusy(false); }
  };

  return <div className="page-content settings-page">
    <div className="page-heading-row"><div><span className="eyebrow">YOUR PREFERENCES</span><h1>Account settings</h1><p>Manage how you sign in and which services are connected.</p></div></div>
    {(status || error) && <div className={error ? 'form-error page-alert' : 'notice-box page-alert'} role="status">{error || status}</div>}
    <section className="settings-section panel"><div className="settings-section-title"><span className="settings-icon"><Mail size={19}/></span><div><h2>Email address</h2><p>Use your email to sign in and recover your account.</p></div></div>
      {(user?.email || user?.pendingEmail) && <div className="account-value-row"><span>{user.email || user.pendingEmail}</span>{user.emailVerified && <span className="verified-badge"><CheckCircle2 size={15}/> Verified</span>}{user.pendingEmail && <span className="pending-badge">New address pending: {user.pendingEmail}</span>}{user.email && !user.emailVerified && !user.pendingEmail && <span className="pending-badge">Verification needed</span>}</div>}
      <form className="settings-form" onSubmit={addEmail}><label>{user?.email ? 'Change email address' : 'Add an email address'}<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label><button className="secondary-button" disabled={busy || ((user?.pendingEmail || user?.email) === email)}>{busy ? 'Saving…' : user?.email ? 'Update email' : 'Add email'}</button></form>
      {user?.pendingEmail && <button className="text-link-button settings-verify" disabled={busy} onClick={resendVerification}>Resend verification email</button>}
      {user?.email && !user.emailVerified && !user.pendingEmail && <button className="text-link-button settings-verify" disabled={busy} onClick={resendVerification}>Resend verification email</button>}
    </section>
    <section className="settings-section panel"><div className="settings-section-title"><span className="settings-icon lavender"><KeyRound size={19}/></span><div><h2>Password sign-in</h2><p>{user?.passwordEnabled ? 'A password is enabled for this account.' : 'Add password sign-in so GitHub can be disconnected later if you choose.'}</p></div></div>
      {!user?.emailVerified ? <div className="settings-hint"><Shield size={16}/> Verify your email address before setting a password.</div> : user?.passwordEnabled ? <div className="account-value-row"><span>Password sign-in is enabled</span><Link className="text-link" to="/forgot-password">Reset password</Link></div> : <form className="settings-form" onSubmit={setAccountPassword}><label>Create a password <small>At least 12 characters</small><input type="password" minLength={12} maxLength={256} required value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"/></label><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Enable password sign-in'}</button></form>}
    </section>
    <section className="settings-section panel"><div className="settings-section-title"><span className="settings-icon mint"><ShieldCheck size={19}/></span><div><h2>Connected services</h2><p>Choose which external account Task Pilot can use.</p></div></div><div className="connected-service-row"><span className="github-mini-mark">GH</span><div><strong>GitHub</strong><small>{user?.githubConnected ? `Connected${user.githubUsername ? ` as @${user.githubUsername}` : ''}` : 'Not connected'}</small></div><Link className="secondary-button" to="/github">{user?.githubConnected ? 'Manage' : 'Connect'}</Link></div></section>
  </div>;
}
