import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCustomers, type PublicSite } from '../api/client';

const statuses = ['', 'none', 'trialing', 'active', 'past_due', 'cancelled', 'expired'];
const tiers = ['', 'starter', 'growth', 'scale'];

export default function CustomersPage() {
  const [status, setStatus] = useState('');
  const [tier, setTier] = useState('');
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<PublicSite[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const limit = 25;

  useEffect(() => {
    setError('');
    fetchCustomers({
      status: status || undefined,
      tier: tier || undefined,
      search: search || undefined,
      limit,
      offset,
    })
      .then((res) => {
        setCustomers(res.customers);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [status, tier, search, offset]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Customers</h1>
        <p className="text-sm text-slate-400">{total} site(s) registered</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => {
            setOffset(0);
            setStatus(e.target.value);
          }}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        >
          {statuses.map((s) => (
            <option key={s || 'all'} value={s}>
              {s ? s : 'All statuses'}
            </option>
          ))}
        </select>
        <select
          value={tier}
          onChange={(e) => {
            setOffset(0);
            setTier(e.target.value);
          }}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        >
          {tiers.map((t) => (
            <option key={t || 'all'} value={t}>
              {t ? t : 'All tiers'}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search URL, short id, UUID…"
          value={search}
          onChange={(e) => {
            setOffset(0);
            setSearch(e.target.value);
          }}
          className="min-w-[220px] flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        />
      </div>

      {error ? <p className="text-red-400">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-400">
            <tr>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.site_uid} className="border-t border-slate-800 hover:bg-slate-900/60">
                <td className="px-4 py-3">
                  <Link to={`/customers/${c.site_uid}`} className="text-indigo-400 hover:underline">
                    {c.site_url || c.site_id_short}
                  </Link>
                  <p className="text-xs text-slate-500">{c.site_uid}</p>
                </td>
                <td className="px-4 py-3 capitalize">{c.status}</td>
                <td className="px-4 py-3 capitalize">{c.tier}</td>
                <td className="px-4 py-3">
                  {c.document_count.toLocaleString()} / {c.document_limit.toLocaleString()} ({c.usage_percent}%)
                </td>
                <td className="px-4 py-3 text-slate-400">{new Date(c.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
          className="rounded-md border border-slate-700 px-3 py-1 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm text-slate-400">
          {offset + 1}–{Math.min(offset + limit, total)} of {total}
        </span>
        <button
          type="button"
          disabled={offset + limit >= total}
          onClick={() => setOffset(offset + limit)}
          className="rounded-md border border-slate-700 px-3 py-1 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
