import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { dayOf, fileReader, monthsIn, rangeOf, summarize } from "./stats.js";

const SECRET = "sk-very-secret-value";
const at = (day, h, m = 0, s = 0) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`).toISOString();
const user = (t, content, extra = {}) => ({ type: "user", timestamp: t, cwd: "/code/shop", message: { role: "user", content }, ...extra });
const reply = (t, id, tools = [], output = 10) => ({
  type: "assistant", timestamp: t, cwd: "/code/shop",
  message: { id, role: "assistant", content: tools.map((name) => ({ type: "tool_use", name, input: { secret: SECRET } })), usage: { input_tokens: 5, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 1 } },
});
const read = (lines) => {
  const r = fileReader();
  for (const line of lines) r.add(line);
  return r.finish();
};
const DAY = "2026-10-15";
const today = new Date(`${DAY}T20:00`);

test("counts what was typed, not what the harness added", () => {
  const f = read([
    user(at(DAY, 10), `my key is ${SECRET}`),
    user(at(DAY, 10, 1), [{ type: "text", text: "look" }, { type: "image" }]),
    user(at(DAY, 10, 2), [{ type: "tool_result", content: SECRET }]),
    user(at(DAY, 10, 3), "<command-name>/clear</command-name>"),
    user(at(DAY, 10, 4), "[Request interrupted by user]"),
    user(at(DAY, 10, 5), "meta text", { isMeta: true }),
    user(at(DAY, 10, 6), "from a sub-agent", { isSidechain: true }),
  ]);
  const d = f.days[DAY];
  assert.deepEqual([d.prompts, d.images, d.stops, d.longest, d.hours[10]], [2, 1, 1, `my key is ${SECRET}`.length, 2]);
  assert.equal(f.project, "shop");
});

test("no text from a transcript is kept", () => {
  const f = read([user(at(DAY, 10), `my key is ${SECRET}`), reply(at(DAY, 10, 1), "a", ["Bash"])]);
  assert.ok(!JSON.stringify(f).includes(SECRET));
});

test("one reply over several lines counts its tokens once, with the final count", () => {
  const f = read([reply(at(DAY, 10), "a", ["Bash"], 1), reply(at(DAY, 10, 0, 5), "a", ["Edit"], 50), reply(at(DAY, 10, 1), "b", [], 10)]);
  assert.deepEqual(f.days[DAY].tokens, { input: 10, output: 60, cache: 202 });
  assert.deepEqual(f.days[DAY].tools, { Bash: 1, Edit: 1 });
});

test("time counts only short gaps", () => {
  const f = read([user(at(DAY, 10), "a"), reply(at(DAY, 10, 2), "a"), user(at(DAY, 12), "b"), reply(at(DAY, 12, 1), "b")]);
  assert.equal(f.days[DAY].seconds, 180);
});

test("summary: sessions at once, your time, streak, night, tops", () => {
  const a = read([user(at("2026-10-14", 2), "night"), user(at(DAY, 10), "x"), reply(at(DAY, 10, 1), "a", ["Edit", "Bash"])]);
  const b = read([user(at(DAY, 10), "y"), reply(at(DAY, 10, 2), "b", ["Bash"])]);
  const old = read([user(at("2026-08-01", 10), "old")]);
  const s = summarize({ a, b, old }, "30d", today);
  assert.deepEqual([s.sessions, s.prompts, s.activeDays, s.longestRun, s.busiestAtOnce, s.nightPrompts, s.edits, s.toolCalls], [2, 3, 2, 2, 2, 1, 1, 3]);
  assert.equal(s.claudeSeconds, 180);
  assert.equal(s.topTools[0].name, "Bash");
  assert.equal(s.peakHour, 10);
  assert.equal(s.busiestDay, DAY);
  assert.equal(s.topProjects[0].name, "shop");
  assert.equal(s.title, "night");
  assert.deepEqual(monthsIn({ a, old }), ["2026-10", "2026-08"]);
  assert.equal(summarize({ a, old }, "2026-08", today).prompts, 1);
});

test("an empty period gives empty answers, not errors", () => {
  const s = summarize({}, "30d", today);
  assert.deepEqual([s.prompts, s.peakHour, s.title, s.busiestDay, s.longestSession], [0, null, null, null, null]);
});

test("periods cover a month or the last 30 days", () => {
  assert.deepEqual(rangeOf("2026-02", today), ["2026-02-01", "2026-02-28"]);
  assert.deepEqual(rangeOf("30d", today), [dayOf(new Date(2026, 8, 16)), DAY]);
});

test("the scan keeps a deleted transcript's numbers and rereads a changed one", () => {
  const dir = mkdtempSync(join(tmpdir(), "speys-wrapped-"));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const folder = join(dir, ".claude"), project = join(folder, "projects", "-code");
  mkdirSync(project, { recursive: true });
  const line = (o) => `${JSON.stringify(o)}\n`;
  const cacheFile = join(dir, "data", "wrapped.json"), child = join(import.meta.dirname, "scan-child.js");
  const scan = () => execFileSync(process.execPath, [child, cacheFile, JSON.stringify([folder])], { encoding: "utf8" });
  writeFileSync(join(project, "a.jsonl"), line(user(at(DAY, 10), "hello")) + "{ broken\n");
  writeFileSync(join(project, "b.jsonl"), line(user(at(DAY, 11), "bye")));
  assert.match(scan(), /2 2\n$/);
  let cache = JSON.parse(readFileSync(cacheFile, "utf8"));
  assert.equal(Object.keys(cache).length, 2);
  rmSync(join(project, "b.jsonl"));
  writeFileSync(join(project, "a.jsonl"), line(user(at(DAY, 10), "hello")) + line(user(at(DAY, 10, 1), "again")));
  scan();
  cache = JSON.parse(readFileSync(cacheFile, "utf8"));
  assert.equal(Object.keys(cache).length, 2);
  assert.equal(cache[join(project, "a.jsonl")].days[DAY].prompts, 2);
});
