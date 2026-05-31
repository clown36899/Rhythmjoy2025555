type ClientLogLevel = 'log' | 'info' | 'debug' | 'warn' | 'error' | 'event';

export interface ClientLogEntry {
  id: number;
  timestamp: string;
  level: ClientLogLevel;
  route: string;
  message: string;
}

const STORAGE_KEY = 'rhythmjoy_client_logs_v1';
const MAX_LOGS = 160;
const MAX_ARG_LENGTH = 2400;

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

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === 'object' && item !== null) {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    });
  } catch {
    try {
      return String(value);
    } catch {
      return '[Unserializable]';
    }
  }
}

function serializeArgs(args: unknown[]) {
  return args
    .map((arg) => safeStringify(arg))
    .join(' ')
    .slice(0, MAX_ARG_LENGTH);
}

export function addClientLog(level: ClientLogLevel, ...args: unknown[]) {
  if (typeof window === 'undefined') return;

  const entry: ClientLogEntry = {
    id: nextId++,
    timestamp: new Date().toISOString(),
    level,
    route: `${window.location.pathname}${window.location.search}`,
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
    `URL: ${window.location.href}`,
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
      addClientLog(level, ...args);

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
