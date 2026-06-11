import { build } from 'esbuild';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const functionsDir = path.join(rootDir, 'netlify/functions');
const outdir = path.join(rootDir, 'dist-cafe24/functions');
const safeCafe24Functions = new Set([
  'fetch-og-image.ts',
  'tango-scene-map.ts',
]);

const functionFiles = (await readdir(functionsDir))
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => safeCafe24Functions.has(file))
  .sort();

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: functionFiles.map((file) => path.join(functionsDir, file)),
  outdir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  legalComments: 'none',
  outExtension: { '.js': '.mjs' },
  external: [
    '@netlify/functions',
    '@supabase/supabase-js',
    'sharp',
  ],
  logLevel: 'info',
});

console.log(`[cafe24] Built ${functionFiles.length} Netlify-compatible functions into ${path.relative(rootDir, outdir)}`);
