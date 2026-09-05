'use client';

import React, { useState, useRef, useEffect } from 'react';
import { aiApi, ChatMessage, ChatResponse } from '../../../lib/api-client';
import { C } from '../../../lib/tokens';
import { Bot, User, Send, Loader2, Zap, ShieldAlert, FileText, XCircle, ArrowRight, Activity, Info } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCallsMade?: number;
  toolCalls?: { tool: string; args: any; result: any }[];
  suggestedActions?: string[];
  loading?: boolean;
}

import { ToolCallList } from '../../../components/ai/ToolCallList';

const QUICK_PROMPTS = [
  { text: 'Show me all critical exceptions', icon: <ShieldAlert className="w-3 h-3" /> },
  { text: 'What is the total financial exposure this week?', icon: <Activity className="w-3 h-3" /> },
  { text: 'Explain the largest open exception', icon: <Info className="w-3 h-3" /> },
  { text: 'Are there any duplicate payments I should know about?', icon: <FileText className="w-3 h-3" /> },
  { text: 'List unresolved refund delays', icon: <XCircle className="w-3 h-3" /> },
  { text: 'What actions are pending approval?', icon: <Zap className="w-3 h-3" /> },
];

import { PlainText } from '../../../components/ai/PlainText';

function AssistantBubble({ msg }: { msg: Message }) {
  if (msg.loading) {
    return (
      <div className="flex gap-4 animate-fade-in">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1" style={{ backgroundColor: C.primary, color: C.bg }}>
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
        <div className="flex flex-col gap-1 w-full max-w-2xl">
          <div className="text-[11px] font-semibold" style={{ color: C.textSecondary }}>LedgerMind AI</div>
          <div className="px-5 py-4 rounded-2xl rounded-tl-sm border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.primary, animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.primary, animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.primary, animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 animate-slide-up">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1" style={{ backgroundColor: C.primary, color: C.bg }}>
        <Bot className="w-5 h-5" />
      </div>
      <div className="flex flex-col gap-1 w-full max-w-2xl">
        <div className="text-[11px] font-semibold" style={{ color: C.textSecondary }}>LedgerMind AI</div>
        <div className="px-5 py-4 rounded-2xl rounded-tl-sm border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <PlainText text={msg.content} className="text-[14px] leading-relaxed whitespace-pre-wrap block" style={{ color: C.textPrimary }} />
          
          {(msg.toolCallsMade || msg.suggestedActions?.length) ? (
            <div className="mt-4 pt-3 border-t flex flex-col gap-3" style={{ borderColor: C.border }}>
              {msg.toolCalls && msg.toolCalls.length > 0 ? (
                <ToolCallList toolCalls={msg.toolCalls as any} />
              ) : msg.toolCallsMade !== undefined && msg.toolCallsMade > 0 ? (
                <div className="flex items-center gap-1.5 text-[11px] font-mono" style={{ color: C.textMuted }}>
                  <Activity className="w-3.5 h-3.5" />
                  Executed {msg.toolCallsMade} tool call{msg.toolCallsMade !== 1 ? 's' : ''} to retrieve live data
                </div>
              ) : null}
              {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {msg.suggestedActions.slice(0, 3).map((a, i) => (
                    <span 
                      key={i} 
                      className="px-2.5 py-1 text-[11px] font-semibold border rounded-md"
                      style={{ backgroundColor: C.primaryTint, borderColor: `${C.primary}40`, color: C.primary }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const genId = () => Math.random().toString(36).slice(2);

export default function AiControllerPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: genId(),
      role: 'assistant',
      content: "Hello! I'm LedgerMind's AI Finance Controller. I have access to your live transaction data, exceptions, settlements, and refunds.\n\nAsk me anything — I can investigate exceptions, explain discrepancies, calculate exposure, and recommend actions.",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text?: string) => {
    const content = text ?? input.trim();
    if (!content || sending) return;
    setInput('');

    const userMsg: Message = { id: genId(), role: 'user', content };
    const thinkingMsg: Message = { id: genId(), role: 'assistant', content: '', loading: true };

    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setSending(true);

    const history: ChatMessage[] = [...messages, userMsg]
      .filter(m => !m.loading)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await aiApi.chat(history);
      const data: ChatResponse = res.data;
      setMessages(prev => prev.map(m =>
        m.id === thinkingMsg.id
          ? { ...m, content: data.message ?? 'No response', loading: false, toolCallsMade: data.tool_calls_made, toolCalls: data.tool_calls, suggestedActions: data.suggested_actions }
          : m
      ));
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === thinkingMsg.id
          ? { ...m, content: 'Sorry, the AI controller is unavailable right now. Make sure the backend is running with a valid GEMINI_API_KEY.', loading: false }
          : m
      ));
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* Header */}
      <div className="shrink-0 px-8 py-5 border-b flex items-center justify-between" style={{ backgroundColor: C.surface, borderColor: C.border }}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: C.primary, color: C.bg }}>
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[16px] font-bold" style={{ color: C.textPrimary }}>AI Finance Controller</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.success }} />
              <span className="text-[12px]" style={{ color: C.textSecondary }}>GPT-4o · Live data · 14 tools available</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setMessages([{
            id: genId(),
            role: 'assistant',
            content: "Conversation cleared. How can I help you?",
          }])}
          className="text-[13px] font-medium transition-colors"
          style={{ color: C.textMuted }}
          onMouseEnter={(e) => e.currentTarget.style.color = C.textPrimary}
          onMouseLeave={(e) => e.currentTarget.style.color = C.textMuted}
        >
          Clear chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-4xl mx-auto space-y-8 pb-10">
          {messages.map(msg =>
            msg.role === 'user' ? (
              <div key={msg.id} className="flex justify-end gap-4 animate-fade-in">
                <div className="flex flex-col gap-1 w-full max-w-2xl items-end">
                  <div className="text-[11px] font-semibold" style={{ color: C.textSecondary }}>You</div>
                  <div className="px-5 py-3 rounded-2xl rounded-tr-sm shadow-sm" style={{ backgroundColor: C.primary, color: C.bg }}>
                    <PlainText text={msg.content} className="text-[14px] leading-relaxed whitespace-pre-wrap block" />
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1" style={{ backgroundColor: C.neutralTint, color: C.textPrimary }}>
                  <User className="w-5 h-5" />
                </div>
              </div>
            ) : (
              <AssistantBubble key={msg.id} msg={msg} />
            )
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Quick prompts */}
      {messages.length === 1 && (
        <div className="px-8 pb-4 shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {QUICK_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => send(p.text)}
                  className="flex items-center gap-2 px-3 py-2.5 text-[12px] font-medium text-left border rounded-lg transition-all"
                  style={{ backgroundColor: C.surface, borderColor: C.border, color: C.textSecondary }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = C.primary;
                    e.currentTarget.style.color = C.primary;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = C.border;
                    e.currentTarget.style.color = C.textSecondary;
                  }}
                >
                  <span className="shrink-0 opacity-70">{p.icon}</span>
                  <span className="truncate">{p.text}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 px-8 py-5 border-t" style={{ backgroundColor: C.surface, borderColor: C.border }}>
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          <div className="relative flex items-end gap-3 rounded-xl border p-2 focus-within:ring-2 transition-shadow" style={{ borderColor: C.border, backgroundColor: C.bg, '--tw-ring-color': `${C.primary}40` } as React.CSSProperties}>
            <textarea
              id="ai-chat-input"
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about exceptions, transactions, exposure…"
              className="flex-1 min-h-[44px] max-h-32 overflow-auto resize-none bg-transparent outline-none py-2.5 px-3 text-[14px]"
              style={{ color: C.textPrimary }}
            />
            <button
              id="ai-chat-send"
              onClick={() => send()}
              disabled={!input.trim() || sending}
              className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 disabled:opacity-50 transition-colors"
              style={{ backgroundColor: C.primary, color: C.bg }}
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-1 text-[11px] font-medium" style={{ color: C.textMuted }}>
            <ShieldAlert className="w-3 h-3" />
            AI recommendations require human approval via the Action Engine before execution.
          </div>
        </div>
      </div>
    </div>
  );
}
