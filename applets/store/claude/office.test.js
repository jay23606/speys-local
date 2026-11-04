import assert from "node:assert/strict";
import { test } from "node:test";
import { renameWithRetry } from "./backend.js";

const failing = (codes) => {
  const calls = [];
  return { calls, rename(from, to) {
    calls.push([from, to]);
    const code = codes.shift();
    if (code) throw Object.assign(new Error(code), { code });
  } };
};

test("a file held for a moment is tried again", () => {
  const { calls, rename } = failing(["EPERM", "EBUSY", "EACCES"]);
  const waits = [];
  renameWithRetry("a.new", "a", rename, (ms) => waits.push(ms));
  assert.equal(calls.length, 4);
  assert.equal(waits.length, 3);
});

test("another error fails at once", () => {
  const { calls, rename } = failing(["ENOSPC"]);
  assert.throws(() => renameWithRetry("a.new", "a", rename, () => {}), /ENOSPC/);
  assert.equal(calls.length, 1);
});

test("it gives up in the end", () => {
  const { calls, rename } = failing(Array(20).fill("EPERM"));
  assert.throws(() => renameWithRetry("a.new", "a", rename, () => {}), /EPERM/);
  assert.equal(calls.length, 6);
});
