// Regression entry for the reviewed pending-proposal/entity-switch defect.
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const local = createRequire(
  path.resolve(__dirname, '../frontend/package.json'),
);
const result = spawnSync(
  process.execPath,
  [
    local.resolve('@playwright/test/cli'),
    'test',
    '--workers=1',
    '--grep',
    'switching exceptions during a pending proposal',
    ...process.argv.slice(2),
  ],
  {
    cwd: path.resolve(__dirname, '../frontend'),
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  },
);
process.exitCode = result.status ?? 1;
