import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bot, Check, MessageCircle, MoreHorizontal, PanelLeft, Pencil, Plus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../lib/api';

const suggestions = ['Show my open tasks', 'Create a task for this week', 'Help me plan my day'];

export default function Chat() {
  const { accessToken, user } = useAuth();
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const bottomRef = useRef(null);
  const textRef = useRef(null);

  const loadConversations = useCallback(async () => {
    const response = await apiRequest(accessToken, { url: '/conversations' });
    setConversations(response.data.conversations);
    return response.data.conversations;
  }, [accessToken]);

  const createConversation = useCallback(async () => {
    setError('');
    try {
      const response = await apiRequest(accessToken, { url: '/conversations', method: 'post', data: {} });
      await loadConversations();
      navigate(`/chat/${response.data.conversation.conversationId}`);
    } catch { setError('A new conversation could not be created. Please try again.'); }
  }, [accessToken, loadConversations, navigate]);

  useEffect(() => {
    if (conversationId) { loadConversations().catch(() => setError('Chat history could not be loaded.')); }
  }, [conversationId, loadConversations]);
  useEffect(() => {
    if (!conversationId) {
      let active = true;
      loadConversations().then(items => {
        if (!active) return;
        if (items.length) navigate(`/chat/${items[0].conversationId}`, { replace: true });
        else createConversation();
      }).catch(() => { if (active) setError('Chat history could not be loaded.'); });
      return () => { active = false; };
    }
    let active = true;
    setLoadingHistory(true); setError('');
    apiRequest(accessToken, { url: `/conversations/${conversationId}` })
      .then(response => { if (active) setMessages(response.data.conversation.messages || []); })
      .catch(() => { if (active) { setMessages([]); setError('This conversation could not be opened. It may have been deleted.'); } })
      .finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, [accessToken, conversationId, createConversation]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const beginRename = (conversation) => {
    setRenamingId(conversation.conversationId);
    setRenameValue(conversation.title);
  };

  const saveRename = async (conversation) => {
    const title = renameValue.trim();
    if (!title || title === conversation.title) { setRenamingId(null); return; }
    setRenameBusy(true);
    try {
      await apiRequest(accessToken, { url: `/conversations/${conversation.conversationId}`, method: 'patch', data: { title } });
      await loadConversations();
      setRenamingId(null);
    } catch { setError('Conversation could not be renamed.'); }
    finally { setRenameBusy(false); }
  };

  const deleteConversation = async (conversation) => {
    if (!window.confirm(`Delete “${conversation.title}” and its messages? This can’t be undone.`)) return;
    try {
      await apiRequest(accessToken, { url: `/conversations/${conversation.conversationId}`, method: 'delete' });
      const next = conversations.filter(item => item.conversationId !== conversation.conversationId);
      setConversations(next);
      if (conversation.conversationId === conversationId) {
        if (next.length) navigate(`/chat/${next[0].conversationId}`, { replace: true });
        else createConversation();
      }
    } catch { setError('Conversation could not be deleted.'); }
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy || !conversationId) return;
    setInput(''); setBusy(true); setError('');
    setMessages(previous => [...previous, { role: 'user', text }]);
    try {
      const response = await apiRequest(accessToken, { url: '/chat', method: 'post', data: { conversation_id: conversationId, message: text } });
      setMessages(previous => [...previous, { role: 'assistant', text: response.data.text, toolsUsed: response.data.tools_used || [], action: response.data.action }]);
      await loadConversations();
    } catch (requestError) {
      const message = requestError.response?.data?.detail || 'The assistant could not complete that request. Please try again.';
      setMessages(previous => [...previous, { role: 'error', text: message }]);
      setError(requestError.response?.status === 401 ? 'Your session expired. Please sign in again.' : 'Message could not be sent.');
    } finally { setBusy(false); }
  };

  const onComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
  };
  const activeConversation = conversations.find(item => item.conversationId === conversationId);

  return <div className="chat-workspace">
    {historyOpen && <button className="conversation-backdrop" aria-label="Close chat history" onClick={() => setHistoryOpen(false)}/>}
    <aside className={`conversation-sidebar ${historyOpen ? 'mobile-open' : ''}`}>
      <div className="conversation-heading"><div><span className="eyebrow">ASSISTANT</span><h2>Your chats</h2></div><div className="conversation-head-actions"><button className="icon-button new-chat-icon" title="New chat" aria-label="New chat" onClick={() => { setHistoryOpen(false); createConversation(); }}><Plus size={19}/></button><button className="icon-button close-history-button" aria-label="Close chat history" onClick={() => setHistoryOpen(false)}><X size={18}/></button></div></div>
      <button className="new-chat-button" onClick={() => { setHistoryOpen(false); createConversation(); }}><Plus size={17}/> New chat</button>
      <div className="conversation-list" aria-label="Chat history">
        {conversations.map(conversation => <div className={`conversation-item ${conversation.conversationId === conversationId ? 'selected' : ''}`} key={conversation.conversationId}>
          {renamingId === conversation.conversationId ? <form className="conversation-rename" onSubmit={event => { event.preventDefault(); saveRename(conversation); }}><input aria-label="Conversation title" autoFocus maxLength={100} value={renameValue} onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setRenamingId(null); }}/><button className="icon-button" aria-label="Save title" disabled={renameBusy}><Check size={14}/></button><button type="button" className="icon-button" aria-label="Cancel rename" onClick={() => setRenamingId(null)}><X size={14}/></button></form> : <><Link to={`/chat/${conversation.conversationId}`} onClick={() => setHistoryOpen(false)} className="conversation-link"><MessageCircle size={16}/><span>{conversation.title}</span></Link><div className="conversation-actions"><button className="icon-button" aria-label={`Rename ${conversation.title}`} title="Rename" onClick={() => beginRename(conversation)}><Pencil size={14}/></button><button className="icon-button danger-hover" aria-label={`Delete ${conversation.title}`} title="Delete" onClick={() => deleteConversation(conversation)}><Trash2 size={14}/></button></div></>}
        </div>)}
        {!conversations.length && <div className="conversation-empty">Your saved chats will appear here.</div>}
      </div>
      <div className="conversation-footer"><span className="avatar small-avatar">{user?.avatarUrl ? <img src={user.avatarUrl} alt=""/> : (user?.displayName || 'U').slice(0, 1).toUpperCase()}</span><span>{user?.displayName || user?.email || 'Your assistant'}</span><MoreHorizontal size={18}/></div>
    </aside>
    <section className="chat-panel">
      <header className="chat-topbar"><div><button className="icon-button history-toggle" aria-label="Open chat history" onClick={() => setHistoryOpen(true)}><PanelLeft size={18}/></button><span className="assistant-live-dot"/><div><strong>{activeConversation?.title || 'New conversation'}</strong><small>Task Pilot assistant</small></div></div><Link to="/tasks" className="chat-tasks-link">View tasks <Check size={15}/></Link></header>
      <div className="chat-scroll" aria-live="polite">
        {loadingHistory ? <div className="chat-loading">Opening conversation…</div> : messages.length === 0 ? <div className="chat-welcome"><span className="welcome-spark"><Sparkles size={22}/></span><span className="eyebrow">READY WHEN YOU ARE</span><h1>What would you like to work on?</h1><p>Ask me to organize your tasks or, if GitHub is connected, help with your repositories and issues.</p><div className="suggestion-list">{suggestions.map(item => <button key={item} onClick={() => { setInput(item); textRef.current?.focus(); }}>{item}<span>↗</span></button>)}</div></div> : <div className="message-list">{messages.map((message, index) => <article className={`chat-message ${message.role}`} key={`${index}-${message.role}`}><span className="message-avatar">{message.role === 'assistant' ? <Bot size={17}/> : message.role === 'error' ? '!' : (user?.displayName || 'U').slice(0, 1).toUpperCase()}</span><div className="message-body"><span className="message-author">{message.role === 'assistant' ? 'Task Pilot' : message.role === 'user' ? 'You' : 'Notice'}</span><p>{message.text}</p>{message.toolsUsed?.length > 0 && <span className="tools-used">Used {message.toolsUsed.map(tool => tool.replace('__', ' · ')).join(', ')}</span>}{message.action === 'connect_github' && <Link className="primary-button connect-action" to="/github">Connect GitHub</Link>}</div></article>)}</div>}
        {busy && <div className="chat-message assistant"><span className="message-avatar"><Bot size={17}/></span><div className="message-body"><span className="message-author">Task Pilot</span><div className="typing-dots"><i/><i/><i/></div></div></div>}
        <div ref={bottomRef}/>
      </div>
      {error && <div className="chat-inline-error" role="status">{error}</div>}
      <form className="composer-wrap" onSubmit={sendMessage}><div className="composer"><textarea ref={textRef} aria-label="Message the assistant" rows="1" value={input} onChange={event => setInput(event.target.value)} onKeyDown={onComposerKeyDown} placeholder="Ask about tasks or GitHub…" disabled={busy || loadingHistory}/><button className="send-button" aria-label="Send message" disabled={!input.trim() || busy || loadingHistory}><Send size={17}/></button></div><small>Enter to send · Shift + Enter for a new line</small></form>
    </section>
  </div>;
}
