// Verify the scoped coverage-loader override through its real YAML API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(root, 'backend/package.json'));
const coverageRequire = createRequire(
  backendRequire.resolve('babel-plugin-istanbul'),
);
const loaderPath = coverageRequire.resolve('@istanbuljs/load-nyc-config');
const loaderRequire = createRequire(loaderPath);
const { loadNycConfig } = coverageRequire('@istanbuljs/load-nyc-config');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
assert.ok(
  !Object.keys(lock.packages).some((p) =>
    /(^|\/)node_modules\/sprintf-js$/.test(p),
  ),
  'sprintf-js must be absent from the complete lockfile',
);
assert.match(loaderRequire('js-yaml/package.json').version, /^4\./);

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgermind-tooling-'));
const files = ['package.json', 'base.yml', '.nycrc.yml'];
async function main() {
  try {
    fs.writeFileSync(
      path.join(folder, 'package.json'),
      '{"name":"synthetic-tooling-fixture","private":true}',
    );
    fs.writeFileSync(
      path.join(folder, 'base.yml'),
      'include:\n  - src/**/*.ts\nextension: .ts\nall: true\n',
    );
    fs.writeFileSync(
      path.join(folder, '.nycrc.yml'),
      'extends: ./base.yml\ncheck-coverage: true\nlines: 80\nexclude: fixtures/**\n',
    );
    const config = await loadNycConfig({ cwd: folder });
    assert.equal(config.cwd, folder);
    assert.equal(config.all, true);
    assert.equal(config.checkCoverage, true);
    assert.equal(config.lines, 80);
    assert.deepEqual(config.include, ['src/**/*.ts']);
    assert.deepEqual(config.extension, ['.ts']);
    assert.deepEqual(config.exclude, ['fixtures/**']);
    assert.equal(config.extends, undefined);
    console.log(
      'PASS tooling: real coverage YAML loading, relative inheritance, normalized options, and no sprintf-js',
    );
  } finally {
    for (const file of files)
      fs.rmSync(path.join(folder, file), { force: true });
    fs.rmdirSync(folder);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
