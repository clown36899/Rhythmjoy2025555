import type { Event as AppEvent } from './cafe24Client';

export const isCafe24EventsBackendEnabled =
  import.meta.env.VITE_CAFE24_EVENTS_BACKEND !== 'disabled';

const PRODUCTION_EVENTS_PROXY_PREFIX = '/prod-api';

type FetchCafe24EventsOptions = {
  start?: string;
  end?: string;
  cutoff?: string;
  scope?: string;
  q?: string;
  limit?: number;
};

function isLocalDevEventsRead(url: string) {
  return Boolean(
    import.meta.env.DEV
    && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && url.startsWith('/api/events')
  );
}

async function fetchJsonFrom<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cafe24 events API failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

async function fetchJson<T>(url: string): Promise<T> {
  try {
    return await fetchJsonFrom<T>(url);
  } catch (error) {
    if (isLocalDevEventsRead(url)) {
      return fetchJsonFrom<T>(`${PRODUCTION_EVENTS_PROXY_PREFIX}${url}`);
    }
    throw error;
  }
}

export async function fetchCafe24Events(options: FetchCafe24EventsOptions = {}) {
  const params = new URLSearchParams();
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);
  if (options.cutoff) params.set('cutoff', options.cutoff);
  if (options.scope) params.set('scope', options.scope);
  if (options.q) params.set('q', options.q);
  if (options.limit) params.set('limit', String(options.limit));

  const suffix = params.toString();
  const payload = await fetchJson<{ events: AppEvent[] }>(`/api/events${suffix ? `?${suffix}` : ''}`);
  return payload.events || [];
}

export async function fetchCafe24EventById(id: string | number) {
  const payload = await fetchJson<{ event: AppEvent | null }>(`/api/events/${encodeURIComponent(String(id))}`);
  return payload.event;
}

export async function updateCafe24EventById(id: string | number, updates: Partial<AppEvent>) {
  const response = await fetch(`/api/events/${encodeURIComponent(String(id))}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({ ...updates, _method: 'PUT' }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Cafe24 event update failed (${response.status})`);
  }

  const payload = await response.json() as { event: AppEvent | null };
  return payload.event;
}
