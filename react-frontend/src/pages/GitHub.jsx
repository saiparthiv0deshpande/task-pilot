import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, GitBranch as Github, Link2, ShieldCheck, Unplug } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { authRequest } from '../lib/api';

export default function GitHubPage() {
  const { accessToken, user, setUser, githubEnabled } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true); setError('');
    try {
      const response = await authRequest(accessToken, { url: '/auth/github/connect', method: 'post', data: { returnTo: '/github' } });
      window.location.assign(response.data.authorizationUrl);
    } catch (e) { setError(e.response?.data?.message || 'GitHub could not be connected.'); setBusy(false); }
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect GitHub? The assistant will lose access to your repositories and issues.')) return;
    setBusy(true); setError('');
    try {
      const response = await authRequest(accessToken, { url: '/auth/github', method: 'delete' });
      setUser(response.data.user);
    } catch (e) { setError(e.response?.data?.message || 'GitHub could not be disconnected.'); }
    finally { setBusy(false); }
  };

  return <div className="page-content github-page">
    <div className="page-heading-row"><div><span className="eyebrow">INTEGRATIONS</span><h1>GitHub</h1><p>Bring repository and issue work into your assistant.</p></div></div>
    {error && <div className="form-error page-alert" role="alert">{error}</div>}
    <section className="integration-card panel">
      <div className="integration-icon"><Github size={26}/></div>
      <div className="integration-copy"><span className={`connection-status ${user?.githubConnected ? 'connected' : ''}`}><i/>{user?.githubConnected ? 'Connected' : githubEnabled ? 'Not connected' : 'Unavailable'}</span><h2>{user?.githubConnected ? `Connected as @${user.githubUsername || 'GitHub user'}` : githubEnabled ? 'Connect your GitHub account' : 'GitHub is not configured'}</h2><p>{user?.githubConnected ? 'Task Pilot can use your authorized GitHub account to list repositories, review issues, and create issues when you ask in chat.' : githubEnabled ? 'Connect GitHub to let the assistant help with your repositories and issues. You can keep using tasks and chat without connecting.' : 'Email sign-in and task management remain available. A workspace administrator must configure GitHub OAuth before accounts can connect.'}</p>{user?.githubConnected ? <div className="connection-detail"><ShieldCheck size={16}/> Your GitHub access is stored encrypted and used only for your requests.</div> : githubEnabled && <div className="connection-detail"><Link2 size={16}/> You’ll review and approve access on GitHub.</div>}</div>
      <div className="integration-actions">{user?.githubConnected ? <button className="secondary-button danger-button" disabled={busy} onClick={disconnect}><Unplug size={17}/>{busy ? 'Disconnecting…' : 'Disconnect'}</button> : <button className="primary-button" disabled={busy || !githubEnabled} onClick={connect}><Github size={17}/>{busy ? 'Connecting…' : 'Connect GitHub'}</button>}</div>
    </section>
    {githubEnabled && <section className="github-help-grid"><article className="panel help-card"><span className="help-icon"><CheckCircle2 size={19}/></span><h3>What you can ask</h3><ul><li>List my repositories</li><li>Show open issues in a repository</li><li>Create an issue with a title and description</li></ul></article><article className="panel help-card"><span className="help-icon lavender"><ShieldCheck size={19}/></span><h3>You stay in control</h3><p>GitHub tools are available only while your account is connected. Disconnect any time from this page.</p><Link className="text-link" to="/settings">Account settings <ArrowUpRight size={14}/></Link></article></section>}
    {githubEnabled && <div className="github-chat-cta"><div><strong>Ready to use GitHub in chat?</strong><span>Ask naturally, for example: “Show open issues in my project.”</span></div><Link className="primary-button" to="/chat">Open assistant <ArrowUpRight size={16}/></Link></div>}
  </div>;
}
