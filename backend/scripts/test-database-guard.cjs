function assertTestDatabase(env = process.env) {
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('E2E requires an explicit disposable DATABASE_URL'); }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (env.NODE_ENV !== 'test' || env.TEST_ALLOW_DATABASE_RESET !== 'true' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      !/^ledgermind_test(?:_[a-zA-Z0-9]+)?$/.test(database)) {
    throw new Error('E2E reset refused: require NODE_ENV=test, TEST_ALLOW_DATABASE_RESET=true and a localhost ledgermind_test[_suffix] database');
  }
  return database;
}
module.exports = { assertTestDatabase };
