import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import {
  curlExample,
  serverExamples,
  singleEventExample,
} from '../src/pages/external-api/externalEventApiGuideExamples';

const productionEndpoint = 'https://swingenjoy.com/api/external/v1/events';
const expectedPayload = JSON.parse(singleEventExample);
const receivedRequests = new Map<string, {
  method: string | undefined;
  contentType: string | undefined;
  payload: unknown;
}>();

const server = createServer((request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    const authorization = request.headers.authorization || '';
    const apiKey = authorization.replace(/^Bearer\s+/i, '');
    try {
      receivedRequests.set(apiKey, {
        method: request.method,
        contentType: request.headers['content-type'],
        payload: JSON.parse(body),
      });
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, event_id: `mock-${apiKey}` }));
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : 'invalid request',
      }));
    }
  });
});

const listen = () => new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '0.0.0.0', () => resolve());
});

const close = () => new Promise<void>((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});

const commandAvailable = (command: string) => (
  !spawnSync(command, ['--version'], { stdio: 'ignore' }).error
);

const runCommand = (
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
) => new Promise<void>((resolve, reject) => {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) {
      process.stdout.write(`✓ ${label}\n`);
      resolve();
      return;
    }
    reject(new Error([
      `${label} failed with exit code ${code}`,
      stdout.trim(),
      stderr.trim(),
    ].filter(Boolean).join('\n')));
  });
});

const verifyRequest = (apiKey: string) => {
  const request = receivedRequests.get(apiKey);
  assert.ok(request, `${apiKey} 요청이 모의 API에 도착해야 합니다.`);
  assert.equal(request.method, 'POST');
  assert.match(request.contentType || '', /^application\/json\b/i);
  assert.deepEqual(request.payload, expectedPayload);
};

await listen();
const address = server.address();
assert.ok(address && typeof address === 'object');
const localEndpoint = `http://127.0.0.1:${address.port}/api/external/v1/events`;
const dockerEndpoint = `http://host.docker.internal:${address.port}/api/external/v1/events`;
const tempDirectory = await mkdtemp(join(process.cwd(), '.tmp-external-api-guide-'));

try {
  const curlSource = curlExample
    .replace(productionEndpoint, localEndpoint)
    .replace('발급받은_API_KEY', 'guide-curl');
  await runCommand('cURL 실제 POST', '/bin/sh', ['-c', curlSource]);
  verifyRequest('guide-curl');

  const nodeExample = serverExamples.find((example) => example.id === 'node');
  assert.ok(nodeExample);
  const nodePath = join(tempDirectory, 'guide-example.mjs');
  await writeFile(nodePath, nodeExample.code.replace(productionEndpoint, localEndpoint), 'utf8');
  await runCommand('Node.js 예시 실행', process.execPath, [nodePath], {
    DANCE_BILLBOARD_API_KEY: 'guide-node',
  });
  verifyRequest('guide-node');

  const pythonExample = serverExamples.find((example) => example.id === 'python');
  assert.ok(pythonExample);
  const pythonPath = join(tempDirectory, 'guide_example.py');
  await writeFile(pythonPath, pythonExample.code.replace(productionEndpoint, localEndpoint), 'utf8');
  await runCommand('Python 예시 실행', 'python3', [pythonPath], {
    DANCE_BILLBOARD_API_KEY: 'guide-python',
  });
  verifyRequest('guide-python');

  const javaExample = serverExamples.find((example) => example.id === 'java');
  assert.ok(javaExample);
  const javaPath = join(tempDirectory, 'DanceBillboardExample.java');
  await writeFile(javaPath, javaExample.code.replace(productionEndpoint, localEndpoint), 'utf8');
  await runCommand('Java 예시 컴파일', 'javac', [javaPath]);
  await runCommand('Java 예시 실행', 'java', ['-cp', tempDirectory, 'DanceBillboardExample'], {
    DANCE_BILLBOARD_API_KEY: 'guide-java',
  });
  verifyRequest('guide-java');

  const phpExample = serverExamples.find((example) => example.id === 'php');
  assert.ok(phpExample);
  const phpPath = join(tempDirectory, 'guide-example.php');
  if (commandAvailable('php')) {
    await writeFile(phpPath, phpExample.code.replace(productionEndpoint, localEndpoint), 'utf8');
    await runCommand('PHP 예시 실행', 'php', [phpPath], {
      DANCE_BILLBOARD_API_KEY: 'guide-php',
    });
  } else {
    assert.ok(commandAvailable('docker'), 'PHP 또는 Docker 런타임이 필요합니다.');
    await writeFile(phpPath, phpExample.code.replace(productionEndpoint, dockerEndpoint), 'utf8');
    await runCommand(
      'PHP 8.3+cURL Docker 예시 실행',
      'docker',
      [
        'run',
        '--rm',
        '--add-host=host.docker.internal:host-gateway',
        '-e', 'DANCE_BILLBOARD_API_KEY=guide-php',
        '-v', `${tempDirectory}:/work`,
        'php:8.3-cli-alpine',
        'sh',
        '-lc',
        'apk add --no-cache $PHPIZE_DEPS curl-dev >/dev/null && docker-php-ext-install -j2 curl >/dev/null && php /work/guide-example.php',
      ],
    );
  }
  verifyRequest('guide-php');

  assert.equal(receivedRequests.size, 5);
  process.stdout.write('✓ 5개 예시의 POST·Bearer 인증·JSON 본문·2xx 응답 처리를 모두 검증했습니다.\n');
} finally {
  await close();
  await rm(tempDirectory, { recursive: true, force: true });
}
