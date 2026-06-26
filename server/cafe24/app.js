import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createCafe24FunctionHandler } from './cafe24-function-adapter.js';
import { elapsedMs, nowMs, perfLog, perfShouldLog, summarizeApiRequest } from './perf-log.js';
import {
  createCafe24Event,
  deleteCafe24Event,
  getCafe24Event,
  listCafe24Events,
  updateCafe24Event,
} from './events-api.js';
import { authProviders, devLogin, googleLoginCallback, googleLoginStart, kakaoLogin, logout, me } from './auth-api.js';
import {
  listClientReloadDiagnostics,
  listServerVersionDiagnostics,
  recordClientReloadDiagnostic,
} from './diagnostics-api.js';
import { uploadEventImage } from './uploads-api.js';
import { eventStats, recordAnalytics, siteStats } from './stats-api.js';
import {
  cafe24IngestorV3Candidates,
  cafe24IngestorV3RegisterBlocked,
  cafe24IngestorV3ReviewCandidate,
} from './ingestor-v3-api.js';
import {
  callRpc,
  deleteRecords,
  insertRecords,
  listGenericFiles,
  queryRecords,
  removeGenericFiles,
  updateRecords,
  uploadGenericFile,
  upsertRecords,
} from './generic-data-api.js';
import {
  cafe24BillboardManifest,
  cafe24DeleteEventFunction,
  cafe24DeleteInvitation,
  cafe24DeleteSocialItem,
  cafe24IngestorRegisterEvent,
  cafe24Invitations,
  cafe24OneDayRecruitLogo,
  cafe24ScrapedEvents,
  cafe24UnavailableFunction,
  cafe24ValidateInvitation,
} from './function-api.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const app = express();
const distDir = path.resolve(process.cwd(), process.env.CAFE24_DIST_DIR || 'dist');
const uploadsDir = path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
const uploadsFallbackOrigin = String(process.env.CAFE24_UPLOADS_FALLBACK_ORIGIN || '').replace(/\/+$/g, '');
const rawBody = express.raw({
  type: '*/*',
  limit: process.env.CAFE24_BODY_LIMIT || '50mb',
});

function isSwingFloorCouncilRoute(reqPath = '') {
  return reqPath === '/swing-floor-council' || reqPath === '/swing-floor-council/';
}

