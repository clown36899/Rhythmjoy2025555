import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../../src/pages/groove-lab/GrooveLabPage.tsx', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const urls = [...new Set([...source.matchAll(/href:\s*'(https?:\/\/[^']+)'/g)].map((match) => match[1]))];
const userAgent = 'Mozilla/5.0 (compatible; GrooveLabEvidenceAudit/1.0; +https://swingenjoy.com)';

const auditUrl = async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
        const response = await fetch(url, {
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': userAgent,
                Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8',
                Range: 'bytes=0-65535',
            },
        });
        const contentType = response.headers.get('content-type') ?? '';
        const body = contentType.includes('text/html') ? await response.text() : '';
        const normalizedBody = body.toLowerCase();
        const errorPage = response.ok && (
            normalizedBody.includes('<title>404')
            || normalizedBody.includes('page not found')
            || normalizedBody.includes('the page you requested could not be found')
        );
        return {
            url,
            finalUrl: response.url,
            status: response.status,
            contentType: contentType.split(';')[0],
            classification: errorPage
                ? 'broken'
                : response.ok || response.status === 206 ? 'reachable'
                    : [401, 403, 429].includes(response.status) ? 'restricted'
                        : 'broken',
        };
    } catch (error) {
        return {
            url,
            status: 0,
            contentType: '',
            classification: 'broken',
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        clearTimeout(timeout);
    }
};

const results = [];
const queue = [...urls];
const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
        const url = queue.shift();
        if (url) results.push(await auditUrl(url));
    }
});
await Promise.all(workers);
results.sort((left, right) => left.url.localeCompare(right.url));

const broken = results.filter((item) => item.classification === 'broken');
const restricted = results.filter((item) => item.classification === 'restricted');
console.log(JSON.stringify({
    checked: results.length,
    reachable: results.length - broken.length - restricted.length,
    restricted: restricted.length,
    broken: broken.length,
    brokenLinks: broken,
    restrictedLinks: restricted,
}, null, 2));

if (broken.length) process.exitCode = 1;
