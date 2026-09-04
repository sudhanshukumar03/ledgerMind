import React, { useEffect, useState, useRef } from 'react';
import { exceptionsApi, actionsApi, aiApi, Exception, AiAnalysis, ChatMessage, ChatResponse } from '../../lib/api-client';
import { C } from '../../lib/tokens';
import { StatusBadge } from '../ui/StatusBadge';
import { Amount } from '../ui/Amount';
import { Bot, User, Send, Loader2, Zap, ShieldAlert, X, Copy, Check } from 'lucide-react';
import { PlainText } from '../ui/PlainText';

function Confidence({ value }: { value: number }) {
  const color = value >= 80 ? C.success : value >= 50 ? C.warning : C.critical;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-surface rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-[12px] font-semibold" style={{ color }}>{value}%</span>
    </div>
  );
}

const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

export function ExceptionDrawer({ id, onClose }: { id: string, onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'details' | 'ask_ai'>('details');
  const [exc, setExc] = useState<Exception | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [investigating, setInvestigating] = useState(false);
  const [investigationError, setInvestigationError] = useState('');
  
  const [proposing, setProposing] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState(false);
  const handleCopyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('exception', id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link:', url.toString());
    }
  };

  useEffect(() => {
    setLoading(true);
    exceptionsApi.get(id)
      .then(r => {
        setExc(r.data);
        if (r.data.aiAnalyses?.[0]) setAnalysis(r.data.aiAnalyses[0]);
        setMessages([
          {
            id: genId(),
            role: 'assistant',
            content: `I am ready to help you investigate exception ${r.data.exceptionId}. What would you like to know?`
          }
        ]);
      })
      .catch(() => onClose())
      .finally(() => setLoading(false));
  }, [id, onClose]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  const investigate = async () => {
    setInvestigating(true);
    setInvestigationError('');
    try {
      const res = await exceptionsApi.investigate(id);
      setAnalysis(res.data);
    } catch (e: any) {
      setInvestigationError(e.response?.data?.message || 'Investigation failed');
    } finally {
      setInvestigating(false);
    }
  };

  const propose = async (type: string, amount?: number) => {
    if (!exc) return;
    setProposing(type);
    setActionMsg('');
    try {
      await actionsApi.propose({
        exceptionId: exc.id,
        type,
        amount,
        reason: `Proposed via exception detail for ${exc.exceptionId}`,
        idempotencyKey: genId(),
      });
      setActionMsg(`✓ Action "${type}" proposed — pending approval`);
    } catch (e: any) {
      setActionMsg(`✗ ${e.response?.data?.message ?? 'Failed'}`);
    } finally {
      setProposing(null);
    }
  };

  const send = async (text?: string) => {
    const content = text ?? input.trim();
    if (!content || sending || !exc) return;
    setInput('');

    const userMsg: Message = { id: genId(), role: 'user', content };
    const thinkingMsg: Message = { id: genId(), role: 'assistant', content: '', loading: true };

    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setSending(true);

    const history: ChatMessage[] = [
      { role: 'user', content: `Context: I am looking at exception ${exc.exceptionId} of type ${exc.type}.` },
      ...messages.filter(m => !m.loading).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content }
    ];

    try {
      const res = await aiApi.chat(history);
      const data: ChatResponse = res.data;
      setMessages(prev => prev.map(m =>
        m.id === thinkingMsg.id
          ? { ...m, content: data.message ?? 'No response', loading: false }
          : m
      ));
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === thinkingMsg.id
          ? { ...m, content: 'Sorry, the AI controller is unavailable right now.', loading: false }
          : m
      ));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-[500px] max-w-[90vw] bg-bg shadow-2xl z-50 flex flex-col animate-slide-left border-l" style={{ borderColor: C.border }}>
        
        {/* Header */}
        <div className="shrink-0 px-6 py-5 border-b flex items-start justify-between bg-surface" style={{ borderColor: C.border }}>
          {loading ? (
            <div className="h-6 w-32 bg-gray-200 animate-pulse rounded" />
          ) : exc ? (
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h2 className="text-[16px] font-bold" style={{ color: C.textPrimary }}>{exc.type.replace(/_/g, ' ')}</h2>
                <StatusBadge severity={exc.severity as any} />
              </div>
              <p className="text-[13px] font-mono" style={{ color: C.textMuted }}>{exc.exceptionId}</p>
            </div>
          ) : <div />}
          <div className="flex items-center gap-1 ml-4 shrink-0">
            <button onClick={handleCopyLink} className="p-1 rounded-md hover:bg-gray-100 transition-colors relative" title="Copy link to exception">
              {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-gray-500" />}
            </button>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 transition-colors" title="Close">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-6 border-b bg-surface shrink-0" style={{ borderColor: C.border }}>
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            style={activeTab === 'details' ? { borderColor: C.primary, color: C.primary } : {}}
          >
            Details & AI Investigation
          </button>
          <button
            onClick={() => setActiveTab('ask_ai')}
            className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'ask_ai' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            style={activeTab === 'ask_ai' ? { borderColor: C.primary, color: C.primary } : {}}
          >
            <Bot className="w-4 h-4" /> Ask AI
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-bg p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : !exc ? null : activeTab === 'details' ? (
            <div className="space-y-6 animate-fade-in">
              {/* Core Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-4 flex flex-col justify-center">
                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Exposure</div>
                  <div className="text-[18px] font-bold" style={{ color: C.textPrimary }}><Amount value={exc.financialImpact} /></div>
                </div>
                <div className="card p-4 flex flex-col justify-center">
                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Status</div>
                  <div><StatusBadge status={exc.status as any} /></div>
                </div>
              </div>

              {/* Attributes */}
              <div className="card p-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: C.textMuted }}>Attributes</h3>
                <dl className="space-y-3 text-[13px]">
                  <div className="flex justify-between gap-2">
                    <dt style={{ color: C.textMuted }}>Created</dt>
                    <dd className="font-medium" style={{ color: C.textPrimary }}>{new Date(exc.createdAt).toLocaleString('en-IN')}</dd>
                  </div>
                  {exc.resolvedAt && (
                    <div className="flex justify-between gap-2">
                      <dt style={{ color: C.textMuted }}>Resolved</dt>
                      <dd className="font-medium" style={{ color: C.textPrimary }}>{new Date(exc.resolvedAt).toLocaleString('en-IN')}</dd>
                    </div>
                  )}
                  {exc.differenceAmount && (
                    <div className="flex justify-between gap-2">
                      <dt style={{ color: C.textMuted }}>Difference</dt>
                      <dd className="font-medium" style={{ color: C.textPrimary }}><Amount value={exc.differenceAmount} /></dd>
                    </div>
                  )}
                  {exc.customerImpact && (
                    <div className="flex justify-between gap-2">
                      <dt style={{ color: C.textMuted }}>Customer Impact</dt>
                      <dd className="font-medium text-right" style={{ color: C.textPrimary }}><PlainText text={exc.customerImpact} /></dd>
                    </div>
                  )}
                </dl>
                {exc.description && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: C.border }}>
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.textMuted }}>Description / Raw details</h3>
                    <PlainText text={exc.description} className="text-[12px] text-gray-600 bg-gray-50 p-2 rounded border font-mono break-all" />
                  </div>
                )}
              </div>

              {/* AI Investigation Popover */}
              <div className="card border-l-4 overflow-hidden" style={{ borderLeftColor: C.primary, borderColor: C.border }}>
                <div className="p-4 bg-surface flex items-center justify-between border-b" style={{ borderColor: C.border }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: C.primaryTint, color: C.primary }}>
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-[13px] font-semibold" style={{ color: C.textPrimary }}>AI Investigation</h3>
                  </div>
                  <button onClick={investigate} disabled={investigating} className="btn-secondary text-[11px] py-1 px-2.5 h-auto min-h-0">
                    {investigating ? <><Loader2 className="w-3 h-3 animate-spin" /> Investigating…</> : analysis ? 'Re-investigate' : 'Investigate with AI'}
                  </button>
                </div>
                
                <div className="p-4 bg-white">
                  {investigationError && (
                    <div className="p-3 mb-4 rounded bg-red-50 text-red-600 text-[12px] border border-red-100">
                      {investigationError}
                    </div>
                  )}

                  {!analysis ? (
                    <div className="text-center py-6 text-[13px]" style={{ color: C.textMuted }}>
                      Click "Investigate with AI" to generate a root cause analysis and action plan.
                    </div>
                  ) : (
                    <div className="space-y-4 animate-slide-up">
                      {analysis.toolCalls && analysis.toolCalls.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: C.textMuted }}>Tools Used</p>
                          <div className="flex flex-wrap gap-2">
                            {analysis.toolCalls.map((tc, idx) => (
                              <div key={idx} className="px-2 py-1 bg-gray-100 rounded text-[11px] font-mono text-gray-700 border" style={{ borderColor: C.border }}>
                                {tc.tool}(...)
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: C.textMuted }}>Summary</p>
                        <PlainText text={analysis.summary} className="text-[13px] leading-relaxed" style={{ color: C.textPrimary }} />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: C.textMuted }}>Likely Cause</p>
                        <PlainText text={analysis.likelyCause} className="text-[13px]" style={{ color: C.textPrimary }} />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: C.textMuted }}>Confidence</p>
                        <Confidence value={analysis.confidence} />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: C.textMuted }}>Recommended Action</p>
                        <div className="inline-block px-2.5 py-1 text-[12px] font-semibold border rounded-md" style={{ backgroundColor: C.infoTint, borderColor: `${C.info}40`, color: C.info }}>
                          <PlainText text={analysis.recommendedAction} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {exc.status !== 'RESOLVED' && (
                <div className="card p-4">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: C.textMuted }}>Human Override / Actions</h3>
                  <div className="space-y-2">
                    {(exc.type === 'DUPLICATE_PAYMENT' || exc.type === 'BANK_PAYMENT_MISMATCH') && (
                      <button className="btn-primary w-full" disabled={!!proposing} onClick={() => propose('REFUND', parseInt(exc.financialImpact))}>
                        {proposing === 'REFUND' ? 'Submitting…' : 'Propose Refund'}
                      </button>
                    )}
                    <button className="btn-secondary w-full" disabled={!!proposing} onClick={() => propose('MARK_REVIEWED')}>
                      {proposing === 'MARK_REVIEWED' ? 'Submitting…' : 'Mark for Review'}
                    </button>
                    <button className="btn-danger w-full" disabled={!!proposing} onClick={() => propose('ESCALATE')}>
                      {proposing === 'ESCALATE' ? 'Submitting…' : 'Escalate to Admin'}
                    </button>
                  </div>
                  {actionMsg && (
                    <p className={`mt-3 text-[12px] font-medium ${actionMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{actionMsg}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full animate-fade-in">
              <div className="flex-1 space-y-6 pb-6">
                {messages.map(msg =>
                  msg.role === 'user' ? (
                    <div key={msg.id} className="flex justify-end gap-3">
                      <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm text-[13px] leading-relaxed shadow-sm max-w-[85%]" style={{ backgroundColor: C.primary, color: C.bg }}>
                        <PlainText text={msg.content} />
                      </div>
                      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-1" style={{ backgroundColor: C.neutralTint, color: C.textPrimary }}>
                        <User className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ) : (
                    <div key={msg.id} className="flex gap-3">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-1" style={{ backgroundColor: C.primary, color: C.bg }}>
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                      {msg.loading ? (
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm border flex items-center gap-1.5" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.primary, animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.primary, animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: C.primary, animationDelay: '300ms' }} />
                        </div>
                      ) : (
                        <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm border text-[13px] leading-relaxed max-w-[85%]" style={{ backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }}>
                          <PlainText text={msg.content} />
                        </div>
                      )}
                    </div>
                  )
                )}
                <div ref={bottomRef} />
              </div>
              <div className="shrink-0 mt-auto pt-4 border-t" style={{ borderColor: C.border }}>
                <div className="relative flex items-center gap-2 rounded-lg border p-1.5 focus-within:ring-2 bg-surface transition-shadow" style={{ borderColor: C.border, '--tw-ring-color': `${C.primary}40` } as React.CSSProperties}>
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && send()}
                    placeholder="Ask LedgerMind AI..."
                    className="flex-1 bg-transparent outline-none py-1.5 px-2 text-[13px]"
                    style={{ color: C.textPrimary }}
                  />
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || sending}
                    className="w-8 h-8 rounded flex items-center justify-center shrink-0 disabled:opacity-50 transition-colors"
                    style={{ backgroundColor: C.primary, color: C.bg }}
                  >
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 ml-0.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
