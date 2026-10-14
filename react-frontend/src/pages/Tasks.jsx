import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Check, Circle, Clock3, Edit3, ListFilter, Plus, Search, Trash2, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../lib/api';

const emptyTask = { title: '', description: '', priority: 'medium', status: 'todo', dueDate: '' };
const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date';

function TaskEditor({ initial, onCancel, onSave, busy }) {
  const [form, setForm] = useState(initial || emptyTask);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  return <form className="task-editor" onSubmit={event => { event.preventDefault(); onSave(form); }}>
    <div className="editor-topline"><h3>{initial?.id ? 'Edit task' : 'Add a task'}</h3><button type="button" className="icon-button" onClick={onCancel} aria-label="Close task form"><X size={18}/></button></div>
    <label>Task title<input autoFocus maxLength={200} required value={form.title} onChange={e => update('title', e.target.value)} placeholder="What needs to get done?"/></label>
    <label>Details <small>Optional</small><textarea rows="3" maxLength={3000} value={form.description} onChange={e => update('description', e.target.value)} placeholder="Add a few helpful details"/></label>
    <div className="editor-fields"><label>Priority<select value={form.priority} onChange={e => update('priority', e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Status<select value={form.status} onChange={e => update('status', e.target.value)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label><label>Due date<input type="date" value={form.dueDate || ''} onChange={e => update('dueDate', e.target.value)}/></label></div>
    <div className="editor-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : initial?.id ? 'Save changes' : 'Create task'}</button></div>
  </form>;
}

export default function Tasks() {
  const { accessToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await apiRequest(accessToken, { url: '/tasks' }); setTasks(response.data.tasks); }
    catch { setError('Tasks could not be loaded. Please try again.'); }
    finally { setLoading(false); }
  }, [accessToken]);
  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => {
    if (location.state?.create) { setEditing({ ...emptyTask }); navigate(location.pathname, { replace: true, state: {} }); }
  }, [location.pathname, location.state, navigate]);

  const visibleTasks = useMemo(() => tasks.filter(task => {
    const matchesStatus = filter === 'all' || task.status === filter;
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || task.title.toLowerCase().includes(term) || (task.description || '').toLowerCase().includes(term);
    return matchesStatus && matchesQuery;
  }), [tasks, filter, query]);

  const saveTask = async (form) => {
    setBusy(true); setError('');
    const payload = {
      title: form.title.trim(),
      description: form.description || '',
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate || null,
    };
    try {
      const response = await apiRequest(accessToken, {
        url: editing?.id ? `/tasks/${editing.id}` : '/tasks',
        method: editing?.id ? 'patch' : 'post',
        data: payload,
      });
      const task = response.data.task;
      setTasks(previous => editing?.id ? previous.map(item => item.id === task.id ? task : item) : [task, ...previous]);
      setEditing(null);
    } catch (requestError) { setError(requestError.response?.data?.detail || 'Task could not be saved.'); }
    finally { setBusy(false); }
  };

  const setStatus = async (task, status) => {
    try {
      const response = await apiRequest(accessToken, { url: `/tasks/${task.id}`, method: 'patch', data: { status } });
      setTasks(previous => previous.map(item => item.id === task.id ? response.data.task : item));
    } catch { setError('Task status could not be updated.'); }
  };
  const deleteTask = async (task) => {
    if (!window.confirm(`Delete “${task.title}”? This can’t be undone.`)) return;
    try { await apiRequest(accessToken, { url: `/tasks/${task.id}`, method: 'delete' }); setTasks(previous => previous.filter(item => item.id !== task.id)); }
    catch { setError('Task could not be deleted.'); }
  };

  const counts = { all: tasks.length, todo: tasks.filter(task => task.status === 'todo').length, in_progress: tasks.filter(task => task.status === 'in_progress').length, done: tasks.filter(task => task.status === 'done').length };
  return <div className="page-content tasks-page">
    <div className="page-heading-row"><div><span className="eyebrow">YOUR PERSONAL BOARD</span><h1>Tasks</h1><p>Keep the next steps clear and manageable.</p></div><button className="primary-button" onClick={() => setEditing({ ...emptyTask })}><Plus size={18}/> New task</button></div>
    {error && <div className="form-error page-alert" role="alert">{error}</div>}
    <div className="task-toolbar"><div className="task-tabs" role="tablist" aria-label="Filter tasks">{[['all', 'All'], ['todo', 'To do'], ['in_progress', 'In progress'], ['done', 'Completed']].map(([key, label]) => <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}<span>{counts[key]}</span></button>)}</div><label className="search-field"><Search size={17}/><input aria-label="Search tasks" placeholder="Search tasks" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
    {loading ? <div className="panel loading-panel">Loading your tasks…</div> : visibleTasks.length ? <section className="task-list" aria-label="Tasks">{visibleTasks.map(task => <article className={`task-row ${task.status === 'done' ? 'is-done' : ''}`} key={task.id}>
      <button className={`complete-button ${task.status === 'done' ? 'checked' : ''}`} aria-label={task.status === 'done' ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={() => setStatus(task, task.status === 'done' ? 'todo' : 'done')}>{task.status === 'done' ? <Check size={17}/> : <Circle size={18}/>}</button>
      <div className="task-main-copy"><h2>{task.title}</h2>{task.description && <p>{task.description}</p>}<div className="task-meta"><span className={`priority-pill ${task.priority}`}>{task.priority} priority</span><span className="task-meta-date"><CalendarDays size={14}/>{formatDate(task.dueDate)}</span>{task.status === 'in_progress' && <span className="status-pill"><Clock3 size={13}/> In progress</span>}</div></div>
      <div className="task-row-actions"><button className="icon-button" title="Edit task" aria-label={`Edit ${task.title}`} onClick={() => setEditing(task)}><Edit3 size={16}/></button><button className="icon-button danger-hover" title="Delete task" aria-label={`Delete ${task.title}`} onClick={() => deleteTask(task)}><Trash2 size={16}/></button></div>
    </article>)}</section> : <div className="panel tasks-empty"><span className="empty-icon"><ListFilter size={22}/></span><h2>{query ? 'No matching tasks' : filter === 'all' ? 'Nothing on your list yet' : `No ${filter.replace('_', ' ')} tasks`}</h2><p>{query ? 'Try another search term or filter.' : 'Add a task here, or ask the assistant to create one for you.'}</p>{!query && filter === 'all' && <button className="primary-button" onClick={() => setEditing({ ...emptyTask })}><Plus size={17}/> Add your first task</button>}</div>}
    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null); }}><div className="modal-card" role="dialog" aria-modal="true" aria-label={editing.id ? 'Edit task' : 'Create task'}><TaskEditor initial={editing} onCancel={() => setEditing(null)} onSave={saveTask} busy={busy}/></div></div>}
  </div>;
}
