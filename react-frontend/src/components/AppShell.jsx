import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CheckSquare2, Home, LogOut, Menu, MessageCircle, Settings, GitBranch as Github, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const navigation = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare2 },
  { to: '/chat', label: 'Assistant', icon: MessageCircle },
  { to: '/github', label: 'GitHub', icon: Github },
];

export default function AppShell() {
  const { user, githubEnabled, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const signOut = async () => { await logout(); navigate('/login', { replace: true }); };
  const closeMenu = () => setMenuOpen(false);
  return <div className="app-frame">
    <button className="mobile-menu-button icon-button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X/> : <Menu/>}</button>
    {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={closeMenu}/>}
    <aside className={`app-sidebar ${menuOpen ? 'is-open' : ''}`}>
      <NavLink to="/" className="brand-lockup" onClick={closeMenu}><span className="brand-mark">TP</span><span>Task Pilot</span></NavLink>
      <div className="sidebar-section-label">Workspace</div>
      <nav className="primary-nav" aria-label="Main navigation">{navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={closeMenu} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={18}/><span>{label}</span>{label === 'GitHub' && githubEnabled && !user?.githubConnected && <span className="nav-dot"/>}</NavLink>)}</nav>
      <div className="sidebar-spacer"/>
      <div className="sidebar-tip"><span className="tip-spark">✦</span><p>Small steps add up.<br/>Keep your focus on what matters.</p></div>
      <NavLink to="/settings" onClick={closeMenu} className={({ isActive }) => `nav-link settings-link ${isActive ? 'active' : ''}`}><Settings size={18}/><span>Settings</span></NavLink>
      <div className="account-card">
        <div className="avatar">{user?.avatarUrl ? <img src={user.avatarUrl} alt=""/> : (user?.displayName || user?.email || 'U').slice(0, 1).toUpperCase()}</div>
        <div className="account-copy"><strong>{user?.displayName || 'Your account'}</strong><span>{user?.email || (user?.githubConnected ? `@${user.githubUsername}` : 'Task Pilot')}</span></div>
        <button className="icon-button signout-button" aria-label="Log out" title="Log out" onClick={signOut}><LogOut size={17}/></button>
      </div>
    </aside>
    <main className="app-main"><Outlet/></main>
  </div>;
}
