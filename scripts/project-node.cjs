// Root npm commands use a supported runtime even if Windows' global Node is older.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pin = fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(pin)) throw new Error('Invalid .node-version');
const [major, minor, patch] = process.versions.node.split('.').map(Number);
const supported =
  major >= 26 ||
  (major === 24 && minor >= 15) ||
  (major === 22 && (minor > 22 || (minor === 22 && patch >= 3)));
const portable = path.join(
  root,
  '.runtime',
  `node-v${pin}-win-x64`,
  'node.exe',
);
const executable =
  process.platform === 'win32' && fs.existsSync(portable)
    ? portable
    : supported
      ? process.execPath
      : null;
if (!executable) {
  console.error(
    'A supported Node runtime is required. On Windows run: powershell -File scripts/setup-node.ps1',
  );
  process.exit(1);
}
const args = process.argv.slice(2);
if (args[0] === 'npm') {
  args.shift();
  const bin = path.dirname(executable);
  const candidates = [
    path.join(bin, 'node_modules/npm/bin/npm-cli.js'),
    path.join(bin, '../lib/node_modules/npm/bin/npm-cli.js'),
  ];
  if (executable === process.execPath && process.env.npm_execpath)
    candidates.push(process.env.npm_execpath);
  const cli = candidates.find((file) => fs.existsSync(file));
  if (!cli) {
    console.error('npm CLI was not found beside the selected Node runtime');
    process.exit(1);
  }
  args.unshift(cli);
}
const env = { ...process.env };
const pathKey =
  Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
env[pathKey] = path.dirname(executable) + path.delimiter + (env[pathKey] || '');
const result = spawnSync(executable, args, {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) {
  console.error(`Runtime launch failed: ${result.error.code}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
