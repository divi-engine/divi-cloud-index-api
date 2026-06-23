import { useEffect, useState } from 'react';
import { fetchEarnings, type EarningsResponse } from '../api/client';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function EarningsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    fetchEarnings(month)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [month]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Earnings</h1>
          <p className="text-sm text-slate-400">Paid invoice revenue and current MRR.</p>
        </div>
        <label className="text-sm text-slate-300">
          Month
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="ml-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
          />
        </label>
      </div>

      {error ? <p className="text-red-400">{error}</p> : null}
      {!data ? <p className="text-slate-400">Loading…</p> : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card label="MRR (active + trialing)" value={`£${data.mrr.mrr_gbp.toFixed(2)}`} />
            <Card label={`Paid in ${data.earnings.month}`} value={`£${data.earnings.total_gbp.toFixed(2)}`} />
            <Card label="Paid invoices" value={data.earnings.invoice_count} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TierTable title="MRR by tier" rows={data.mrr.by_tier} valueKey="mrr_gbp" />
            <TierTable title={`Revenue ${data.earnings.month}`} rows={data.earnings.by_tier} valueKey="amount_gbp" />
          </div>
        </>
      ) : null}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function TierTable({
  title,
  rows,
  valueKey,
}: {
  title: string;
  rows: Record<string, { count: number; mrr_gbp?: number; amount_gbp?: number }>;
  valueKey: 'mrr_gbp' | 'amount_gbp';
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="font-medium text-white">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {Object.entries(rows).map(([tier, row]) => (
          <li key={tier} className="flex justify-between text-slate-300 capitalize">
            <span>
              {tier} ({row.count})
            </span>
            <span>£{((row[valueKey] ?? 0) as number).toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
