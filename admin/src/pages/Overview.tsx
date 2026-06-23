import { useEffect, useState } from 'react';
import { fetchOverview, type OverviewResponse } from '../api/client';

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOverview()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }
  if (!data) {
    return <p className="text-slate-400">Loading overview…</p>;
  }

  const { stats, mrr } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <p className="text-sm text-slate-400">Cloud index customers, usage, and recurring revenue.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total sites" value={stats.total_sites} />
        <Kpi label="Active subscriptions" value={stats.active_subscriptions} />
        <Kpi label="Indexed documents" value={stats.total_documents.toLocaleString()} />
        <Kpi label="MRR" value={`£${mrr.mrr_gbp.toFixed(2)}`} hint={`${mrr.active_subscriptions} active, ${mrr.trialing_subscriptions} trialing`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-medium text-white">By status</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {Object.entries(stats.by_status).map(([status, count]) => (
              <li key={status} className="flex justify-between text-slate-300">
                <span>{status}</span>
                <span>{count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-medium text-white">By tier</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {Object.entries(stats.by_tier).map(([tier, count]) => (
              <li key={tier} className="flex justify-between text-slate-300">
                <span className="capitalize">{tier}</span>
                <span>{count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Average usage: {stats.avg_usage_percent}%</p>
        </div>
      </div>
    </div>
  );
}
