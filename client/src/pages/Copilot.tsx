import { useState, useEffect, useRef } from 'react';
import {
  Send, Plus, Trash2, MessageSquare, X, Paperclip, Mic,
  FileText, Calculator, ClipboardList, List, Bot,
} from 'lucide-react';
import api from '../services/api';
import type { CopilotSession, CopilotMessage } from '../types';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const SUGGESTION_CARDS = [
  { icon: FileText, title: 'Review', subtitle: 'SA 500', query: 'What are the key procedures for SA 500 - Audit Evidence?' },
  { icon: Calculator, title: 'Calculate', subtitle: 'Materiality', query: 'Calculate materiality for revenue of ₹50 crore' },
  { icon: ClipboardList, title: 'Draft CARO', subtitle: 'Report', query: 'Help me draft a CARO reporting section' },
  { icon: List, title: 'Form 3CD', subtitle: 'Clause 21', query: 'Explain Form 3CD Clause 21 regarding CARO reporting' },
];

export default function Copilot() {
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [activeSession, setActiveSession] = useState<CopilotSession | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
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
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMsg.id),
        data.userMessage,
        data.assistantMessage,
      ]);
      fetchSessions();
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleSuggestionClick = async (query: string) => {
    if (!activeSession) {
      try {
        const { data } = await api.post('/copilot/sessions', { title: 'New Chat' });
        fetchSessions();
        setActiveSession(data);
        setInput(query);
      } catch (e) {
        console.error(e);
      }
    } else {
      setInput(query);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4.5rem)] -m-3 sm:-m-4 lg:-m-6 copilot-aurora overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-64 h-full flex flex-col flex-shrink-0 z-10 border-r copilot-glass-panel hidden lg:flex">
        {/* Logo area */}
        <div className="p-4 flex items-center justify-between">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-400 to-green-400 shadow-sm" />
          <button className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-white/10 rounded-md transition-colors">
            <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>

        {/* New Chat */}
        <div className="px-4 py-2">
          <button
            onClick={createSession}
            className="w-full bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/15 text-gray-800 dark:text-gray-100 border border-white/60 dark:border-white/10 shadow-sm rounded-lg py-2 px-4 flex items-center gap-2 transition-all text-sm font-medium"
          >
            <Plus size={16} className="dark:text-green-400" /> New Chat
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                className={`group flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors ${
                  activeSession?.id === s.id ? 'bg-white/50 dark:bg-white/10 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-400 hover:bg-white/40 dark:hover:bg-white/5'
                }`}
                onClick={() => openSession(s)}
              >
                <MessageSquare size={16} className="text-gray-400 dark:text-green-400/70 group-hover:text-gray-600 dark:group-hover:text-green-400 flex-shrink-0" />
                <span className="truncate flex-1">{s.title}</span>
                <button
                  onClick={(ev) => { ev.stopPropagation(); deleteSession(s.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/60 dark:hover:bg-white/10"
                >
                  <Trash2 size={12} className="text-gray-400 dark:text-gray-500" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col relative h-full w-full overflow-hidden">
        {activeSession && messages.length > 0 ? (
          /* ── Conversation view ── */
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-white/60 dark:bg-white/10 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Bot size={16} className="text-blue-600 dark:text-green-400" />
                    </div>
                  )}
                  <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'copilot-glass-card text-gray-800 dark:text-gray-100'
                  }`}>
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    <p className="text-[10px] mt-1.5 opacity-50">
                      {new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/60 dark:bg-white/10 flex items-center justify-center shadow-sm">
                    <Bot size={16} className="text-blue-600 dark:text-green-400" />
                  </div>
                  <div className="copilot-glass-card rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input — conversation mode */}
            <div className="px-6 pb-6 pt-2 flex flex-col items-center z-20">
              <form onSubmit={sendMessage} className="w-full max-w-3xl copilot-glass-input rounded-2xl flex items-center pr-2 pl-4 py-2 transition-all focus-within:ring-2 focus-within:ring-blue-400/50">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about audit standards, regulations..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-gray-800 dark:text-gray-100 placeholder-gray-500 py-3 px-2 outline-none w-full text-sm"
                  disabled={sending}
                />
                <div className="flex items-center gap-1 pl-2">
                  <button type="button" className="p-2 text-gray-500 dark:text-green-400 hover:text-gray-800 dark:hover:text-green-300 hover:bg-gray-100/50 dark:hover:bg-white/10 rounded-lg transition-colors">
                    <Paperclip size={20} />
                  </button>
                  <button type="button" className="p-2 text-gray-500 dark:text-green-400 hover:text-gray-800 dark:hover:text-green-300 hover:bg-gray-100/50 dark:hover:bg-white/10 rounded-lg transition-colors">
                    <Mic size={20} />
                  </button>
                  <button
                    type="submit"
                    disabled={!input.trim() || sending}
                    className="p-2 text-gray-400 dark:text-green-400 hover:text-gray-800 dark:hover:text-green-300 hover:bg-gray-100/50 dark:hover:bg-white/10 rounded-lg transition-colors ml-1 disabled:opacity-40"
                  >
                    <Send size={20} className="transform rotate-45 translate-x-px -translate-y-px" />
                  </button>
                </div>
              </form>
              <p className="text-xs text-gray-600 dark:text-gray-500 mt-2 text-center">AI responses are for reference only. Verify against ICAI standards.</p>
            </div>
          </>
        ) : (
          /* ── Welcome / empty state ── */
          <>
            <div className="flex-1 flex flex-col justify-center items-center px-6 pb-24 w-full max-w-4xl mx-auto">
              {/* Greeting */}
              <div className="text-center mb-12 w-full">
                <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-gray-900 dark:text-white mb-4">
                  {getGreeting()}, auditor
                </h1>
                <p className="text-base sm:text-lg text-gray-700 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
                  Ask me about auditing standards, tax regulations, or financial calculations.<br />
                  I can help with SA references, Form 3CD, and materiality.
                </p>
              </div>

              {/* Suggestion Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-12">
                {SUGGESTION_CARDS.map((card, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(card.query)}
                    className="copilot-glass-card rounded-xl p-5 text-left flex flex-col h-32 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  >
                    <div className="mb-auto">
                      <card.icon size={20} strokeWidth={1.5} className="text-gray-500 dark:text-green-400" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-800 dark:text-gray-100 text-sm">{card.title}</div>
                      <div className="text-gray-600 dark:text-gray-400 text-sm">{card.subtitle}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Input — fixed bottom */}
            <div className="absolute bottom-0 left-0 w-full px-6 pb-8 pt-4 bg-gradient-to-t from-white/20 dark:from-[#12141c] dark:via-[#12141c] to-transparent flex flex-col items-center z-20">
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!input.trim()) return;
                if (!activeSession) {
                  try {
                    const { data } = await api.post('/copilot/sessions', { title: 'New Chat' });
                    fetchSessions();
                    setActiveSession(data);
                  } catch { return; }
                }
              }} className="w-full max-w-3xl copilot-glass-input rounded-2xl flex items-center pr-2 pl-4 py-2 mb-4 transition-all focus-within:ring-2 focus-within:ring-blue-400/50">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about audit standards, regulations..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-gray-800 dark:text-gray-100 placeholder-gray-500 py-3 px-2 outline-none w-full text-sm"
                />
                <div className="flex items-center gap-1 pl-2">
                  <button type="button" className="p-2 text-gray-500 dark:text-green-400 hover:text-gray-800 dark:hover:text-green-300 hover:bg-gray-100/50 dark:hover:bg-white/10 rounded-lg transition-colors">
                    <Paperclip size={20} />
                  </button>
                  <button type="button" className="p-2 text-gray-500 dark:text-green-400 hover:text-gray-800 dark:hover:text-green-300 hover:bg-gray-100/50 dark:hover:bg-white/10 rounded-lg transition-colors">
                    <Mic size={20} />
                  </button>
                  <button type="button" className="p-2 text-gray-400 dark:text-green-400 hover:text-gray-800 dark:hover:text-green-300 hover:bg-gray-100/50 dark:hover:bg-white/10 rounded-lg transition-colors ml-1">
                    <Send size={20} className="transform rotate-45 translate-x-px -translate-y-px" />
                  </button>
                </div>
              </form>
              <footer className="text-xs text-gray-600 dark:text-gray-500 text-center space-y-1">
                <p>AI responses are for reference only. Verify against ICAI standards.</p>
                <p>2024 AuditIQ. <a className="underline hover:text-gray-800 dark:hover:text-gray-300" href="#">Privacy Policy</a>.</p>
              </footer>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
