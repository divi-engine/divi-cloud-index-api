import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTypesenseReport, type TypesenseReport } from '../api/client';

export default function TypesensePage() {
  const [report, setReport] = useState<TypesenseReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTypesenseReport()
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!report) return <p className="text-slate-400">Loading Typesense report…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Typesense</h1>
        <p className="text-sm text-slate-400">
          {report.total_collections} collections · {report.total_documents.toLocaleString()} documents ·{' '}
          <span className={report.orphan_count ? 'text-amber-400' : 'text-emerald-400'}>
            {report.orphan_count} orphan(s)
          </span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-400">
            <tr>
              <th className="px-4 py-3">Collection</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3">Site</th>
            </tr>
          </thead>
          <tbody>
            {report.collections.map((col) => (
              <tr
                key={col.name}
                className={`border-t border-slate-800 ${col.is_orphan ? 'bg-amber-950/30' : ''}`}
              >
                <td className="px-4 py-3 font-mono text-xs">{col.name}</td>
                <td className="px-4 py-3">{col.num_documents.toLocaleString()}</td>
                <td className="px-4 py-3">
                  {col.site_uid ? (
                    <Link to={`/customers/${col.site_uid}`} className="text-indigo-400 hover:underline">
                      {col.site_id_short}
                    </Link>
                  ) : (
                    <span className="text-amber-400">Orphan</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-medium text-white">API keys ({report.keys.length})</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          {report.keys.slice(0, 20).map((key) => (
            <li key={key.id} className="font-mono text-xs">
              #{key.id} {key.description ?? '—'} ({key.collections?.length ?? 0} collections)
            </li>
          ))}
          {report.keys.length > 20 ? (
            <li className="text-slate-500">…and {report.keys.length - 20} more</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
