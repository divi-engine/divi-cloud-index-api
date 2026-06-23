import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchCustomer, refreshCustomerUsage, type PublicSite } from '../api/client';

export default function CustomerDetailPage() {
  const { siteUid = '' } = useParams();
  const [customer, setCustomer] = useState<PublicSite | null>(null);
  const [prefix, setPrefix] = useState('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!siteUid) return;
    fetchCustomer(siteUid)
      .then((res) => {
        setCustomer(res.customer);
        setPrefix(res.typesense_prefix);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [siteUid]);

  async function onRefreshUsage() {
    if (!siteUid) return;
    setRefreshing(true);
    try {
      const res = await refreshCustomerUsage(siteUid);
      if (res.customer) setCustomer(res.customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  if (error) return <p className="text-red-400">{error}</p>;
  if (!customer) return <p className="text-slate-400">Loading customer…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/customers" className="text-sm text-indigo-400 hover:underline">
          ← Back to customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">{customer.site_url || customer.site_id_short}</h1>
        <p className="text-sm text-slate-400">{customer.site_uid}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-sm">
          <Row label="Status" value={customer.status} />
          <Row label="Tier" value={customer.tier} />
          <Row label="Short ID" value={customer.site_id_short} />
          <Row label="Typesense prefix" value={prefix} />
          <Row
            label="Documents"
            value={`${customer.document_count.toLocaleString()} / ${customer.document_limit.toLocaleString()} (${customer.usage_percent}%)`}
          />
          <Row label="Trial ends" value={customer.trial_ends_at ?? '—'} />
          <Row label="Grace ends" value={customer.grace_ends_at ?? '—'} />
          <Row label="Last seen" value={customer.last_seen_at ? new Date(customer.last_seen_at).toLocaleString() : '—'} />
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-sm">
          <Row label="Stripe customer" value={customer.stripe_customer_id ?? '—'} />
          {customer.stripe_customer_url ? (
            <a href={customer.stripe_customer_url} target="_blank" rel="noreferrer" className="text-indigo-400 text-sm">
              Open in Stripe →
            </a>
          ) : null}
          <Row label="Subscription" value={customer.stripe_subscription_id ?? '—'} />
          {customer.stripe_subscription_url ? (
            <a href={customer.stripe_subscription_url} target="_blank" rel="noreferrer" className="text-indigo-400 text-sm">
              Open subscription →
            </a>
          ) : null}
          <Row label="Typesense key ID" value={customer.typesense_key_id?.toString() ?? '—'} />
        </div>
      </div>

      <button
        type="button"
        onClick={onRefreshUsage}
        disabled={refreshing}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {refreshing ? 'Refreshing…' : 'Refresh document count from Typesense'}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-800 py-2 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right text-slate-200 capitalize">{value}</span>
    </div>
  );
}
