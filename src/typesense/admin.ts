import { getEnv } from '../config.js';

export function typesenseBaseUrl(): string {
  const env = getEnv();
  return `${env.TYPESENSE_PROTOCOL}://${env.TYPESENSE_HOST}:${env.TYPESENSE_PORT}`;
}

export async function typesenseRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const env = getEnv();
  const url = `${typesenseBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'X-TYPESENSE-API-KEY': env.TYPESENSE_ADMIN_API_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Typesense ${path} failed (${res.status}): ${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

type TypesenseCollection = { name: string; num_documents?: number };

export async function listCollectionsForPrefix(prefix: string): Promise<TypesenseCollection[]> {
  const all = await typesenseRequest<TypesenseCollection[]>('/collections');
  return all.filter((c) => c.name.startsWith(prefix));
}

export async function deleteCollectionsForPrefix(prefix: string): Promise<number> {
  const collections = await listCollectionsForPrefix(prefix);
  let deleted = 0;
  for (const col of collections) {
    await typesenseRequest(`/collections/${encodeURIComponent(col.name)}`, { method: 'DELETE' });
    deleted += 1;
  }
  return deleted;
}

export async function countDocumentsForPrefix(prefix: string): Promise<number> {
  const collections = await listCollectionsForPrefix(prefix);
  return collections.reduce((sum, c) => sum + (c.num_documents ?? 0), 0);
}

type TypesenseKeyResponse = { id: number; value: string };

export async function createScopedSearchKey(
  siteIdShort: string,
  collectionNames: string[]
): Promise<TypesenseKeyResponse> {
  const actions = [
    'documents:search',
    'documents:read',
    'documents:create',
    'documents:update',
    'documents:delete',
    'collections:read',
    'collections:schema_read',
    'collections:create',
    'aliases:read',
  ];

  return typesenseRequest<TypesenseKeyResponse>('/keys', {
    method: 'POST',
    body: JSON.stringify({
      description: `cloud-index-${siteIdShort}`,
      actions,
      collections: collectionNames.length > 0 ? collectionNames : [`de_${siteIdShort}_placeholder`],
    }),
  });
}

export async function updateKeyCollections(keyId: number, collectionNames: string[]): Promise<void> {
  if (collectionNames.length === 0) {
    return;
  }
  await typesenseRequest(`/keys/${keyId}`, {
    method: 'PATCH',
    body: JSON.stringify({ collections: collectionNames }),
  });
}

export async function revokeKey(keyId: number): Promise<void> {
  await typesenseRequest(`/keys/${keyId}`, { method: 'DELETE' });
}

type TypesenseKey = {
  id: number;
  description?: string;
  collections?: string[];
  actions?: string[];
};

export async function listAllCollections(): Promise<TypesenseCollection[]> {
  return typesenseRequest<TypesenseCollection[]>('/collections');
}

export async function listAllKeys(): Promise<TypesenseKey[]> {
  const res = await typesenseRequest<{ keys: TypesenseKey[] }>('/keys');
  return res.keys ?? [];
}

export type TypesenseCollectionReportRow = {
  name: string;
  num_documents: number;
  site_uid: string | null;
  site_id_short: string | null;
  is_orphan: boolean;
};

export type TypesenseKeyReportRow = {
  id: number;
  description: string | null;
  collections: string[];
  site_id_short: string | null;
  site_uid: string | null;
  site_url: string | null;
  is_active: boolean;
  is_stale: boolean;
};

export type TypesenseReport = {
  collections: TypesenseCollectionReportRow[];
  keys: TypesenseKeyReportRow[];
  total_collections: number;
  total_documents: number;
  orphan_count: number;
  matched_count: number;
};

export function siteIdShortFromKeyDescription(description: string | undefined): string | null {
  if (!description) {
    return null;
  }
  const match = /^cloud-index-([a-zA-Z0-9]+)$/.exec(description.trim());
  return match?.[1] ?? null;
}

export function siteIdShortFromCollectionName(name: string): string | null {
  const match = /^de_([a-zA-Z0-9]+)_/.exec(name);
  return match?.[1] ?? null;
}

export async function buildTypesenseReport(
  sites: Array<{
    site_uid: string;
    site_id_short: string;
    site_url?: string;
    typesense_key_id?: number | null;
  }>
): Promise<TypesenseReport> {
  const byShort = new Map(
    sites.map((s) => [
      s.site_id_short,
      { site_uid: s.site_uid, site_url: s.site_url ?? '', typesense_key_id: s.typesense_key_id ?? null },
    ])
  );
  const activeKeyIds = new Set(
    sites.map((s) => s.typesense_key_id).filter((id): id is number => typeof id === 'number')
  );
  const collections = await listAllCollections();
  const rawKeys = await listAllKeys();

  const cloudCollections = collections.filter((c) => c.name.startsWith('de_'));
  let totalDocuments = 0;
  let orphanCount = 0;
  let matchedCount = 0;

  const rows: TypesenseCollectionReportRow[] = cloudCollections.map((col) => {
    const numDocuments = col.num_documents ?? 0;
    totalDocuments += numDocuments;
    const siteIdShort = siteIdShortFromCollectionName(col.name);
    const siteMeta = siteIdShort ? byShort.get(siteIdShort) : undefined;
    const siteUid = siteMeta?.site_uid ?? null;
    const isOrphan = !siteUid;
    if (isOrphan) {
      orphanCount += 1;
    } else {
      matchedCount += 1;
    }
    return {
      name: col.name,
      num_documents: numDocuments,
      site_uid: siteUid,
      site_id_short: siteIdShort,
      is_orphan: isOrphan,
    };
  });

  rows.sort((a, b) => {
    if (a.is_orphan !== b.is_orphan) {
      return a.is_orphan ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const keyRows: TypesenseKeyReportRow[] = rawKeys
    .filter((key) => siteIdShortFromKeyDescription(key.description) !== null)
    .map((key) => {
      const siteIdShort = siteIdShortFromKeyDescription(key.description);
      const siteMeta = siteIdShort ? byShort.get(siteIdShort) : undefined;
      const isActive = activeKeyIds.has(key.id);
      return {
        id: key.id,
        description: key.description ?? null,
        collections: key.collections ?? [],
        site_id_short: siteIdShort,
        site_uid: siteMeta?.site_uid ?? null,
        site_url: siteMeta?.site_url ?? null,
        is_active: isActive,
        is_stale: !isActive && siteMeta !== undefined,
      };
    })
    .sort((a, b) => {
      if (a.is_stale !== b.is_stale) {
        return a.is_stale ? 1 : -1;
      }
      if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
      }
      return a.id - b.id;
    });

  return {
    collections: rows,
    keys: keyRows,
    total_collections: rows.length,
    total_documents: totalDocuments,
    orphan_count: orphanCount,
    matched_count: matchedCount,
  };
}