function stripSocialPreviewMetadata(html = '') {
  return html
    .replace(/<meta\s+[^>]*(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+[^>]*name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+[^>]*name=["']apple-mobile-web-app-title["'][^>]*>\s*/gi, '')
    .replace(/<link\s+[^>]*rel=["']manifest["'][^>]*>\s*/gi, '')
    .replace(/<title>[\s\S]*?<\/title>/i, '<title></title>')
    .replace(
      '</head>',
      '<meta name="robots" content="noindex,nofollow,noarchive,noimageindex" />\n</head>',
    );
}
const urlencodedBody = express.urlencoded({
  extended: false,
  limit: process.env.CAFE24_SHARE_TARGET_BODY_LIMIT || '128kb',
});
const jsonBody = express.json({
  limit: process.env.CAFE24_BODY_LIMIT || '50mb',
});
const cafe24FunctionHandler = createCafe24FunctionHandler();

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-DNS-Prefetch-Control', 'on');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://xn--9m1bu8iv0ao6ao5fsta.com");
  next();
});

app.use((req, res, next) => {
  if (!String(req.path || '').startsWith('/api/')) {
    next();
    return;
  }

  const startedAt = nowMs();
  res.on('finish', () => {
    const pathName = req.path || req.originalUrl || '';
    const ms = elapsedMs(startedAt);
    const always =
      pathName === '/api/auth/me' ||
      pathName === '/api/analytics/session' ||
      pathName.startsWith('/api/auth/google/') ||
      pathName.startsWith('/api/cafe24-rpc/get_user_interactions') ||
      pathName.startsWith('/api/cafe24-rpc/increment_item_views') ||
      pathName.startsWith('/api/cafe24-data/board_');

    if (!perfShouldLog(ms, always)) return;

    perfLog('http', {
      method: req.method,
      path: pathName,
      status: res.statusCode,
      ms,
      ...summarizeApiRequest(req),
    }, ms >= 1000 || res.statusCode >= 500 ? 'warn' : 'log');
  });
  next();
});

app.get('/__health', (_req, res) => {
  res.json({
    ok: true,
    dist: existsSync(path.join(distDir, 'index.html')),
    uploads: uploadsDir,
    uploadsFallbackOrigin: uploadsFallbackOrigin || null,
    functions: process.env.CAFE24_FUNCTIONS_DIR || 'dist-cafe24/functions',
  });
});

async function proxyMissingUpload(req, res, next) {
  if (!uploadsFallbackOrigin) {
    next();
    return;
  }

  try {
    const uploadPath = req.originalUrl.startsWith('/uploads/')
      ? req.originalUrl
      : `/uploads${req.url}`;
    const remoteUrl = new URL(uploadPath, uploadsFallbackOrigin);
    const response = await fetch(remoteUrl, {
      headers: {
        Accept: req.get('accept') || 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'SwingEnjoyLocalProdDb/1.0',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.toLowerCase().includes('text/html')) {
      next();
      return;
    }

    const contentLength = response.headers.get('content-length');
    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Uploads-Fallback-Origin', uploadsFallbackOrigin);
    const body = Buffer.from(await response.arrayBuffer());
    res.status(response.status).send(body);
  } catch (error) {
    console.warn('[cafe24:uploads-fallback]', error?.message || error);
    next();
  }
}

function alias(functionName) {
  return (req, _res, next) => {
    req.cafe24FunctionName = functionName;
    next();
  };
}

function jsonRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode >= 500) {
        console.error('[cafe24:api]', error);
      } else {
        console.warn('[cafe24:api]', statusCode, error?.message || 'Request rejected');
      }
      res.status(statusCode).json({
        error: 'Cafe24 API Error',
        message: error?.message || 'Unknown Cafe24 API error',
      });
    }
  };
}

app.get('/api/events', jsonRoute(listCafe24Events));
app.get('/api/events/:id', jsonRoute(getCafe24Event));
app.post('/api/events', jsonBody, jsonRoute(createCafe24Event));
app.post('/api/events/:id', jsonBody, jsonRoute(updateCafe24Event));
app.post('/api/events/:id/delete', jsonBody, jsonRoute(deleteCafe24Event));
app.put('/api/events/:id', jsonBody, jsonRoute(updateCafe24Event));
app.patch('/api/events/:id', jsonBody, jsonRoute(updateCafe24Event));
app.delete('/api/events/:id', jsonRoute(deleteCafe24Event));

app.get('/api/auth/me', jsonRoute(me));
app.get('/api/auth/providers', jsonRoute(authProviders));
app.post('/api/auth/dev-login', jsonBody, jsonRoute(devLogin));
app.post('/api/auth/logout', jsonRoute(logout));
app.post('/api/kakao-login', jsonBody, jsonRoute(kakaoLogin));
app.post('/api/auth/kakao', jsonBody, jsonRoute(kakaoLogin));
app.get('/api/auth/google/start', jsonRoute(googleLoginStart));
app.get('/api/auth/google/callback', jsonRoute(googleLoginCallback));

app.post('/api/uploads/events', jsonBody, jsonRoute(uploadEventImage));

app.post('/api/cafe24-data/:table/query', jsonBody, jsonRoute(queryRecords));
app.post('/api/cafe24-data/:table/insert', jsonBody, jsonRoute(insertRecords));
app.post('/api/cafe24-data/:table/update', jsonBody, jsonRoute(updateRecords));
app.post('/api/cafe24-data/:table/upsert', jsonBody, jsonRoute(upsertRecords));
app.post('/api/cafe24-data/:table/delete', jsonBody, jsonRoute(deleteRecords));
app.post('/api/cafe24-rpc/:name', jsonBody, jsonRoute(callRpc));
app.post('/api/cafe24-storage/:bucket/upload', jsonBody, jsonRoute(uploadGenericFile));
app.get('/api/cafe24-storage/:bucket/list', jsonRoute(listGenericFiles));
app.delete('/api/cafe24-storage/:bucket/remove', jsonBody, jsonRoute(removeGenericFiles));
app.post('/api/cafe24-storage/:bucket/remove', jsonBody, jsonRoute(removeGenericFiles));

app.get('/api/stats/events', jsonRoute(eventStats));
app.get('/api/stats/site', jsonRoute(siteStats));
app.post('/api/analytics/session', jsonBody, jsonRoute(recordAnalytics));
app.post('/api/diagnostics/reload', jsonBody, jsonRoute(recordClientReloadDiagnostic));
app.get('/api/diagnostics/reloads', jsonRoute(listClientReloadDiagnostics));
app.get('/api/diagnostics/server-versions', jsonRoute(listServerVersionDiagnostics));

app.all('/api/scraped-events', jsonBody, jsonRoute(cafe24ScrapedEvents));
app.post('/api/ingestor-register-event', jsonBody, jsonRoute(cafe24IngestorRegisterEvent));
app.all('/api/ingestor-v3/candidates', jsonBody, jsonRoute(cafe24IngestorV3Candidates));
app.post('/api/ingestor-v3/candidates/:id/review', jsonBody, jsonRoute(cafe24IngestorV3ReviewCandidate));
app.patch('/api/ingestor-v3/candidates/:id/review', jsonBody, jsonRoute(cafe24IngestorV3ReviewCandidate));
app.post('/api/ingestor-v3/candidates/:id/register', jsonBody, jsonRoute(cafe24IngestorV3RegisterBlocked));
app.post('/api/delete-event', jsonBody, jsonRoute(cafe24DeleteEventFunction));
app.post('/api/delete-social-item', jsonBody, jsonRoute(cafe24DeleteSocialItem));
app.post('/api/oneday-recruit-logo', jsonBody, jsonRoute(cafe24OneDayRecruitLogo));
app.all('/api/fetch-og-image', rawBody, alias('fetch-og-image'), cafe24FunctionHandler);
app.all('/api/tango-scene-map', rawBody, alias('tango-scene-map'), cafe24FunctionHandler);
app.delete('/api/invitations/delete', jsonBody, jsonRoute(cafe24DeleteInvitation));
app.post('/api/invitations/delete', jsonBody, jsonRoute(cafe24DeleteInvitation));

app.all('/api/invitations', jsonBody, jsonRoute(cafe24Invitations));
app.post('/api/invitations/validate', jsonBody, jsonRoute(cafe24ValidateInvitation));
app.delete('/api/invitations/:id', jsonBody, jsonRoute(cafe24DeleteInvitation));
app.get('/api/billboard-manifest', jsonRoute(cafe24BillboardManifest));

function compactShareTargetText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimShareTargetText(value) {
  return String(value || '').trim();
}

function extractShareTargetUrl(value) {
  const match = compactShareTargetText(value).match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.?!\]]+$/, '') : '';
}

