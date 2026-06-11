type Filter = {
  field: string;
  op: string;
  value: unknown;
};

type Order = {
  column: string;
  ascending?: boolean;
  nullsFirst?: boolean;
};

type QueryState = {
  table: string;
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  select?: string;
  values?: unknown;
  filters: Filter[];
  orFilters: string[];
  orders: Order[];
  limit?: number;
  range?: { from: number; to: number };
  single?: boolean;
  maybeSingle?: boolean;
  head?: boolean;
  count?: string | null;
  options?: Record<string, unknown>;
};

async function readResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      data: null,
      error: {
        message: payload?.message || payload?.error || `Cafe24 API failed (${response.status})`,
        status: response.status,
      },
      count: null,
      status: response.status,
      statusText: response.statusText,
    };
  }
  return payload;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body || {}),
  });
  return readResponse(response);
}

function toBase64(input: Blob | ArrayBuffer | string) {
  if (typeof input === 'string') return Promise.resolve(input);
  if (input instanceof ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(input);
    for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
    return Promise.resolve(btoa(binary));
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(input);
  });
}

class Cafe24QueryBuilder {
  private state: QueryState;

  constructor(table: string) {
    this.state = {
      table,
      action: 'select',
      filters: [],
      orFilters: [],
      orders: [],
    };
  }

  select(columns = '*', options: { count?: string; head?: boolean } = {}) {
    this.state.select = columns;
    this.state.count = options.count || null;
    this.state.head = Boolean(options.head);
    return this;
  }

  insert(values: unknown, options: Record<string, unknown> = {}) {
    this.state.action = 'insert';
    this.state.values = values;
    this.state.options = options;
    return this;
  }

  update(values: unknown) {
    this.state.action = 'update';
    this.state.values = values;
    return this;
  }

  upsert(values: unknown, options: Record<string, unknown> = {}) {
    this.state.action = 'upsert';
    this.state.values = values;
    this.state.options = options;
    return this;
  }

  delete() {
    this.state.action = 'delete';
    return this;
  }

  eq(field: string, value: unknown) {
    this.state.filters.push({ field, op: 'eq', value });
    return this;
  }

  neq(field: string, value: unknown) {
    this.state.filters.push({ field, op: 'neq', value });
    return this;
  }

  gt(field: string, value: unknown) {
    this.state.filters.push({ field, op: 'gt', value });
    return this;
  }

  gte(field: string, value: unknown) {
    this.state.filters.push({ field, op: 'gte', value });
    return this;
  }

  lt(field: string, value: unknown) {
    this.state.filters.push({ field, op: 'lt', value });
    return this;
  }

  lte(field: string, value: unknown) {
    this.state.filters.push({ field, op: 'lte', value });
    return this;
  }

  like(field: string, value: unknown) {
    this.state.filters.push({ field, op: 'like', value });
    return this;
  }

  ilike(field: string, value: unknown) {
    this.state.filters.push({ field, op: 'ilike', value });
    return this;
  }

  is(field: string, value: unknown) {
    this.state.filters.push({ field, op: 'is', value });
    return this;
  }

  not(field: string, op: string, value: unknown) {
    this.state.filters.push({ field, op: op === 'is' ? 'not.is' : `not.${op}`, value });
    return this;
  }

  in(field: string, value: unknown[]) {
    this.state.filters.push({ field, op: 'in', value: `(${value.join(',')})` });
    return this;
  }

  contains(field: string, value: unknown) {
    this.state.filters.push({ field, op: 'contains', value });
    return this;
  }

  filter(field: string, op: string, value: unknown) {
    this.state.filters.push({ field, op, value });
    return this;
  }

  match(values: Record<string, unknown>) {
    Object.entries(values || {}).forEach(([field, value]) => this.eq(field, value));
    return this;
  }

