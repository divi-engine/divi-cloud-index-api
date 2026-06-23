export type PublicSite = {
  site_uid: string;
  site_id_short: string;
  site_url: string;
  status: string;
  tier: string;
  document_limit: number;
  document_count: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  typesense_key_id: number | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  trial_used: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  stripe_customer_url: string | null;
  stripe_subscription_url: string | null;
  usage_percent: number;
};

export type OverviewResponse = {
  stats: {
    total_sites: number;
    by_status: Record<string, number>;
    by_tier: Record<string, number>;
    active_subscriptions: number;
    total_documents: number;
    avg_usage_percent: number;
  };
  mrr: MrrSummary;
};

export type MrrSummary = {
  currency: 'gbp';
  mrr_gbp: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  by_tier: Record<string, { count: number; mrr_gbp: number }>;
};

export type CustomersResponse = {
  total: number;
  limit: number;
  offset: number;
  customers: PublicSite[];
};

export type TypesenseReport = {
  collections: Array<{
    name: string;
    num_documents: number;
    site_uid: string | null;
    site_id_short: string | null;
    is_orphan: boolean;
  }>;
  keys: Array<{ id: number; description?: string; collections?: string[] }>;
  total_collections: number;
  total_documents: number;
  orphan_count: number;
  matched_count: number;
};

export type EarningsResponse = {
  mrr: MrrSummary;
  earnings: {
    month: string;
    currency: 'gbp';
    total_gbp: number;
    invoice_count: number;
    by_tier: Record<string, { count: number; amount_gbp: number }>;
  };
};

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? res.statusText);
  }
  return data as T;
}

export async function login(password: string): Promise<void> {
  await request('/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<void> {
  await request('/v1/admin/logout', { method: 'POST' });
}

export async function me(): Promise<{ ok: boolean }> {
  return request('/v1/admin/me');
}

export async function fetchOverview(): Promise<OverviewResponse> {
  return request('/v1/admin/overview');
}

export async function fetchCustomers(params: {
  status?: string;
  tier?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<CustomersResponse> {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.tier) q.set('tier', params.tier);
  if (params.search) q.set('search', params.search);
  if (params.limit) q.set('limit', String(params.limit));
  if (params.offset) q.set('offset', String(params.offset));
  const qs = q.toString();
  return request(`/v1/admin/customers${qs ? `?${qs}` : ''}`);
}

export async function fetchCustomer(siteUid: string): Promise<{
  customer: PublicSite;
  typesense_prefix: string;
}> {
  return request(`/v1/admin/customers/${siteUid}`);
}

export async function refreshCustomerUsage(siteUid: string): Promise<{
  document_count: number;
  customer: PublicSite | null;
}> {
  return request(`/v1/admin/customers/${siteUid}/refresh-usage`, { method: 'POST' });
}

export async function fetchTypesenseReport(): Promise<TypesenseReport> {
  return request('/v1/admin/typesense');
}

export async function fetchEarnings(month: string): Promise<EarningsResponse> {
  return request(`/v1/admin/earnings?month=${encodeURIComponent(month)}`);
}

export { ApiError };
