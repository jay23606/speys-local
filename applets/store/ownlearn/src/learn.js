// Progress and the daily session. Spaced repetition with Leitner boxes: a right answer moves a
// topic up a box (asked again later), a wrong one sends it back to box 0 (asked again tomorrow).
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35];
export const SESSION_SIZE = 5;

export function dataDir(root) {
  const id = basename(root).replace(/[^\w.-]/g, "_") + "-" + createHash("sha1").update(root).digest("hex").slice(0, 8);
  const dir = join(process.env.OWNLEARN_HOME || join(homedir(), ".ownlearn"), id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  writeFileSync(file + ".tmp", JSON.stringify(data, null, 1));
  renameSync(file + ".tmp", file);
}

export const today = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD, local time

const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv");
};

/** Small deterministic random: the same day gives the same session. */
function seeded(seed) {
  let h = createHash("sha1").update(seed).digest().readUInt32LE(0);
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

/** Variants of a topic's questions that fit an example (their `when` matches its code). */
const fitting = (topic, ex) => topic.questions.map((q, i) => [q, i]).filter(([q]) => !q.when || q.when.test(ex.context));

/**
 * Today's questions: topics you use, the ones due first (lowest box, oldest due date), each with
 * one real example from your code and a question variant that is true for that example.
 */
export function session(module, map, progress, date = today()) {
  const rnd = seeded(date + map.root);
  const used = module.topics.filter((t) => map.topics[t.id]?.count > 0);
  const state = (t) => progress.topics[t.id] || { box: 0, due: date, seen: 0 };
  const due = used
    .filter((t) => state(t).due <= date)
    .sort((a, b) => state(a).box - state(b).box || state(a).due.localeCompare(state(b).due) || a.level - b.level || rnd() - 0.5);
  const done = new Set((progress.log || []).filter((l) => l.date === date).map((l) => l.topic));
  const out = [];
  for (const t of due) {
    if (out.length >= SESSION_SIZE) break;
    if (done.has(t.id)) continue;
    const examples = map.topics[t.id].examples.filter((ex) => fitting(t, ex).length);
    if (!examples.length) continue;
    const ex = examples[Math.floor(rnd() * examples.length)];
    const variants = fitting(t, ex);
    const [q, variant] = variants[Math.floor(rnd() * variants.length)];
    // option order shuffled per question; the answer stays on the server
    const order = q.options.map((_, i) => i).sort(() => rnd() - 0.5);
    out.push({ topic: t.id, variant, example: ex, order });
  }
  return { date, questions: out, answeredToday: done.size };
}

export function answer(module, progress, topicId, variant, choice, date = today()) {
  const topic = module.topics.find((t) => t.id === topicId);
  const q = topic?.questions[variant];
  if (!q) throw new Error("unknown question");
  const correct = choice === q.answer;
  const s = progress.topics[topicId] || { box: 0, due: date, seen: 0, right: 0, wrong: 0 };
  s.seen++;
  if (correct) { s.right = (s.right || 0) + 1; s.box = Math.min(s.box + 1, INTERVAL_DAYS.length - 1); }
  else { s.wrong = (s.wrong || 0) + 1; s.box = 0; }
  s.due = addDays(date, Math.max(1, INTERVAL_DAYS[s.box]));
  s.last = date;
  progress.topics[topicId] = s;
  (progress.log ||= []).push({ date, topic: topicId, variant, correct });
  return { correct, answer: q.answer, box: s.box, due: s.due };
}
