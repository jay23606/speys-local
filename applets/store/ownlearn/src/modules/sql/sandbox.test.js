import assert from "node:assert/strict";
import { test } from "node:test";
import { check, checkLimited } from "./sandbox.js";

const SCHEMA = "CREATE TABLE t (id INTEGER, name TEXT); INSERT INTO t VALUES (1, 'a'), (2, 'b');";
const LESSON = { solution: "SELECT id FROM t ORDER BY id", ordered: true };

test("a query gives the same answer as in-process", async () => {
  assert.deepEqual(await checkLimited(SCHEMA, "SELECT * FROM t", null), check(SCHEMA, "SELECT * FROM t"));
  const right = await checkLimited(SCHEMA, "SELECT id FROM t ORDER BY id", LESSON);
  assert.equal(right.ok, true);
  const wrong = await checkLimited(SCHEMA, "SELECT id FROM t ORDER BY id DESC", LESSON);
  assert.deepEqual([wrong.ok, wrong.reasons], [false, [{ code: "order" }]]);
});

test("a SQL error and a blocked statement come back as errors", async () => {
  assert.equal((await checkLimited(SCHEMA, "SELEC 1", null)).ok, false);
  assert.match((await checkLimited(SCHEMA, "ATTACH 'x.db' AS x", null)).error, /not available/);
});

for (const [name, sql] of [
  ["keeps rows", "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT * FROM c"],
  ["yields no rows while running", "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c"],
]) {
  test(`a query that never ends is stopped and the server keeps answering: ${name}`, async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 50);
    const started = Date.now();
    const r = await checkLimited(SCHEMA, sql, null, 500);
    clearInterval(timer);
    assert.equal(r.ok, false);
    assert.equal(r.limit, true);
    assert.ok(Date.now() - started < 3000);
    assert.ok(ticks >= 5, `event loop ran ${ticks} times`);
  });
}
