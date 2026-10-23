// Owns only uniquely named temporary containers/network; never uses Compose volumes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const prefix = `ledgermind-verify-${randomUUID().slice(0, 8)}`;
const names = ['postgres', 'redis', 'backend', 'frontend'].map(
  (s) => `${prefix}-${s}`,
);
const [postgres, redis, backend, frontend] = names;
const network = `${prefix}-network`;
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
const probe = (container, path) =>
  docker(
    'exec',
    container,
    'node',
    '-e',
    `fetch('${path}', {signal: AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok) throw new Error('HTTP '+r.status);console.log(await r.text())}).catch(e=>{console.error(e.message);process.exit(1)})`,
  );
async function waitFor(container, path) {
  let last;
  for (let n = 0; n < 45; n++) {
    try {
      return probe(container, path);
    } catch (e) {
      last = e;
      if (
        docker(
          'inspect',
          '--format',
          '{{.State.Running}}',
          container,
        ).trim() !== 'true'
      )
        break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error(docker('logs', container));
  throw last;
}
try {
  for (const image of ['backend', 'frontend'])
    docker('image', 'inspect', `ledgermind-fix-verification-${image}`);
  docker(
    'network',
    'create',
    '--label',
    'ledgermind.task=fix-verification',
    network,
  );
  docker(
    'run',
    '-d',
    '--name',
    postgres,
    '--network',
    network,
    '--network-alias',
    'postgres',
    '--label',
    'ledgermind.task=fix-verification',
    '-e',
    'POSTGRES_USER=audit',
    '-e',
    'POSTGRES_PASSWORD=synthetic-container-password',
    '-e',
    'POSTGRES_DB=ledgermind_test_docker',
    'postgres:16-alpine',
  );
  docker(
    'run',
    '-d',
    '--name',
    redis,
    '--network',
    network,
    '--network-alias',
    'redis',
    '--label',
    'ledgermind.task=fix-verification',
    'redis:7-alpine',
  );
  docker(
    'run',
    '-d',
    '--name',
    backend,
    '--network',
    network,
    '--network-alias',
    'backend',
    '--label',
    'ledgermind.task=fix-verification',
    '-e',
    'DATABASE_URL=postgresql://audit:synthetic-container-password@postgres:5432/ledgermind_test_docker?schema=public',
    '-e',
    'REDIS_HOST=redis',
    '-e',
    'REDIS_PORT=6379',
    '-e',
    'REDIS_PASSWORD=',
    '-e',
    'JWT_SECRET=isolated_container_verification_secret',
    '-e',
    'FRONTEND_URL=http://frontend:3000',
    '-e',
    'SEED_DATABASE=false',
    '-e',
    'AI_ENABLED=false',
    '-e',
    'PAYMENT_EXECUTION_MODE=disabled',
    'ledgermind-fix-verification-backend',
  );
  const health = JSON.parse(
    await waitFor(backend, 'http://127.0.0.1:3001/api/v1/health'),
  );
  assert.equal(health.status, 'ok');
  docker(
    'run',
    '-d',
    '--name',
    frontend,
    '--network',
    network,
    '--label',
    'ledgermind.task=fix-verification',
    'ledgermind-fix-verification-frontend',
  );
  assert.match(await waitFor(frontend, 'http://127.0.0.1:3000/'), /LedgerMind/);
  const proxy = JSON.parse(
    await waitFor(frontend, 'http://127.0.0.1:3000/api/health'),
  );
  assert.equal(proxy.status, 'ok');
  // A seed/reset would delete these records. Verify the real entrypoint twice.
  docker(
    'exec',
    backend,
    'node',
    '--input-type=module',
    '-e',
    "import {PrismaClient} from '@prisma/client';const p=new PrismaClient();const m=await p.merchant.create({data:{name:'Restart sentinel',email:'sentinel@example.invalid'}});await p.auditLog.create({data:{merchantId:m.id,action:'RESTART_SENTINEL',entityType:'MERCHANT',entityId:m.id}});await p.$disconnect();",
  );
  docker('restart', backend);
  await waitFor(backend, 'http://127.0.0.1:3001/api/v1/health');
  const count = docker(
    'exec',
    backend,
    'node',
    '--input-type=module',
    '-e',
    "import {PrismaClient} from '@prisma/client';const p=new PrismaClient();console.log(JSON.stringify({merchants:await p.merchant.count({where:{name:'Restart sentinel'}}),audits:await p.auditLog.count({where:{action:'RESTART_SENTINEL'}})}));await p.$disconnect();",
  );
  assert.deepEqual(JSON.parse(count), { merchants: 1, audits: 1 });
  assert.equal(
    JSON.parse(probe(frontend, 'http://127.0.0.1:3000/api/health')).status,
    'ok',
  );
  console.log(
    'PASS containers: fresh schema, disabled providers, standalone frontend, /api/v1 proxy, restart preserves merchant and audit records',
  );
} finally {
  for (const name of names.reverse()) {
    try {
      docker('rm', '-f', '-v', name);
    } catch {
      /* creation may have failed */
    }
  }
  try {
    docker('network', 'rm', network);
  } catch {
    /* creation may have failed */
  }
}
