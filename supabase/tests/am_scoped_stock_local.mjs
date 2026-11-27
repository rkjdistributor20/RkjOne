// Run with node and a local @electric-sql/pglite install. Optionally set
// RKJ_TEST_PGLITE_MODULE to the filesystem path of that package.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.RKJ_TEST_PGLITE_MODULE || '@electric-sql/pglite');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const [bootstrap, supportingSchema, assertions] = read('./am_scoped_stock_local.sql').split(/^-- LOAD.*$/m);
const db = new PGlite();
try {
  await db.exec(bootstrap + read('../migrations/00004_inventory.sql')
    + read('../migrations/00008_notifications_approvals.sql') + supportingSchema);
  await db.exec(read('../migrations/20261127220000_am_scoped_stock_posting_and_count_review.sql'));
  await db.exec(assertions);
  console.log('AM stock database fixture passed');
} catch (error) {
  console.error(error.message, error.code, error.where, error.detail);
  process.exitCode = 1;
} finally {
  await db.close();
}
