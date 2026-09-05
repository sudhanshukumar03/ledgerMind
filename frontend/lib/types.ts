export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'FINANCE' | 'VIEWER';
  merchantId: string;
}

export interface DashboardStats {
  // Volume & matching
  total_transaction_volume: string;  // paise as string (BigInt serialised)
  reconciliation_rate: number;
  // Exception counts
  open_exceptions: number;
  critical_exceptions: number;
  pending_approvals: number;
  resolved_today: number;
  // Breakdown arrays (for charts)
  exceptions_by_type: { type: string; count: number }[];
  exceptions_by_severity: { severity: string; count: number }[];
}

export interface Exception {
  id: string;
  exceptionId: string;
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'IGNORED';
  financialImpact: string; // paise as string
  differenceAmount?: string;
  customerImpact?: string;
  description: string;
  resolutionNote?: string;
  createdAt: string;
  resolvedAt?: string;
  aiAnalyses?: AiAnalysis[];
}

export interface AiAnalysis {
  id: string;
  summary: string;
  likelyCause: string;
  confidence: number;
  recommendedAction: string;
  evidenceChain: string[];
  nextSteps: string[];
  createdAt: string;
  toolCalls?: { tool: string; args: any; result: any }[];
}

export interface ReconciliationRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  totalRecords: number;
  matchedCount: number;
  exceptionCount: number;
}

export interface Action {
  id: string;
  type: 'REFUND' | 'CREATE_PAYMENT_LINK' | 'MARK_REVIEWED' | 'ESCALATE';
  status: 'PROPOSED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  amount?: string;
  reason: string;
  exceptionId: string;
  idempotencyKey: string;
  createdAt: string;
  executionResult?: any;
}

export interface ProposeActionPayload {
  exceptionId: string;
  type: string;
  amount?: number;
  reason: string;
  idempotencyKey?: string;
  // Extra params forwarded into the parameters object
  payment_id?: string;
  order_id?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: string;
  tool_calls_made: number;
  tool_calls?: { tool: string; args: any; result: any }[];
  suggested_actions: string[];
}

export interface Payment {
  id: string;
  paymentId: string;
  amount: string;
  status: string;
  method?: string;
  createdAt: string;
}

export interface Settlement {
  id: string;
  settlementId: string;
  amount: string;
  settlementDate: string;
  status: string;
  utr?: string;
}

export interface WebhookEvent {
  id: string;
  eventId: string;
  eventType: string;
  payload: any;
  receivedAt: string;
  signatureVerified: boolean;
  processingStatus: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
