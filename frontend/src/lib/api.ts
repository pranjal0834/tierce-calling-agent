import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { getToken, clearToken } from "@/lib/auth";

const BASE = (process.env.NEXT_PUBLIC_API_URL as string) || "http://localhost:8000";

export const api = axios.create({
  baseURL: BASE,
  headers: {
    "ngrok-skip-browser-warning": "1",
  },
});

// Attach JWT on every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res: AxiosResponse) => res,
  (err: unknown) => {
    if (
      axios.isAxiosError(err) &&
      err.response?.status === 401 &&
      typeof window !== "undefined"
    ) {
      clearToken();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Agents ──────────────────────────────────────────────────────────────────

export const getAgents = () => api.get("/api/agents").then((r: AxiosResponse) => r.data);
export const getAgent = (id: string) => api.get(`/api/agents/${id}`).then((r: AxiosResponse) => r.data);
export const createAgent = (data: unknown) => api.post("/api/agents", data).then((r: AxiosResponse) => r.data);
export const updateAgent = (id: string, data: unknown) => api.put(`/api/agents/${id}`, data).then((r: AxiosResponse) => r.data);
export const deleteAgent = (id: string) => api.delete(`/api/agents/${id}`);

// ── Templates ────────────────────────────────────────────────────────────────
export const getTemplates = () => api.get("/api/templates").then((r: AxiosResponse) => r.data);
export const importTemplate = (id: string, data: { name?: string; is_personal?: boolean }) =>
  api.post(`/api/templates/${id}/import`, data).then((r: AxiosResponse) => r.data);

// ── Knowledge Base ───────────────────────────────────────────────────────────

export const getKnowledgeBases = () => api.get("/api/knowledge").then((r: AxiosResponse) => r.data);
export const createKnowledgeBase = (data: { name: string; description?: string }) =>
  api.post("/api/knowledge", data).then((r: AxiosResponse) => r.data);
export const getKnowledgeBase = (id: string) =>
  api.get(`/api/knowledge/${id}`).then((r: AxiosResponse) => r.data);
export const deleteKnowledgeBase = (id: string) => api.delete(`/api/knowledge/${id}`);
export const addKbTextDoc = (kbId: string, data: { title: string; content: string }) =>
  api.post(`/api/knowledge/${kbId}/documents/text`, data).then((r: AxiosResponse) => r.data);
export const addKbUrlDoc = (kbId: string, data: { url: string; title?: string }) =>
  api.post(`/api/knowledge/${kbId}/documents/url`, data).then((r: AxiosResponse) => r.data);
export const uploadKbPdf = (kbId: string, file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post(`/api/knowledge/${kbId}/documents/upload`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then((r: AxiosResponse) => r.data);
};
export const deleteKbDoc = (kbId: string, docId: string) =>
  api.delete(`/api/knowledge/${kbId}/documents/${docId}`);
export const getKbDocContent = (kbId: string, docId: string) =>
  api.get(`/api/knowledge/${kbId}/documents/${docId}/content`).then((r: AxiosResponse) => r.data);

// ── Calls ────────────────────────────────────────────────────────────────────

export const getCalls = (agentId?: string) =>
  api.get("/api/calls", { params: agentId ? { agent_id: agentId } : {} }).then((r: AxiosResponse) => r.data);
export const getCall = (id: string) => api.get(`/api/calls/${id}`).then((r: AxiosResponse) => r.data);
export const hangupCall = (id: string) => api.post(`/api/calls/${id}/hangup`).then((r: AxiosResponse) => r.data);
export const getCallTurns = (id: string) => api.get(`/api/calls/${id}/turns`).then((r: AxiosResponse) => r.data);
export const getCallDetail = (id: string) => api.get(`/api/calls/${id}/detail`).then((r: AxiosResponse) => r.data);
export const initiateCall = (data: unknown) => api.post("/api/calls/initiate", data).then((r: AxiosResponse) => r.data);
export const bulkCall = (data: unknown) => api.post("/api/calls/bulk", data).then((r: AxiosResponse) => r.data);

// ── Compliance ────────────────────────────────────────────────────────────────
export const getDnc = () => api.get("/api/compliance/dnc").then((r: AxiosResponse) => r.data);
export const addDnc = (numbers: string[], reason?: string) =>
  api.post("/api/compliance/dnc", { numbers, reason }).then((r: AxiosResponse) => r.data);
export const removeDnc = (id: string) =>
  api.delete(`/api/compliance/dnc/${id}`).then((r: AxiosResponse) => r.data);
export const getComplianceSettings = () =>
  api.get("/api/compliance/settings").then((r: AxiosResponse) => r.data);
export const saveComplianceSettings = (data: unknown) =>
  api.put("/api/compliance/settings", data).then((r: AxiosResponse) => r.data);
export const getComplianceStats = (days = 30) =>
  api.get("/api/compliance/stats", { params: { days } }).then((r: AxiosResponse) => r.data);

export const getRecordingUrl = (callId: string): string => {
  const token = getToken();
  return `${BASE}/api/calls/${callId}/recording?token=${encodeURIComponent(token || "")}`;
};
export const getAdminRecordingUrl = (callId: string): string => {
  const token = getToken();
  return `${BASE}/api/admin/calls/${callId}/recording?token=${encodeURIComponent(token || "")}`;
};

// ── Analytics ────────────────────────────────────────────────────────────────

export const getAgentAnalytics = (agentId: string, days = 30, startDate?: string, endDate?: string) =>
  api.get(`/api/analytics/agent/${agentId}`, {
    params: startDate && endDate ? { start_date: startDate, end_date: endDate } : { days },
  }).then((r: AxiosResponse) => r.data);

export const getWorkspaceAnalytics = (days = 30, startDate?: string, endDate?: string) =>
  api.get("/api/analytics/workspace", {
    params: startDate && endDate ? { start_date: startDate, end_date: endDate } : { days },
  }).then((r: AxiosResponse) => r.data);

// ── Memory ────────────────────────────────────────────────────────────────────

export const getContacts = () => api.get("/api/memory/contacts").then((r: AxiosResponse) => r.data);
export const getContact = (id: string) => api.get(`/api/memory/contacts/${id}`).then((r: AxiosResponse) => r.data);
export const getMemoryGraph = (contactId: string) =>
  api.get(`/api/memory/contacts/${contactId}/graph`).then((r: AxiosResponse) => r.data);
export const clearMemory = (contactId: string) =>
  api.delete(`/api/memory/contacts/${contactId}/memory`);

// ── Auth ─────────────────────────────────────────────────────────────────────

export const getMe = () => api.get("/auth/me").then((r: AxiosResponse) => r.data);
export const acceptTerms = () => api.post("/auth/accept-terms").then((r: AxiosResponse) => r.data);
export const getWorkspace = () => api.get("/auth/workspace").then((r: AxiosResponse) => r.data);
export const getApiKeys = () => api.get("/auth/api-keys").then((r: AxiosResponse) => r.data);
export const createApiKey = (name: string) => api.post("/auth/api-keys", { name }).then((r: AxiosResponse) => r.data);
export const revokeApiKey = (id: string) => api.delete(`/auth/api-keys/${id}`);

// ── Tools ─────────────────────────────────────────────────────────────────────

export const getTools = (agentId: string) =>
  api.get(`/api/agents/${agentId}/tools`).then((r: AxiosResponse) => r.data);
export const addTool = (agentId: string, data: unknown) =>
  api.post(`/api/agents/${agentId}/tools`, data).then((r: AxiosResponse) => r.data);
export const updateTool = (agentId: string, toolId: string, data: unknown) =>
  api.put(`/api/agents/${agentId}/tools/${toolId}`, data).then((r: AxiosResponse) => r.data);
export const deleteTool = (agentId: string, toolId: string) =>
  api.delete(`/api/agents/${agentId}/tools/${toolId}`);

// ── Scheduling ────────────────────────────────────────────────────────────────

export const getScheduledCalls = (status?: string) =>
  api.get("/api/scheduling", { params: status ? { status } : {} }).then((r: AxiosResponse) => r.data);
export const scheduleCall = (data: unknown) =>
  api.post("/api/scheduling", data).then((r: AxiosResponse) => r.data);
export const bulkScheduleCall = (data: unknown) =>
  api.post("/api/scheduling/bulk", data).then((r: AxiosResponse) => r.data);
export const cancelScheduledCall = (id: string) =>
  api.delete(`/api/scheduling/${id}`);

// ── Billing ────────────────────────────────────────────────────────────────────

export const getBillingPacks = () =>
  api.get("/billing/packs").then((r: AxiosResponse) => r.data);
export const getBillingBalance = () =>
  api.get("/billing/balance").then((r: AxiosResponse) => r.data);
export const getBillingTransactions = (limit = 50) =>
  api.get("/billing/transactions", { params: { limit } }).then((r: AxiosResponse) => r.data);
export const createNumberWalletOrder = (amount_inr: number) =>
  api.post("/billing/number-wallet/order", { amount_inr }).then((r: AxiosResponse) => r.data);
export const topupNumberWallet = (data: {
  amount_inr: number; razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string;
}) => api.post("/billing/number-wallet/topup", data).then((r: AxiosResponse) => r.data);
export const createRazorpayOrder = (pack_id: string) =>
  api.post("/billing/razorpay/order", { pack_id }).then((r: AxiosResponse) => r.data);
export const verifyRazorpayPayment = (data: unknown) =>
  api.post("/billing/razorpay/verify", data).then((r: AxiosResponse) => r.data);
export const testPurchase = (pack_id: string) =>
  api.post("/billing/test/purchase", { pack_id }).then((r: AxiosResponse) => r.data);
export const createPaygOrder = (minutes: number) =>
  api.post("/billing/payg/order", { minutes }).then((r: AxiosResponse) => r.data);
export const verifyPaygPayment = (data: unknown) =>
  api.post("/billing/payg/verify", data).then((r: AxiosResponse) => r.data);

// ── Settings ───────────────────────────────────────────────────────────────────

export const updateWorkspace = (name: string) =>
  api.put("/auth/workspace", { name }).then((r: AxiosResponse) => r.data);
export const getMembers = () =>
  api.get("/auth/members").then((r: AxiosResponse) => r.data);
export const removeMember = (id: string) =>
  api.delete(`/auth/members/${id}`);
export const createInvite = (email: string, role = "member") =>
  api.post("/auth/invite", { email, role }).then((r: AxiosResponse) => r.data);

// ── Phone Numbers ──────────────────────────────────────────────────────────────

export const getPhoneNumbers = () =>
  api.get("/api/phone-numbers").then((r: AxiosResponse) => r.data);
export const searchAvailableNumbers = (areaCode: string, country = "US", limit = 20, offset = 0, contains = "") =>
  api.get("/api/phone-numbers/available", { params: { area_code: areaCode, country, limit, offset, contains } }).then((r: AxiosResponse) => r.data);
export const getAvailableCities = (country = "IN") =>
  api.get("/api/phone-numbers/cities", { params: { country } }).then((r: AxiosResponse) => r.data);
export const createNumberPaymentOrder = (data: { phone_number: string; monthly_cost_usd: number }) =>
  api.post("/api/phone-numbers/order", data).then((r: AxiosResponse) => r.data);
export const provisionNumber = (data: {
  phone_number: string; agent_id?: string; friendly_name?: string; monthly_cost_usd?: number;
  razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string;
}) => api.post("/api/phone-numbers", data).then((r: AxiosResponse) => r.data);
export const updateNumberRouting = (id: string, agentId: string | null) =>
  api.patch(`/api/phone-numbers/${id}`, { agent_id: agentId }).then((r: AxiosResponse) => r.data);
export const updateNumberAutoRenew = (id: string, autoRenew: boolean) =>
  api.patch(`/api/phone-numbers/${id}`, { auto_renew: autoRenew }).then((r: AxiosResponse) => r.data);
export const releasePhoneNumber = (id: string) =>
  api.delete(`/api/phone-numbers/${id}`);
export const createRenewalOrder = (id: string) =>
  api.post(`/api/phone-numbers/${id}/renew/order`).then((r: AxiosResponse) => r.data);
export const renewPhoneNumber = (id: string, data: {
  razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string;
} = {}) => api.post(`/api/phone-numbers/${id}/renew`, data).then((r: AxiosResponse) => r.data);
export const getTelephonyConfig = () =>
  api.get("/api/phone-numbers/config").then((r: AxiosResponse) => r.data);
export const saveTelephonyConfig = (data: unknown) =>
  api.put("/api/phone-numbers/config", data).then((r: AxiosResponse) => r.data);

// ── WhatsApp (per-workspace connection) ──────────────────────────────────────
export const getWhatsappConfig = () =>
  api.get("/api/whatsapp/config").then((r: AxiosResponse) => r.data);
export const saveWhatsappConfig = (api_key: string) =>
  api.put("/api/whatsapp/config", { api_key }).then((r: AxiosResponse) => r.data);
export const testWhatsappConfig = (to: string) =>
  api.post("/api/whatsapp/test", { to }).then((r: AxiosResponse) => r.data);

// ── KYC / Regulatory Bundles ──────────────────────────────────────────────────

export const getKycBundles = () =>
  api.get("/api/kyc").then((r: AxiosResponse) => r.data);
export const getKycBundle = (country: string) =>
  api.get(`/api/kyc/${country}`).then((r: AxiosResponse) => r.data);
export const submitKyc = (data: {
  country: string;
  business_name: string;
  business_type: string;
  gstin?: string;
  cin?: string;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  authorized_name: string;
  authorized_pan?: string;
}) => api.post("/api/kyc", data).then((r: AxiosResponse) => r.data);
export const refreshKycStatus = (bundleId: string) =>
  api.post(`/api/kyc/${bundleId}/refresh`).then((r: AxiosResponse) => r.data);
export const getKycDocTypes = (country: string) =>
  api.get(`/api/kyc/doc-types/${country}`).then((r: AxiosResponse) => r.data);
export const uploadKycDoc = (bundleId: string, docType: string, file: File) => {
  const fd = new FormData();
  fd.append("doc_type", docType);
  fd.append("file", file);
  return api.post(`/api/kyc/${bundleId}/documents`, fd).then((r: AxiosResponse) => r.data);
};
export const listKycDocs = (bundleId: string) =>
  api.get(`/api/kyc/${bundleId}/documents`).then((r: AxiosResponse) => r.data);
export const deleteKycDoc = (bundleId: string, docId: string) =>
  api.delete(`/api/kyc/${bundleId}/documents/${docId}`).then((r: AxiosResponse) => r.data);
export const finalizeKyc = (bundleId: string) =>
  api.post(`/api/kyc/${bundleId}/finalize`).then((r: AxiosResponse) => r.data);
// admin
export const adminListKyc = () =>
  api.get("/api/kyc/admin/list").then((r: AxiosResponse) => r.data);
export const adminKycPendingCount = () =>
  api.get("/api/kyc/admin/pending-count").then((r: AxiosResponse) => r.data);
export const adminApproveKyc = (id: string, plivo_bundle_sid: string) =>
  api.post(`/api/kyc/admin/${id}/approve`, { plivo_bundle_sid }).then((r: AxiosResponse) => r.data);
export const adminRejectKyc = (id: string, reason: string) =>
  api.post(`/api/kyc/admin/${id}/reject`, { reason }).then((r: AxiosResponse) => r.data);
export const adminDeleteKyc = (id: string) =>
  api.delete(`/api/kyc/admin/${id}`).then((r: AxiosResponse) => r.data);
export const downloadKycDocAdmin = async (docId: string, fileName: string) => {
  const r = await api.get(`/api/kyc/admin/doc/${docId}`, { responseType: "blob" });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
};

// ── Webhooks ────────────────────────────────────────────────────────────────────

export const getWebhookEndpoints = () =>
  api.get("/api/webhooks").then((r: AxiosResponse) => r.data);
export const createWebhookEndpoint = (data: { url: string; events: string[] }) =>
  api.post("/api/webhooks", data).then((r: AxiosResponse) => r.data);
export const updateWebhookEndpoint = (id: string, data: { url?: string; events?: string[]; is_active?: boolean }) =>
  api.patch(`/api/webhooks/${id}`, data).then((r: AxiosResponse) => r.data);
export const deleteWebhookEndpoint = (id: string) =>
  api.delete(`/api/webhooks/${id}`);
export const getWebhookDeliveries = (id: string, limit = 50) =>
  api.get(`/api/webhooks/${id}/deliveries`, { params: { limit } }).then((r: AxiosResponse) => r.data);
export const testWebhookEndpoint = (id: string) =>
  api.post(`/api/webhooks/${id}/test`).then((r: AxiosResponse) => r.data);
