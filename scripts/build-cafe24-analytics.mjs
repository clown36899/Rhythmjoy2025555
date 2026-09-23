// Build only the analytics modal against the verified, currently published app.
// This preserves unrelated production changes when the working tree contains
// unfinished work. A different production bundle must be reviewed before reuse.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [baselineDir, outputDir] = process.argv.slice(2);
if (!baselineDir || !outputDir) throw new Error('Usage: node scripts/build-cafe24-analytics.mjs BASELINE_DIR OUTPUT_DIR');
const modalPath = 'assets/SiteAnalyticsModal-B0zRWyG2.js';
const sha256 = text => createHash('sha256').update(text).digest('hex');
const baselineModal = await readFile(path.join(baselineDir, modalPath), 'utf8');
if (sha256(baselineModal) !== 'ad7d95723398f551ceb31aa047dc46bab74ef3c294bb267a4df91145b1002d4d') {
    throw new Error('Production analytics dependency contract changed. Refusing a scoped release.');
}
const main = await readFile(path.join(baselineDir, 'assets/main-C2UW8TcE.js'), 'utf8');
if (sha256(main) !== 'ba967d5c4efdf9ec1916f98179a74896ca51895939e734237b0a593c63bfa478' || !main.includes('./SiteAnalyticsModal-B0zRWyG2.js')) throw new Error('Production entry no longer imports the verified analytics modal.');
const html = await readFile(path.join(baselineDir, 'index.html'), 'utf8');
if (!html.includes('./assets/index-BwteG_lI.js')) throw new Error('Production app entry changed.');
const version = JSON.parse(await readFile(path.join(baselineDir, 'version.json'), 'utf8'));
if (String(version.buildTime) !== '1789750324455') throw new Error('Production base build changed.');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const adapters = {
    react: 'import { r } from "/assets/react-vendor-DHAwnf5B.js"; export const useState = r.useState, useEffect = r.useEffect, useRef = r.useRef;',
    'react/jsx-runtime': 'import { j } from "/assets/ui-vendor-RqmFPUQS.js"; export const jsx = j.jsx, jsxs = j.jsxs, Fragment = j.Fragment;',
    cafe24Client: 'export { c as cafe24 } from "/assets/main-C2UW8TcE.js";',
    analyticsEngine: 'export { az as isInternalAnalyticsRoute, ay as isLikelyBotTraffic } from "/assets/main-C2UW8TcE.js";',
    analyticsGuards: 'export { b8 as isAnalyticsDatacenterIp } from "/assets/main-C2UW8TcE.js";',
};
const result = await build({
    entryPoints: ['src/components/SiteAnalyticsModal.tsx'], bundle: true, write: false,
    format: 'esm', platform: 'browser', target: 'es2020', jsx: 'automatic', minify: true,
    plugins: [{
        name: 'published-analytics-dependencies',
        setup(builder) {
            builder.onResolve({ filter: /^(react|react\/jsx-runtime)$/ }, args => ({ path: args.path, namespace: 'published' }));
            builder.onResolve({ filter: /\/(cafe24Client|analyticsEngine|analyticsGuards)$/ }, args => ({ path: path.basename(args.path), namespace: 'published' }));
            builder.onResolve({ filter: /^\/assets\// }, args => ({ path: args.path, external: true }));
            // The published app already loads this unchanged stylesheet with the modal.
            builder.onLoad({ filter: /SiteAnalyticsModal\.css$/ }, () => ({ contents: '', loader: 'js' }));
            builder.onLoad({ filter: /.*/, namespace: 'published' }, args => ({ contents: adapters[args.path], loader: 'js' }));
        },
    }],
});
const code = result.outputFiles[0].text;
const modulePath = `assets/SiteAnalyticsModal-${sha256(code).slice(0, 16)}.js`;
await mkdir(path.join(outputDir, 'assets'), { recursive: true });
await writeFile(path.join(outputDir, modulePath), code);
const marker = /<!-- analytics-scoped-release -->[\s\S]*?<!-- \/analytics-scoped-release -->\s*/g;
const cleanHtml = html.replace(marker, '');
if (cleanHtml.includes('type="importmap"')) throw new Error('Unrecognized import map; refusing to replace it.');
const mapping = JSON.stringify({ imports: { [`/${modalPath}`]: `/${modulePath}` } });
const injection = `<!-- analytics-scoped-release -->\n<script type="importmap" data-analytics-commit="${commit}">${mapping}</script>\n<!-- /analytics-scoped-release -->\n`;
const moduleTag = '<script type="module"';
if (!cleanHtml.includes(moduleTag)) throw new Error('No module entry in production HTML.');
await writeFile(path.join(outputDir, 'index.html'), cleanHtml.replace(moduleTag, injection + moduleTag));
// Preserve the app build ID: changing it without rebuilding the app would trigger
// the bootstrap's stale-build reload guard. The scoped module has its own revision.
await writeFile(path.join(outputDir, 'version.json'), JSON.stringify({ ...version, analyticsReportCommit: commit, analyticsReportModule: modulePath, analyticsReportVersion: 2 }));
await writeFile(path.join(outputDir, 'analytics-release.json'), JSON.stringify({ commit, modulePath, baseIndexSha256: sha256(html), moduleSha256: sha256(code) }));
console.log(JSON.stringify({ commit, modulePath, baseBuild: version.buildTime }));

// The production generic API also contains unrelated, already deployed changes.
// Apply only this branch's analytics delta to that verified production baseline.
const runtimeDir = path.join(outputDir, 'runtime');
await mkdir(path.join(runtimeDir, 'server/cafe24'), { recursive: true });
await mkdir(path.join(runtimeDir, 'dist-cafe24'), { recursive: true });
await mkdir(path.join(runtimeDir, 'scripts'), { recursive: true });
await mkdir(path.join(runtimeDir, 'deploy/cafe24/cron'), { recursive: true });
const serverHashes = {};
for (const [file, expectedHash] of [
    ['generic-data-api.js', 'bb2e2eabcb5da44a1683bc97ff231f4325208b775454af27928816f3cda2ef0b'],
    ['stats-api.js', '06805c1180f3f5f6d79caf82c3f027ef2b170170352f016cc3d0268ef4c8bb94'],
]) {
    const relative = `server/cafe24/${file}`;
    const baseline = await readFile(path.join(baselineDir, file), 'utf8');
    if (sha256(baseline) !== expectedHash) throw new Error(`Production ${file} changed. Review the scoped server patch before deployment.`);
    await writeFile(path.join(runtimeDir, relative), baseline);
    const patch = execFileSync('git', ['diff', '72be39c1', '--', relative], { encoding: 'utf8' });
    if (patch) execFileSync('git', ['apply', '--unsafe-paths', '-'], { cwd: runtimeDir, input: patch });
    serverHashes[file] = { base: sha256(baseline), deployed: sha256(await readFile(path.join(runtimeDir, relative), 'utf8')) };
}
await copyFile('dist-cafe24/analytics-reports.mjs', path.join(runtimeDir, 'dist-cafe24/analytics-reports.mjs'));
await copyFile('scripts/run-cafe24-cron-refresh-stats.mjs', path.join(runtimeDir, 'scripts/run-cafe24-cron-refresh-stats.mjs'));
await copyFile('deploy/cafe24/cron/swingenjoy-stats', path.join(runtimeDir, 'deploy/cafe24/cron/swingenjoy-stats'));
await writeFile(path.join(outputDir, 'analytics-server-release.json'), JSON.stringify({ files: serverHashes, reportVersion: 2 }));
