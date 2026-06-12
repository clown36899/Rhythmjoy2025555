import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createCafe24FunctionHandler } from './cafe24-function-adapter.js';
import {
  createCafe24Event,
  deleteCafe24Event,
  getCafe24Event,
  listCafe24Events,
  updateCafe24Event,
} from './events-api.js';
import { authProviders, googleLoginCallback, googleLoginStart, kakaoLogin, logout, me } from './auth-api.js';
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
const rawBody = express.raw({
  type: '*/*',
  limit: process.env.CAFE24_BODY_LIMIT || '50mb',
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

app.get('/__health', (_req, res) => {
  res.json({
    ok: true,
    dist: existsSync(path.join(distDir, 'index.html')),
    uploads: uploadsDir,
    functions: process.env.CAFE24_FUNCTIONS_DIR || 'dist-cafe24/functions',
  });
});

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

app.use('/uploads', express.static(uploadsDir, {
  etag: true,
  maxAge: '30d',
}));

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
  if (!acceptsHtml) {
    next();
    return;
  }

  const indexFile = path.join(distDir, 'index.html');
  if (!existsSync(indexFile)) {
    res.status(500).send('Cafe24 dist/index.html not found. Run npm run build:cafe24 first.');
    return;
  }

  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(indexFile);
});

export default app;
