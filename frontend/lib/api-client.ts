/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LedgerMind Central API Client & Transport Layer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Architecture & Design Patterns:
 * 1. SINGLETON AXIOS INSTANCE:
 *    All client-side communication with the NestJS backend routes through this
 *    configured instance, ensuring uniform headers, base URL routing, and security.
 *
 * 2. BEARER TOKEN INJECTION:
 *    JWT access tokens stored in localStorage (`lm_token`) are injected into the
 *    `Authorization` header via request interceptors before transmission.
 *
 * 3. GRACEFUL SESSION RECOVERY (401 Interceptor):
 *    Unauthorized responses trigger an automatic token purge and redirect to
 *    `/login`, preventing corrupted authentication states or stale sessions.
 *
 * 4. DOMAIN-DRIVEN API MODULES:
 *    Grouped logically by financial domain:
 *    - `authApi`: Credential verification and session generation.
 *    - `dashboardApi`: Reconciled volume and KPI statistics aggregation.
 *    - `exceptionsApi`: Exception queue queries and AI root-cause investigation triggers.
 *    - `reconciliationApi`: Deterministic ladder trigger (`/run`) and historical audit runs.
 *    - `actionsApi`: Remediation proposals, maker-checker approvals, and rejections.
 *    - `aiApi`: Natural-language financial assistant command center chat.
 *    - `transactionsApi`: Deep drill-down exploration for payments and settlements.
 */

import axios from 'axios';
import type {
  User, DashboardStats, Exception, AiAnalysis, ReconciliationRun, Action,
  ProposeActionPayload, ChatMessage, ChatResponse, Payment, Settlement,
  PaymentDetail, SettlementDetail,
  WebhookEvent, PaginatedResponse, AuditLog
} from './types';

export * from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Auth token injection ─────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('lm_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── 401 → redirect to login ──────────────────────────────────────────────────
let isRedirecting = false;

api.interceptors.response.use(
  (res) => {
    if (typeof window !== 'undefined' && res.config.method === 'get' && !res.config.url?.startsWith('/auth')) window.dispatchEvent(new Event('ledgermind:data-updated'));
    return res;
  },
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.startsWith('/auth/') && typeof window !== 'undefined' && !isRedirecting) {
      isRedirecting = true;
      localStorage.removeItem('lm_token');
      localStorage.removeItem('lm_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; user: User }>('/auth/login', { email, password }),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  getStats: () => api.get<DashboardStats>('/reconciliation/stats'),
};

// ─── Exceptions ───────────────────────────────────────────────────────────────
export const exceptionsApi = {
  list: (params?: { status?: string; severity?: string; type?: string; search?: string; page?: number; limit?: number }) =>
    api.get<PaginatedResponse<Exception>>('/exceptions', { params }),
  get: (id: string, signal?: AbortSignal) => api.get<Exception>(`/exceptions/${id}`, { signal }),
  investigate: (id: string, signal?: AbortSignal) => api.post<AiAnalysis>(`/ai/investigate/${id}`, {}, { signal }),
};

// ─── Reconciliation ───────────────────────────────────────────────────────────
export const reconciliationApi = {
  triggerRun: () => api.post<ReconciliationRun>('/reconciliation/run'),
  // Normalise the response shape in one place: the endpoint returns a bare
  // array today, but tolerate a paginated `{ data: [] }` wrapper too so every
  // caller gets a plain ReconciliationRun[] regardless.
  listRuns: async (): Promise<ReconciliationRun[]> => {
    const r = await api.get<ReconciliationRun[] | { data: ReconciliationRun[] }>('/reconciliation/runs');
    return Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
  },
};

// ─── Actions ─────────────────────────────────────────────────────────────────
export const actionsApi = {
  list: (params?: { status?: string }) =>
    api.get<Action[]>('/actions', { params }),
  propose: (payload: ProposeActionPayload) =>
    api.post<Action>('/actions', {
      exception_id: payload.exceptionId,
      action_type: payload.type,
      parameters: {
        ...(payload.amount !== undefined && { amount: payload.amount }),
        ...(payload.reason && { reason: payload.reason }),
        ...(payload.payment_id && { payment_id: payload.payment_id }),
        ...(payload.order_id && { order_id: payload.order_id }),
      },
    }),
  recover: (id: string, provider_id: string) => api.post<Action>(`/actions/${id}/recover`, { provider_id }),
  approve: (id: string, reason?: string) =>
    api.post<Action>(`/actions/${id}/approve`, { reason: reason ?? 'Approved' }),
  reject: (id: string, reason: string) =>
    api.post<Action>(`/actions/${id}/reject`, { reason }),
};

// ─── AI Chat ─────────────────────────────────────────────────────────────────
// Keep the wire payload below the API's 100 KB JSON limit as well as the
// turn/content caps. Measure encoded JSON because escaping/Unicode add bytes.
export function boundChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const history = messages.filter(m => m.content.trim()).slice(-40).map(m => ({ ...m, content: m.content.slice(0, 8000) }));
  const encoder = new TextEncoder();
  while (history.length > 1 && encoder.encode(JSON.stringify({ messages: history })).byteLength > 90000) history.shift();
  return history;
}

export const aiApi = {
  chat: (messages: ChatMessage[]) =>
    api.post<ChatResponse>('/ai/chat', { messages: boundChatMessages(messages) }),
  getConfig: () => api.get<{ model: string; toolCount: number }>('/ai/config'),
};

// ─── Transactions ─────────────────────────────────────────────────────────────
type PaymentFilters = { page?: number; limit?: number; status?: string; method?: string; search?: string; from?: string; to?: string };
type SettlementFilters = { page?: number; limit?: number; status?: string; search?: string; from?: string; to?: string };

export const transactionsApi = {
  listPayments: (params?: PaymentFilters) =>
    api.get<PaginatedResponse<Payment>>('/payments', { params }),
  listSettlements: (params?: SettlementFilters) =>
    api.get<PaginatedResponse<Settlement>>('/settlements', { params }),
  getPayment: (id: string, signal?: AbortSignal) => api.get<PaymentDetail>(`/payments/${id}`, { signal }),
  getSettlement: (id: string, signal?: AbortSignal) => api.get<SettlementDetail>(`/settlements/${id}`, { signal }),
};

// ─── Webhooks ────────────────────────────────────────────────────────────────
export const webhooksApi = {
  listEvents: (params?: { page?: number; limit?: number }) =>
    api.get<PaginatedResponse<WebhookEvent>>('/webhooks/events', { params }),
};

// ─── Audit Trail ─────────────────────────────────────────────────────────────
export const auditApi = {
  list: (params?: { limit?: number }) =>
    api.get<AuditLog[]>('/audit', { params }),
};



// ─── Utils ───────────────────────────────────────────────────────────────────

export const getUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('lm_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
