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
