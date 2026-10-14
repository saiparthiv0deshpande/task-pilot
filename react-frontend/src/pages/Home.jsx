import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, MessageCircle, Plus, Sparkles, CircleDashed } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../lib/api';

const dateLabel = (value) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

export default function Home() {
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiRequest(accessToken, { url: '/tasks' }),
      apiRequest(accessToken, { url: '/conversations' }),
    ]).then(([taskResponse, chatResponse]) => {
      setTasks(taskResponse.data.tasks);
      setConversations(chatResponse.data.conversations);
    }).catch(() => setError('Your overview could not be loaded. Please refresh the page.'));
  }, [accessToken]);

  const createChat = async () => {
    try {
      const response = await apiRequest(accessToken, { url: '/conversations', method: 'post', data: {} });
      navigate(`/chat/${response.data.conversation.conversationId}`);
    } catch { setError('Could not start a conversation. Please try again.'); }
  };
  const openTasks = tasks.filter(task => task.status !== 'done');
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dueSoon = openTasks.filter(task => task.dueDate && task.dueDate >= today).sort((left, right) => left.dueDate.localeCompare(right.dueDate)).slice(0, 4);

  return <div className="page-content home-page">
    <div className="welcome-row"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>Good to see you, {user?.displayName?.split(' ')[0] || 'there'}.</h1><p>Make a little progress on what matters today.</p></div><button className="primary-button" onClick={() => navigate('/tasks', { state: { create: true } })}><Plus size={18}/> Add a task</button></div>
    {error && <div className="form-error page-alert">{error}</div>}
    <section className="summary-grid" aria-label="Task overview">
      <article className="summary-card"><span className="summary-icon lilac"><CircleDashed size={20}/></span><div><span className="summary-label">Open tasks</span><strong>{openTasks.length}</strong><small>Across your task list</small></div></article>
      <article className="summary-card"><span className="summary-icon mint"><CheckCircle2 size={20}/></span><div><span className="summary-label">Completed</span><strong>{tasks.filter(task => task.status === 'done').length}</strong><small>Nice work, keep going</small></div></article>
      <article className="summary-card"><span className="summary-icon peach"><Clock3 size={20}/></span><div><span className="summary-label">Due dates set</span><strong>{openTasks.filter(task => task.dueDate).length}</strong><small>For your open tasks</small></div></article>
    </section>
    <div className="home-columns">
      <section className="panel home-task-panel">
        <div className="panel-heading"><div><span className="eyebrow">STAY ON TRACK</span><h2>Upcoming tasks</h2></div><Link className="text-link" to="/tasks">All tasks <ArrowRight size={15}/></Link></div>
        {dueSoon.length ? <div className="compact-task-list">{dueSoon.map(task => <Link to="/tasks" className="compact-task" key={task.id}><span className={`task-status-dot ${task.status}`}/><span className="compact-task-title">{task.title}</span><span className="compact-task-date">{dateLabel(task.dueDate)}</span></Link>)}</div> : <div className="small-empty"><Clock3 size={22}/><p>No upcoming tasks yet.</p><button className="text-link-button" onClick={() => navigate('/tasks', { state: { create: true } })}>Add a due date <ArrowRight size={14}/></button></div>}
      </section>
      <section className="panel assistant-promo">
        <div className="promo-spark"><Sparkles size={20}/></div><span className="eyebrow">YOUR AI ASSISTANT</span><h2>Plan your next step in a chat.</h2><p>Ask for a task update, make a quick plan, or get help with connected GitHub repositories.</p><button className="primary-button" onClick={createChat}><MessageCircle size={17}/> Start a chat</button>
      </section>
    </div>
    <section className="panel recent-chats-panel">
      <div className="panel-heading"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Recent chats</h2></div><Link className="text-link" to="/chat">Open assistant <ArrowRight size={15}/></Link></div>
      {conversations.length ? <div className="recent-chat-grid">{conversations.slice(0, 3).map(chat => <Link key={chat.conversationId} className="recent-chat-card" to={`/chat/${chat.conversationId}`}><span className="chat-icon"><MessageCircle size={17}/></span><strong>{chat.title}</strong><small>{chat.preview || 'No messages yet'}<span>{dateLabel(chat.updatedAt)}</span></small></Link>)}</div> : <div className="small-empty"><MessageCircle size={22}/><p>Your saved conversations will show up here.</p><button className="text-link-button" onClick={createChat}>Start your first chat <ArrowRight size={14}/></button></div>}
    </section>
  </div>;
}
