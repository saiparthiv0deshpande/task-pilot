import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('jwt');
      if (!token) {
        navigate('/');
        return;
      }

      // Send to FastAPI Orchestrator
      const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:8080';
      const response = await axios.post(`${orchestratorUrl}/chat`, {
        conversation_id: 'ui_demo_chat',
        message: input
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const aiMessage = { 
        role: 'ai', 
        text: response.data.text, 
        tools: response.data.tools_used 
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error(error);
      if (error.response?.status === 401) {
        localStorage.removeItem('jwt');
        navigate('/');
      } else {
        setMessages(prev => [...prev, { role: 'error', text: 'Server Error: Check terminal logs.' }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('jwt');
    navigate('/');
  };

  return (
    <div className="chat-layout">
      <div className="chat-sidebar">
        <h2>AI Assistant</h2>
        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </div>
      
      <div className="chat-main">
        <div className="chat-history">
          {messages.length === 0 && (
            <div className="empty-state">
              <h2>Welcome to Task Pilot!</h2>
              <p>Ask me to manage your tasks or check your GitHub.</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`message-bubble ${msg.role}`}>
              <div className="message-content">
                <p>{msg.text}</p>
                {msg.tools && msg.tools.length > 0 && (
                  <div className="tools-badge">
                    Used tools: {msg.tools.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-bubble ai typing">
              <div className="dot"></div><div className="dot"></div><div className="dot"></div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-area">
          <input 
            type="text" 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type your message here..."
            disabled={isLoading}
          />
          <button onClick={handleSend} disabled={isLoading || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
