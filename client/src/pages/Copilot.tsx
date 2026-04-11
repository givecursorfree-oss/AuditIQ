import { useState, useEffect, useRef } from 'react';
import {
  Bot, Send, Plus, Trash2, MessageSquare, X, Sparkles, Clock
} from 'lucide-react';
import api from '../services/api';
import type { CopilotSession, CopilotMessage } from '../types';

export default function Copilot() {
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [activeSession, setActiveSession] = useState<CopilotSession | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showSessions, setShowSessions] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchSessions = () => {
    api.get('/copilot/sessions')
      .then(({ data }) => { setSessions(data); setLoadingSessions(false); })
      .catch(console.error);
  };

  useEffect(() => { fetchSessions(); }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openSession = (session: CopilotSession) => {
    setActiveSession(session);
    api.get(`/copilot/sessions/${session.id}/messages`)
      .then(({ data }) => setMessages(data))
      .catch(console.error);
  };

  const createSession = async () => {
    try {
      const { data } = await api.post('/copilot/sessions', { title: 'New Chat' });
      fetchSessions();
      openSession(data);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteSession = async (id: string) => {
    try {
      await api.delete(`/copilot/sessions/${id}`);
      if (activeSession?.id === id) {
        setActiveSession(null);
        setMessages([]);
      }
      fetchSessions();
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeSession || sending) return;

    const userMessageText = input.trim();
    setInput('');
    setSending(true);

    // Optimistically add user message
    const tempUserMsg: CopilotMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessageText,
      createdAt: new Date().toISOString(),
      sessionId: activeSession.id,
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const { data } = await api.post(`/copilot/sessions/${activeSession.id}/messages`, {
        content: userMessageText,
      });
      // data.userMessage and data.assistantMessage
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMsg.id),
        data.userMessage,
        data.assistantMessage,
      ]);
      fetchSessions(); // update session title / lastMessage
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  const SUGGESTIONS = [
    'What are the key procedures for SA 500 - Audit Evidence?',
    'Help me draft a management representation letter',
    'Explain Form 3CD Clause 21 regarding CARO reporting',
    'Calculate materiality for revenue of ₹50 crore',
  ];

  return (
    <div className="flex h-[calc(100vh-4.5rem)] -m-3 sm:-m-4 lg:-m-6">
      {/* Mobile overlay */}
      {showSessions && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setShowSessions(false)} />
      )}
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-surface border-r border-border flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 ${showSessions ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-3 flex items-center gap-2">
          <button onClick={createSession} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
            <Plus size={15} /> New Chat
          </button>
          <button onClick={() => setShowSessions(false)} className="p-2 rounded-lg hover:bg-hover-bg lg:hidden">
            <X size={16} className="text-foreground-muted" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer mb-0.5 ${
                  activeSession?.id === s.id ? 'bg-card-hover' : 'hover:bg-hover-bg'
                }`}
                onClick={() => { openSession(s); setShowSessions(false); }}
              >
                <MessageSquare size={14} className="text-foreground-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground-secondary truncate">{s.title}</p>
                  <p className="text-xs text-foreground-muted truncate">{s.messageCount || 0} messages</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-hover-bg"
                >
                  <Trash2 size={12} className="text-foreground-muted" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile chat header */}
        <div className="flex items-center gap-2 p-2 border-b border-border lg:hidden">
          <button onClick={() => setShowSessions(true)} className="p-2 rounded-lg hover:bg-hover-bg">
            <MessageSquare size={16} className="text-foreground-muted" />
          </button>
          <span className="text-sm text-foreground-secondary truncate">{activeSession?.title || 'AuditIQ Copilot'}</span>
        </div>
        {activeSession ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Sparkles size={28} className="text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">AuditIQ Copilot</h3>
                  <p className="text-sm text-foreground-muted mb-6 max-w-md">
                    Ask me about Indian auditing standards, tax regulations, or audit procedures. I can help with SA references, Form 3CD, and materiality calculations.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => { setInput(s); }}
                        className="text-left text-xs text-foreground-muted p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-hover-bg transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot size={16} className="text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[85%] sm:max-w-[70%] rounded-xl px-4 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-foreground'
                      : 'bg-card-hover text-foreground-secondary'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    <p className="text-[10px] mt-1 opacity-50">
                      {new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bot size={16} className="text-primary" />
                  </div>
                  <div className="bg-card-hover rounded-xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-foreground-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-foreground-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-foreground-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="p-4 border-t border-border">
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about audit standards, regulations..."
                  className="input-field flex-1"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="btn-primary p-2.5 disabled:opacity-50"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-[10px] text-foreground-muted mt-1.5 text-center">
                AI responses are for reference only. Verify against ICAI standards.
              </p>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Bot size={36} className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">AuditIQ Copilot</h3>
            <p className="text-sm text-foreground-muted mb-4 max-w-sm">
              Your AI-powered audit assistant. Start a new chat or select an existing session.
            </p>
            <button onClick={createSession} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Start New Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
