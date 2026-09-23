import { build } from 'esbuild';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const functionsDir = path.join(rootDir, 'server/cafe24/functions');
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
  external: [],
  logLevel: 'info',
});

console.log(`[cafe24] Built ${functionFiles.length} function bundles into ${path.relative(rootDir, outdir)}`);

// Server-owned analytics reports share the presentation calculator with the API
// and scheduled closing job. Generic persistence stays in its existing module.
await build({
  entryPoints: [path.join(rootDir, 'server/cafe24/analytics-reports.ts')],
  outfile: path.join(rootDir, 'dist-cafe24/analytics-reports.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20', legalComments: 'none',
  plugins: [{ name: 'analytics-runtime-owners', setup(builder) {
    builder.onResolve({ filter: /^\.\/(generic-data-api|mysql-pool)\.js$/ }, args => ({
      path: `../server/cafe24/${path.basename(args.path)}`, external: true,
    }));
  } }],
});
