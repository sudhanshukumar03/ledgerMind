const fs = require('fs');
const path = require('path');

if (process.argv.some(arg => arg.includes('jest-e2e.json'))) {
  require('./test-database-guard.cjs').assertTestDatabase();
}

const localJest = path.resolve(__dirname, '../node_modules/jest/bin/jest.js');
const rootJest = path.resolve(__dirname, '../../node_modules/jest/bin/jest.js');

const jestPath = fs.existsSync(localJest) ? localJest : rootJest;
require(jestPath);
