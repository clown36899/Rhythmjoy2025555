import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const functionCache = new Map();

const functionAliases = new Map([
  ['auth/kakao', 'kakao-login'],
  ['billboard-manifest', 'billboard-manifest'],
  ['invitations/validate', 'invitations-validate'],
]);

function getFunctionsDir() {
  return path.resolve(process.cwd(), process.env.CAFE24_FUNCTIONS_DIR || 'dist-cafe24/functions');
}

function sanitizeFunctionName(rawName) {
  const value = String(rawName || '').trim().replace(/^\//, '').replace(/\.m?js$/, '');
  const alias = functionAliases.get(value) || value;
  const firstSegment = alias.split('/')[0];
  if (!/^[a-z0-9-]+$/i.test(firstSegment)) return '';
  return firstSegment;
}

function requestUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return new URL(req.originalUrl || req.url || '/', `${protocol}://${host}`);
}

function collectQuery(url) {
  const single = {};
  const multi = {};

  for (const [key, value] of url.searchParams.entries()) {
    single[key] = value;
    if (!multi[key]) multi[key] = [];
    multi[key].push(value);
  }

  return { single, multi };
}

function collectHeaders(req) {
  const headers = {};
  const multiValueHeaders = {};

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      headers[key] = value.join(',');
      multiValueHeaders[key] = value.map(String);
    } else if (value !== undefined) {
      headers[key] = String(value);
      multiValueHeaders[key] = [String(value)];
    }
  }

  return { headers, multiValueHeaders };
}

function collectBody(req) {
  if (req.body === undefined || req.body === null) return null;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  return JSON.stringify(req.body);
}

function createEvent(req) {
  const url = requestUrl(req);
  const { single, multi } = collectQuery(url);
  const { headers, multiValueHeaders } = collectHeaders(req);

  return {
    rawUrl: url.toString(),
    rawQuery: url.search ? url.search.slice(1) : '',
    path: url.pathname,
    httpMethod: req.method,
    headers,
    multiValueHeaders,
    queryStringParameters: Object.keys(single).length ? single : null,
    multiValueQueryStringParameters: Object.keys(multi).length ? multi : null,
    body: collectBody(req),
    isBase64Encoded: false,
  };
}

async function importFunction(functionName) {
  const cleanName = sanitizeFunctionName(functionName);
  if (!cleanName) {
    const error = new Error(`Invalid function name: ${functionName}`);
    error.statusCode = 400;
    throw error;
  }

  if (functionCache.has(cleanName)) return functionCache.get(cleanName);

  const functionFile = path.join(getFunctionsDir(), `${cleanName}.mjs`);
  if (!existsSync(functionFile)) {
    const error = new Error(`Cafe24 function bundle not found: ${cleanName}`);
    error.statusCode = 404;
    throw error;
  }

  const moduleUrl = pathToFileURL(functionFile).href;
  const mod = await import(moduleUrl);
  functionCache.set(cleanName, mod);
  return mod;
}

function applyHeaders(res, result) {
  for (const [key, value] of Object.entries(result.multiValueHeaders || {})) {
    if (Array.isArray(value)) res.setHeader(key, value.map(String));
  }

  for (const [key, value] of Object.entries(result.headers || {})) {
    if (value !== undefined) res.setHeader(key, String(value));
  }
}

function sendResult(res, result) {
  const statusCode = Number(result?.statusCode || 200);
  res.status(statusCode);
  applyHeaders(res, result || {});

  if (!result || result.body === undefined || result.body === null) {
    res.end();
    return;
  }

  if (result.isBase64Encoded) {
    res.end(Buffer.from(String(result.body), 'base64'));
    return;
  }

  res.send(result.body);
}

export function createNetlifyFunctionHandler() {
  return async (req, res) => {
    const rawName = req.cafe24FunctionName || req.params?.functionName || req.params?.[0];

    try {
      const mod = await importFunction(rawName);
      const handler = mod.handler;
      if (typeof handler !== 'function') {
        const error = new Error(`Cafe24 function does not export handler: ${rawName}`);
        error.statusCode = 500;
        throw error;
      }

      const result = await handler(createEvent(req), {
        callbackWaitsForEmptyEventLoop: false,
      });
      sendResult(res, result);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      console.error('[cafe24:function]', error);
      res.status(statusCode).json({
        error: statusCode === 404 ? 'Function Not Found' : 'Function Error',
        message: error?.message || 'Unknown function error',
      });
    }
  };
}

export async function invokeFetchStyleFunction(functionName, request) {
  const mod = await importFunction(functionName);
  if (typeof mod.default !== 'function') {
    throw new Error(`Cafe24 function does not export default fetch handler: ${functionName}`);
  }
  return mod.default(request);
}