function stripShareTargetUrl(value, url) {
  let text = compactShareTargetText(value);
  if (url) text = text.replace(url, ' ');
  return compactShareTargetText(text.replace(/https?:\/\/[^\s"'<>]+/gi, ' '));
}

function buildShareTargetDraft(body = {}) {
  const url = compactShareTargetText(body.url || body.add || body.link)
    || extractShareTargetUrl(body.text)
    || extractShareTargetUrl(body.title);
  const title = compactShareTargetText(body.title);
  const description = trimShareTargetText(stripShareTargetUrl(body.text, url));

  return {
    form: {
      url,
      title,
      description,
      authorName: '',
      thumbnailUrl: '',
      archiveBucket: 'reference',
      collectionName: '',
      tags: '',
      danceGenre: '',
      sourceContext: 'Android 공유',
      publishedAt: '',
    },
    savedAt: Date.now(),
    source: 'android-share',
  };
}

function sendShareTargetBootstrap(req, res) {
  const draft = buildShareTargetDraft(req.body || {});
  const draftJson = JSON.stringify(draft).replace(/</g, '\\u003c');
  res
    .status(200)
    .type('html')
    .send(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>공유 저장 중</title>
</head>
<body>
  <script>
    (function () {
      try {
        var draft = ${draftJson};
        if (draft && draft.form && (draft.form.url || draft.form.title || draft.form.description)) {
          localStorage.setItem('swingenjoy:media-archive-pending-draft', JSON.stringify(draft));
        }
      } catch (error) {}
      location.replace('/forum/media');
    }());
  </script>
</body>
</html>`);
}

app.post('/forum/media/share', urlencodedBody, sendShareTargetBootstrap);

app.use('/uploads', express.static(uploadsDir, {
  etag: true,
  maxAge: '30d',
}));
app.use('/uploads', proxyMissingUpload);
app.use('/uploads', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).type('text/plain').send('Upload not found');
});

app.all(/^\/api\/([^/?#]+)(?:\/.*)?$/, rawBody, async (req, res, next) => {
  try {
    req.params.name = req.params[0];
    await cafe24UnavailableFunction(req, res);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(distDir, {
  index: false,
  etag: true,
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }

    if (filePath.endsWith('service-worker.js') || filePath.endsWith('version.json')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }

    if (filePath.endsWith('manifest.json')) {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=300');
    }
  },
}));

app.use((req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    next();
    return;
  }

  const acceptsHtml = req.accepts(['html', 'json']) === 'html';
  const isPwaShareTarget = req.path === '/forum/media/share';
  if (!acceptsHtml && !isPwaShareTarget) {
    next();
    return;
  }

  const indexFile = path.join(distDir, 'index.html');
  if (!existsSync(indexFile)) {
    res.status(500).send('Cafe24 dist/index.html not found. Run npm run build:cafe24 first.');
    return;
  }

  if (isSwingFloorCouncilRoute(req.path)) {
    const html = readFileSync(indexFile, 'utf8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(stripSocialPreviewMetadata(html));
    return;
  }

  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(indexFile);
});

export default app;
