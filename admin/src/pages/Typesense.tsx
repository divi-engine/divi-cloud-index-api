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

  const staleKeys = report.keys.filter((k) => k.is_stale);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Typesense</h1>
        <p className="text-sm text-slate-400">
          {report.total_collections} collections · {report.total_documents.toLocaleString()} documents ·{' '}
          <span className={report.orphan_count ? 'text-amber-400' : 'text-emerald-400'}>
            {report.orphan_count} orphan collection(s)
          </span>
        </p>
        {report.total_collections === 0 && report.keys.length > 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No indexed collections yet. Keys may still list a placeholder collection name until the site syncs
            content from WordPress.
          </p>
        ) : null}
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
            {report.collections.length === 0 ? (
              <tr className="border-t border-slate-800">
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                  No cloud index collections in Typesense yet.
                </td>
              </tr>
            ) : (
              report.collections.map((col) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-medium text-white">API keys ({report.keys.length})</h2>
        {staleKeys.length > 0 ? (
          <p className="mt-1 text-sm text-amber-400">
            {staleKeys.length} stale key(s) — left over from re-provisioning; only the active key is stored in the
            database.
          </p>
        ) : null}
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="px-3 py-2">Key</th>
                <th className="px-3 py-2">Site</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Allowed collections</th>
              </tr>
            </thead>
            <tbody>
              {report.keys.map((key) => (
                <tr key={key.id} className="border-t border-slate-800">
                  <td className="px-3 py-2 font-mono text-xs">#{key.id}</td>
                  <td className="px-3 py-2">
                    {key.site_uid ? (
                      <Link to={`/customers/${key.site_uid}`} className="text-indigo-400 hover:underline">
                        {key.site_url || key.site_id_short}
                      </Link>
                    ) : (
                      <span className="text-slate-400">{key.site_id_short ?? '—'}</span>
                    )}
                    {key.site_id_short ? (
                      <span className="ml-2 font-mono text-xs text-slate-500">{key.site_id_short}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {key.is_active ? (
                      <span className="text-emerald-400">Active</span>
                    ) : key.is_stale ? (
                      <span className="text-amber-400">Stale</span>
                    ) : (
                      <span className="text-slate-400">Unknown</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-300">
                    {key.collections.length > 0 ? key.collections.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
