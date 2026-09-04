/**
 * LedgerMind API Client
 *
 * Single axios instance — all requests go through here.
 * Token is read from localStorage (set by the login page).
 * On 401, the user is redirected to /login.
 */

import axios from 'axios';
import type { 
  User, DashboardStats, Exception, AiAnalysis, ReconciliationRun, Action, 
  ProposeActionPayload, ChatMessage, ChatResponse, Payment, Settlement, 
  WebhookEvent, PaginatedResponse 
} from './types';

export * from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

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
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined' && !isRedirecting) {
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
  list: (params?: { status?: string; severity?: string; page?: number; limit?: number }) =>
    api.get<PaginatedResponse<Exception>>('/exceptions', { params }),
  get: (id: string) => api.get<Exception>(`/exceptions/${id}`),
  investigate: (id: string) => api.post<AiAnalysis>(`/ai/investigate/${id}`),
};

// ─── Reconciliation ───────────────────────────────────────────────────────────
export const reconciliationApi = {
  triggerRun: () => api.post<ReconciliationRun>('/reconciliation/run'),
  listRuns: () => api.get<ReconciliationRun[]>('/reconciliation/runs'),
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
  approve: (id: string, reason?: string) =>
    api.post<Action>(`/actions/${id}/approve`, { reason: reason ?? 'Approved' }),
  reject: (id: string, reason: string) =>
    api.post<Action>(`/actions/${id}/reject`, { reason }),
};

// ─── AI Chat ─────────────────────────────────────────────────────────────────
export const aiApi = {
  chat: (messages: ChatMessage[]) =>
    api.post<ChatResponse>('/ai/chat', { messages }),
};

// ─── Transactions ─────────────────────────────────────────────────────────────
export const transactionsApi = {
  listPayments: (params?: { page?: number; limit?: number }) =>
    api.get<PaginatedResponse<Payment>>('/payments', { params }),
  listSettlements: (params?: { page?: number; limit?: number }) =>
    api.get<PaginatedResponse<Settlement>>('/settlements', { params }),
};

// ─── Webhooks ────────────────────────────────────────────────────────────────
export const webhooksApi = {
  listEvents: (params?: { page?: number; limit?: number }) =>
    api.get<PaginatedResponse<WebhookEvent>>('/webhooks/events', { params }),
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
