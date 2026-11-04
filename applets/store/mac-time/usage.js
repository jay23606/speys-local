// The numbers from Speys Mac's daily files, and from macOS's own power log. The time rule is the same as
// `Kullanim.ozet` in speys-mac: a change it needs there too.
const MAX_GAP_S = 120;
const pad = (n) => String(n).padStart(2, "0");
export const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Lines of one day's file → total, apps, hours, first and last moment in use. */
export function summarize(text, now = Date.now() / 1000) {
  const apps = new Map(), hours = Array(24).fill(0);
  let app = null, previous = 0, total = 0, first = null, last = null;
  const count = (until) => {
    if (!app || !previous) return;
    const seconds = Math.min(Math.max(0, until - previous), MAX_GAP_S);
    if (!seconds) return;
    const hour = new Date(previous * 1000).getHours();
    apps.set(app, (apps.get(app) || 0) + seconds);
    hours[hour] += seconds;
    total += seconds;
    first ??= previous;
    last = previous + seconds;
  };
  for (const line of text.split("\n")) {
    let o;
    try {
      o = line && JSON.parse(line);
    } catch {
      continue; // a line still being written
    }
    if (!o || typeof o.z !== "number") continue;
    count(o.z);
    previous = o.z;
    if (o.o === "uyg") app = o.ad || "?";
    else if (o.o === "dur") app = null;
  }
  count(now);
  return {
    total, first, last, hours,
    apps: [...apps].sort((a, b) => b[1] - a[1]).map(([name, seconds]) => ({ name, seconds })),
  };
}

/** Seconds the display was on during `day`, from `pmset -g log`. Null when the log doesn't reach back to that day. */
export function screenOn(log, day, now = Date.now() / 1000) {
  const start = new Date(`${day}T00:00`).getTime() / 1000, end = Math.min(start + 86400, now);
  const events = [];
  for (const line of log.split("\n")) {
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4}) .*Display is turned (on|off)/.exec(line);
    if (m) events.push({ at: new Date(`${m[1]}T${m[2]}${m[3].slice(0, 3)}:${m[3].slice(3)}`).getTime() / 1000, on: m[4] === "on" });
  }
  if (!events.length || events[0].at >= end) return null; // the log starts after this day
  let on = false, previous = start, total = 0;
  for (const e of events) {
    if (e.at <= start) { on = e.on; continue; }
    if (e.at >= end) break;
    if (on) total += e.at - previous;
    on = e.on;
    previous = e.at;
  }
  if (on) total += end - previous;
  return total;
}
