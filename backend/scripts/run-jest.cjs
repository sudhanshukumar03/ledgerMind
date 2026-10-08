const fs = require('fs');
const path = require('path');

const localJest = path.resolve(__dirname, '../node_modules/jest/bin/jest.js');
const rootJest = path.resolve(__dirname, '../../node_modules/jest/bin/jest.js');

const jestPath = fs.existsSync(localJest) ? localJest : rootJest;
require(jestPath);
