// Numbers from Claude Code transcripts. Only counts, times and names of tools come out of a line: never what was said.
import { basename } from "node:path";

const GAP_S = 5 * 60; // a longer silence isn't time spent
const pad = (n) => String(n).padStart(2, "0");
export const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const emptyDay = () => ({ minutes: [], seconds: 0, prompts: 0, images: 0, stops: 0, longest: 0, hours: Array(24).fill(0), tools: {}, tokens: { input: 0, output: 0, cache: 0 } });

const promptOf = (content) => {
  if (typeof content === "string") return { text: content, images: 0 };
  if (!Array.isArray(content) || content.some((b) => b?.type === "tool_result")) return null;
  const text = content.filter((b) => b?.type === "text").map((b) => b.text ?? "").join("");
  return { text, images: content.filter((b) => b?.type === "image").length };
};

/** Reads one transcript line by line: `add` each parsed line, then `finish` for what is kept. */
export function fileReader() {
  const days = {}, usage = new Map();
  let cwd = null, last = 0;
  const dayFor = (d) => (days[dayOf(d)] ??= emptyDay());
  return {
    add(o) {
      const at = o?.timestamp ? new Date(o.timestamp) : null;
      if (!at || Number.isNaN(+at) || o.isSidechain) return;
      if (o.type !== "user" && o.type !== "assistant") return;
      cwd = o.cwd || cwd;
      const day = dayFor(at), seconds = at / 1000;
      const gap = seconds - last;
      if (last && gap > 0 && gap <= GAP_S) day.seconds += gap;
      last = seconds;
      const minute = at.getHours() * 60 + at.getMinutes();
      if (day.minutes.at(-1) !== minute) day.minutes.push(minute);
      if (o.type === "user") {
        const prompt = o.isMeta ? null : promptOf(o.message?.content);
        if (!prompt) return;
        if (prompt.text.startsWith("[Request interrupted")) { day.stops++; return; }
        if (prompt.text.startsWith("<")) return; // commands and system text the harness adds, not something typed
        day.prompts++;
        day.images += prompt.images;
        day.longest = Math.max(day.longest, prompt.text.length);
        day.hours[at.getHours()]++;
        return;
      }
      for (const b of Array.isArray(o.message?.content) ? o.message.content : []) {
        if (b?.type === "tool_use" && typeof b.name === "string") day.tools[b.name] = (day.tools[b.name] || 0) + 1;
      }
      // one reply is written over several lines with the same id, the last one holds its final count
      const u = o.message?.usage, id = o.message?.id;
      if (u && id) usage.set(id, { day, input: u.input_tokens || 0, output: u.output_tokens || 0, cache: (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) });
    },
    finish() {
      for (const { day, input, output, cache } of usage.values()) {
        day.tokens.input += input;
        day.tokens.output += output;
        day.tokens.cache += cache;
      }
      return { project: cwd ? basename(cwd) : null, days };
    },
  };
}

/** The day that starts a period ("30d" or "2026-10"), and the one that ends it. */
export function rangeOf(period, today = new Date()) {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    return [`${period}-01`, dayOf(new Date(y, m, 0))];
  }
  return [dayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)), dayOf(today)];
}

export const monthsIn = (files) => [...new Set(Object.values(files).flatMap((f) => Object.keys(f.days).map((d) => d.slice(0, 7))))].sort().reverse();

function longestRun(sortedDays) {
  let best = 0, run = 0, previous = null;
  for (const day of sortedDays) {
    const date = new Date(`${day}T12:00`);
    run = previous && Math.round((date - previous) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

const add = (target, key, n) => { target[key] = (target[key] || 0) + n; };

export function summarize(files, period, today = new Date()) {
  const [from, to] = rangeOf(period, today);
  const out = {
    from, to, sessions: 0, prompts: 0, images: 0, stops: 0, longestPrompt: 0, nightPrompts: 0, toolCalls: 0, edits: 0,
    claudeSeconds: 0, tokens: { input: 0, output: 0, cache: 0 }, hours: Array(24).fill(0), busiestAtOnce: 0,
  };
  const activeDays = new Map(), projects = {}, tools = {}, perMinute = new Map();
  let longestSession = null;
  for (const file of Object.values(files)) {
    let seconds = 0, seen = false;
    for (const [day, d] of Object.entries(file.days)) {
      if (day < from || day > to) continue;
      seen = true;
      seconds += d.seconds;
      out.prompts += d.prompts;
      out.images += d.images;
      out.stops += d.stops;
      out.longestPrompt = Math.max(out.longestPrompt, d.longest);
      d.hours.forEach((n, h) => { out.hours[h] += n; if (h < 5) out.nightPrompts += n; });
      for (const [name, n] of Object.entries(d.tools)) {
        add(tools, name, n);
        out.toolCalls += n;
        if (name === "Edit" || name === "Write") out.edits += n;
      }
      for (const k of ["input", "output", "cache"]) out.tokens[k] += d.tokens[k];
      const minutes = activeDays.get(day) ?? new Set();
      for (const m of d.minutes) {
        minutes.add(m);
        const key = `${day} ${m}`;
        const n = (perMinute.get(key) || 0) + 1;
        perMinute.set(key, n);
        out.busiestAtOnce = Math.max(out.busiestAtOnce, n);
      }
      activeDays.set(day, minutes);
    }
    if (!seen) continue;
    out.sessions++;
    out.claudeSeconds += seconds;
    if (file.project) add(projects, file.project, seconds);
    if (!longestSession || seconds > longestSession.seconds) longestSession = { project: file.project, seconds };
  }
  const days = [...activeDays.keys()].sort();
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    ...out,
    activeDays: days.length, longestRun: longestRun(days), longestSession,
    // minutes with something going on, however many sessions ran in them
    yourSeconds: [...activeDays.values()].reduce((t, m) => t + m.size * 60, 0),
    peakHour: out.prompts ? out.hours.indexOf(Math.max(...out.hours)) : null,
    busiestDay: days.reduce((best, day) => (activeDays.get(day).size > (best ? activeDays.get(best).size : 0) ? day : best), null),
    topProjects: top(projects, 5).map(([name, seconds]) => ({ name, seconds })),
    topTools: top(tools, 5).map(([name, count]) => ({ name, count })),
    title: titleFor(out, days.length),
  };
}

/** A name for the month, from what stood out. The page translates it. */
function titleFor(s, activeDays) {
  if (!s.prompts) return null;
  if (s.nightPrompts / s.prompts >= 0.2) return "night";
  if (s.busiestAtOnce >= 5) return "conductor";
  if (s.stops / s.prompts >= 0.08) return "backseat";
  if (s.images / s.prompts >= 0.15) return "screenshots";
  if (activeDays >= 25) return "everyday";
  return "steady";
}