  or(filter: string) {
    this.state.orFilters.push(filter);
    return this;
  }

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.state.orders.push({ column, ...options });
    return this;
  }

  limit(limit: number) {
    this.state.limit = limit;
    return this;
  }

  range(from: number, to: number) {
    this.state.range = { from, to };
    return this;
  }

  single() {
    this.state.single = true;
    return this;
  }

  maybeSingle() {
    this.state.maybeSingle = true;
    return this;
  }

  throwOnError() {
    return this;
  }

  async execute() {
    const action = this.state.action;
    const table = encodeURIComponent(this.state.table);
    const endpoint = action === 'select' ? 'query' : action;
    return postJson(`/api/cafe24-data/${table}/${endpoint}`, this.state);
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null) {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null) {
    return this.execute().finally(onfinally || undefined);
  }
}

function createStorageBucket(bucket: string) {
  return {
    async upload(filePath: string, file: Blob | ArrayBuffer | string, options: { contentType?: string; upsert?: boolean } = {}) {
      const dataBase64 = await toBase64(file);
      return postJson(`/api/cafe24-storage/${encodeURIComponent(bucket)}/upload`, {
        filePath,
        dataBase64,
        mimeType: options.contentType || (file instanceof Blob ? file.type : null),
        upsert: options.upsert,
      });
    },
    async list(prefix = '') {
      const params = new URLSearchParams();
      if (prefix) params.set('prefix', prefix);
      const response = await fetch(`/api/cafe24-storage/${encodeURIComponent(bucket)}/list?${params}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      return readResponse(response);
    },
    async remove(paths: string[]) {
      const response = await fetch(`/api/cafe24-storage/${encodeURIComponent(bucket)}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ paths, _method: 'DELETE' }),
      });
      return readResponse(response);
    },
    getPublicUrl(filePath: string) {
      return {
        data: {
          publicUrl: `/uploads/${bucket}/${String(filePath).replace(/^\/+/, '')}`,
        },
      };
    },
    async download(filePath: string) {
      const response = await fetch(`/uploads/${bucket}/${String(filePath).replace(/^\/+/, '')}`, {
        credentials: 'same-origin',
      });
      return { data: await response.blob(), error: response.ok ? null : { message: response.statusText } };
    },
  };
}

function createNoopChannel() {
  return {
    on() {
      return this;
    },
    subscribe(callback?: (status: string) => void) {
      window.setTimeout(() => callback?.('SUBSCRIBED'), 0);
      return this;
    },
    unsubscribe() {
      return Promise.resolve('ok');
    },
    track() {
      return Promise.resolve('ok');
    },
    untrack() {
      return Promise.resolve('ok');
    },
  };
}

async function readCafe24Me() {
  const response = await fetch('/api/auth/me', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  return payload;
}

export function createCafe24SupabaseCompat() {
  return {
    from(table: string) {
      return new Cafe24QueryBuilder(table);
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      return postJson(`/api/cafe24-rpc/${encodeURIComponent(name)}`, { args });
    },
    storage: {
      from(bucket: string) {
        return createStorageBucket(bucket);
      },
      getBucket() {
        return Promise.resolve({ data: {}, error: null });
      },
      createBucket() {
        return Promise.resolve({ data: {}, error: null });
      },
    },
    auth: {
      async getSession() {
        const payload = await readCafe24Me();
        const user = payload.user || null;
        return {
          data: {
            session: user ? {
              access_token: 'cafe24-session',
              refresh_token: '',
              user,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            } : null,
          },
          error: null,
        };
      },
      async getUser() {
        const payload = await readCafe24Me();
        return { data: { user: payload.user || null }, error: null };
      },
      async setSession() {
        return this.getSession();
      },
      async refreshSession() {
        return this.getSession();
      },
      async signOut() {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        return { error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() { } } } };
      },
      async signInWithOAuth() {
        return { data: null, error: { message: 'Cafe24 OAuth is handled by /api/kakao-login.' } };
      },
    },
    channel() {
      return createNoopChannel();
    },
    removeChannel(channel: { unsubscribe?: () => unknown }) {
      channel?.unsubscribe?.();
      return 'ok';
    },
  };
}
