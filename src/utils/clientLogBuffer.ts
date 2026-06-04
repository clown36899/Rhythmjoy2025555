type ClientLogLevel = 'log' | 'info' | 'debug' | 'warn' | 'error' | 'event';

export interface ClientLogEntry {
  id: number;
  timestamp: string;
  level: ClientLogLevel;
  route: string;
  message: string;
}

const STORAGE_KEY = 'rhythmjoy_client_logs_v1';
const MAX_LOGS = 120;
const MAX_ARG_LENGTH = 1200;
const MAX_STRING_LENGTH = 360;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_DEPTH = 3;
const SENSITIVE_PARAM_RE = /([?&#](?:code|access_token|refresh_token|id_token|token|token_hash|provider_token|provider_refresh_token|email|user_id|userId)=)[^&#\s]+/gi;
const SENSITIVE_JSON_RE = /("(?:code|access_token|refresh_token|id_token|token|token_hash|provider_token|provider_refresh_token|email|userEmail|user_id|userId|authUid|authorization|apikey|service_key|secret|password|phone|contact|organizer_phone)"\s*:\s*")[^"]+/gi;
const SENSITIVE_KEY_RE = /^(?:code|access_token|refresh_token|id_token|token|token_hash|provider_token|provider_refresh_token|email|userEmail|user_id|userId|authUid|authorization|apikey|service_key|secret|password|phone|contact|organizer_phone)$/i;
const VERBOSE_TEXT_KEY_RE = /^(?:description|extracted_text|content|body|html|stack)$/i;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /\b(?:\+?82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g;
const PROD_VERBOSE_ALLOW_RE = /\[(?:Kakao Callback|Auth|Supabase|Stats#|SW|CalendarPage)\]|Safety Net|SIGNED_|TOKEN_REFRESHED|INITIAL_SESSION|사용자 조작 감지|setSession/i;

let logs: ClientLogEntry[] = [];
let nextId = 1;
let flushTimer: number | null = null;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadStoredLogs(): ClientLogEntry[] {
  if (!canUseStorage()) return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.slice(-MAX_LOGS) : [];
  } catch {
    return [];
  }
}

function flushLogs() {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
  } catch {
    // Ignore storage quota/private mode failures. The in-memory buffer still works.
  }
}

function scheduleFlush(immediate = false) {
  if (immediate) {
    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushLogs();
    return;
  }

  if (flushTimer !== null || typeof window === 'undefined') return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushLogs();
  }, 600);
}

function summarizeString(value: string, key = '') {
  const sanitized = sanitizeLogText(value);
  if (VERBOSE_TEXT_KEY_RE.test(key) && sanitized.length > 160) {
    return `[TEXT ${sanitized.length} chars]`;
  }
  if (sanitized.length > MAX_STRING_LENGTH) {
    return `${sanitized.slice(0, MAX_STRING_LENGTH)}...[truncated ${sanitized.length - MAX_STRING_LENGTH} chars]`;
  }
  return sanitized;
}

function redactForLog(value: unknown, key = '', depth = 0): unknown {
  if (SENSITIVE_KEY_RE.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return summarizeString(value, key);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: summarizeString(value.message),
      stack: summarizeString(value.stack || '', 'stack'),
    };
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactForLog(item, key, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    return items;
  }
  if (typeof value === 'object') {
    if (depth >= MAX_OBJECT_DEPTH) return '[Object]';
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    Object.keys(record).slice(0, 24).forEach((itemKey) => {
      next[itemKey] = redactForLog(record[itemKey], itemKey, depth + 1);
    });
    const extra = Object.keys(record).length - Object.keys(next).length;
    if (extra > 0) next.__truncatedKeys = extra;
    return next;
  }
  return value;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return summarizeString(value);
  if (value instanceof Error) return sanitizeLogText(summarizeString(value.stack || value.message, 'stack'));
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  try {
    const seen = new WeakSet<object>();
    return sanitizeLogText(JSON.stringify(redactForLog(value), (_key, item) => {
      if (typeof item === 'object' && item !== null) {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    }));
  } catch {
    try {
      return sanitizeLogText(String(value));
    } catch {
      return '[Unserializable]';
    }
  }
}

function sanitizeLogText(value: string) {
  return value
    .replace(SENSITIVE_PARAM_RE, '$1[REDACTED]')
    .replace(SENSITIVE_JSON_RE, '$1[REDACTED]')
    .replace(JWT_RE, '[JWT_REDACTED]')
    .replace(EMAIL_RE, '[EMAIL_REDACTED]')
    .replace(PHONE_RE, '[PHONE_REDACTED]');
}

function sanitizeUrl(value: string) {
  return sanitizeLogText(value);
}

function serializeArgs(args: unknown[]) {
  return args
    .map((arg) => safeStringify(arg))
    .join(' ')
    .slice(0, MAX_ARG_LENGTH);
}

function shouldCaptureVerboseProdLog(args: unknown[]) {
  return PROD_VERBOSE_ALLOW_RE.test(serializeArgs(args));
}

export function addClientLog(level: ClientLogLevel, ...args: unknown[]) {
  if (typeof window === 'undefined') return;

  const entry: ClientLogEntry = {
    id: nextId++,
    timestamp: new Date().toISOString(),
    level,
    route: sanitizeUrl(`${window.location.pathname}${window.location.search}`),
    message: serializeArgs(args),
  };

  logs = [...logs, entry].slice(-MAX_LOGS);
  scheduleFlush(level === 'warn' || level === 'error' || level === 'event');
}

export function getClientLogs() {
  if (logs.length === 0) {
    logs = loadStoredLogs();
    nextId = logs.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
  }
  return logs.slice();
}

export function getClientLogText() {
  if (typeof window === 'undefined') return '';

  const header = [
    `Generated: ${new Date().toISOString()}`,
    `URL: ${sanitizeUrl(window.location.href)}`,
    `UA: ${window.navigator.userAgent}`,
    `Viewport: ${window.innerWidth}x${window.innerHeight} DPR:${window.devicePixelRatio || 1}`,
    `Online: ${window.navigator.onLine}`,
    '',
    'Logs:',
  ];

  const body = getClientLogs().map((log) => {
    return `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.route} ${log.message}`;
  });

  return [...header, ...body].join('\n');
}

export function clearClientLogs() {
  logs = [];
  if (canUseStorage()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // no-op
    }
  }
}

export function initClientLogBuffer(options: { suppressConsoleInProd?: boolean } = {}) {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__RHYTHMJOY_LOG_BUFFER_READY__) return;
  w.__RHYTHMJOY_LOG_BUFFER_READY__ = true;

  logs = loadStoredLogs();
  nextId = logs.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;

  const suppressConsoleInProd = options.suppressConsoleInProd ?? false;
  const rawConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  (['log', 'info', 'debug', 'warn', 'error'] as const).forEach((level) => {
    console[level] = (...args: unknown[]) => {
      const isVerbose = level === 'log' || level === 'info' || level === 'debug';
      const shouldCapture = !suppressConsoleInProd || !isVerbose || shouldCaptureVerboseProdLog(args);
      if (shouldCapture) addClientLog(level, ...args);

      const shouldSuppress =
        suppressConsoleInProd && (level === 'log' || level === 'info' || level === 'debug');

      if (!shouldSuppress) {
        rawConsole[level](...args);
      }
    };
  });

  window.addEventListener('error', (event) => {
    addClientLog('error', 'window.error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    addClientLog('error', 'unhandledrejection', reason?.stack || reason?.message || reason);
  });

  window.addEventListener('offline', () => addClientLog('event', 'network offline'));
  window.addEventListener('online', () => addClientLog('event', 'network online'));

  w.__RHYTHMJOY_GET_LOG_TEXT__ = getClientLogText;
  w.__RHYTHMJOY_ADD_LOG__ = addClientLog;
}
