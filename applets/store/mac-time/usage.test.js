import assert from "node:assert/strict";
import { test } from "node:test";
import { screenOn, summarize } from "./usage.js";

const at = (h, m = 0, s = 0) => new Date(2026, 10, 1, h, m, s).getTime() / 1000;
const lines = (...rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

test("time goes to the app in front, and heartbeats keep it going", () => {
  const s = summarize(lines(
    { z: at(10), o: "uyg", ad: "Code" }, { z: at(10, 1), o: "k" }, { z: at(10, 2), o: "uyg", ad: "Chrome" }, { z: at(10, 3), o: "dur", neden: "kilit" },
  ), at(12));
  assert.deepEqual(s.apps, [{ name: "Code", seconds: 120 }, { name: "Chrome", seconds: 60 }]);
  assert.equal(s.total, 180);
  assert.equal(s.hours[10], 180);
  assert.deepEqual([s.first, s.last], [at(10), at(10, 3)]);
});

test("a stop ends counting until the next app, and a long silence counts for two minutes at most", () => {
  const stopped = summarize(lines({ z: at(9), o: "uyg", ad: "A" }, { z: at(9, 1), o: "dur", neden: "uyku" }, { z: at(11), o: "uyg", ad: "B" }, { z: at(11, 1), o: "k" }), at(11, 1));
  assert.deepEqual(stopped.apps.map((a) => a.seconds), [60, 60]);
  const crashed = summarize(lines({ z: at(9), o: "uyg", ad: "A" }), at(15));
  assert.equal(crashed.total, 120);
});

test("a broken line and an empty day don't fail", () => {
  assert.equal(summarize(`{ broken\n${lines({ z: at(9), o: "uyg", ad: "A" }, { z: at(9, 1), o: "k" })}`, at(9, 1)).total, 60);
  assert.deepEqual([summarize("").total, summarize("").first, summarize("").apps], [0, null, []]);
});

const pmset = (rows) => rows.map(([d, t, s]) => `${d} ${t} +0300 Notification        \tDisplay is turned ${s}      `).join("\n");

test("display time adds up on and off, from before midnight too", () => {
  const log = pmset([["2026-10-31", "23:00:00", "on"], ["2026-11-01", "01:00:00", "off"], ["2026-11-01", "09:00:00", "on"], ["2026-11-01", "10:30:00", "off"]]);
  const noon = new Date("2026-11-01T12:00:00+03:00").getTime() / 1000;
  const midnightOffset = new Date("2026-11-01T00:00").getTime() / 1000 - new Date("2026-11-01T00:00:00+03:00").getTime() / 1000;
  assert.equal(screenOn(log, "2026-11-01", noon), 3600 - midnightOffset + 5400);
});

test("a display still on counts up to now, and a day the log doesn't know is unknown", () => {
  const log = pmset([["2026-11-01", "09:00:00", "on"]]);
  const at10 = new Date("2026-11-01T10:00:00+03:00").getTime() / 1000;
  assert.equal(screenOn(log, "2026-11-01", at10), 3600);
  assert.equal(screenOn(log, "2026-10-01", at10), null);
});

test("a display on since yesterday counts today, with no event today", () => {
  const log = pmset([["2026-10-31", "20:00:00", "on"]]);
  const midnight = new Date("2026-11-01T00:00").getTime() / 1000;
  assert.equal(screenOn(log, "2026-11-01", midnight + 600), 600);
});
