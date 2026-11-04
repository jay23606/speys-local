#!/usr/bin/env node
// Keyboard errors: the typos in the messages the user writes to Claude. Nothing leaves the machine.
//
//   node analyze.js <output folder> [<Claude folder> ...]
//   sonuc.json     read by the Typing applet, regenerated once an hour
//   kelimeler.md   the misspelled words, a readable list
//
// How the right word is known:
//   sozluk/tr.txt  Turkish word frequency (OpenSubtitles, hermitdave/FrequencyWords; seen 10+ times)
//   sozluk/en.txt  the 50k most frequent English words
//   sozluk/terms.txt  product and technical words neither list has ("apk", "capcut")
//   Words seen 5+ times across 3+ sessions in Claude's Turkish replies (applet, speys…): project terms should
//   not raise false alarms. Quoted text doesn't count (it quotes the user's own spelling).
//
// Error candidate: a word not in the dictionary + a frequent word within edit distance 1 (2 at 8+ letters) (SymSpell
// deletion index). Transposition comes first: it is the most common error. A word that is in the dictionary but rare
// is still an error if it has a neighbour 50 times as frequent. Spoken forms ("bakcaz", "dicem", "geliyo") are not errors.
// Not errors either: a known stem with Turkish endings ("iconları", "fotoda"), and a neighbour only keys far apart could
// produce ("widget" is not a slip of "şiddet"); this looks for keyboard errors.
//
// ~1 min and high memory; runs in a separate process so it doesn't stay in the server's memory.
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const WORD = /[a-zçğıöşüâîû]+/g;
const LEFT_HAND = new Set("qwertasdfgzxcvb");
const TR_PAIRS = new Set(["ıi", "iı", "sş", "şs", "gğ", "ğg", "cç", "çc", "oö", "öo", "uü", "üu"]);
const SPOKEN = /(c|ç)(az|ez|am|em|ak|ek|an|en|anız|eniz|aksın|eksin|ağım|eğim)$|^(bi|di|dicem|napcaz|naber)$/;
// "geliyo" → "geliyor", "geliyom" → "geliyorum"; the stem still gets checked, "açlışıyo" is an error
const SPOKEN_YOR = /(?<=[ıiuü])yo(m|z|sun|sunuz|lar|du|dum|dun|duk|dunuz|dular|muş)?$/;
const YOR_ENDINGS = { m: "um", z: "uz" };
// plural, possessive, then one case ending, "ki" last
const ENDINGS = /^(l[ae]r)?(ları|leri|[ıiuü]m|[ıiuü]n|[ıiuü]|s[ıiuü]|m[ıiuü]z|n[ıiuü]z|[ıiuü]m[ıiuü]z|[ıiuü]n[ıiuü]z)?(y?[ıiuü]|y?[ae]|n[ıiuü]|n[ae]|[dt][ae]|[dt][ae]n|nd[ae]|nd[ae]n|y?l[ae]|n?[ıiuü]n|y?s[ae]|[cç][ıiuü])?(ki)?$/;
const PAST_OR_REPORTED = /([dt][ıiuü](m|n|k|n[ıiuü]z)?|m[ıiuü]ş)$/;
const VOICELESS_END = /[fstkçşhp]$/; // after these a d turns into t: "girişte", not "girişde"
const VOWEL = /[aeıioöuü]/;
const TWO_VOWELS = /[aeıioöuü]{2}/;
const MIN_STEM = 3, STEM_FREQUENCY = 100, SHORT_STEM_FREQUENCY = 1000; // two letters only if common: "okun", "aslar"
const MIN_PERSON_STEM = 5; // "-cı" only after a longer stem: "bakımcı", not "sınucu"
const DOMINANT = 40; // a stem with endings doesn't save a word this many times rarer than its neighbour: "kulla" is "kullan"
const VERY_COMMON = 20_000; // one wrong key, however far, if the word is this common and the typed form unknown: "olnn"
const RARE_LONG_LENGTH = 8, RARE_LONG_FREQUENCY = 10; // long words are safe to suggest even when rare: "panelden"
const SAME_LETTERS_LENGTH = 6; // the same letters in another order are a typing slip from here on: "oalrka", "ypalaım", "faklrı"
const TWO_EDITS_LENGTH = 8; // two edits turn a shorter word into a different word: "soliter" → "splinter"
const CLOSE_FORMS = new Set(["bp", "pb", "dt", "td", "gk", "kg", "ğk", "kğ", "ei", "ie"]); // spelled by sound, not keyed: "takib", "deniyelim"
const KEY_ROWS = [["qwertyuıopğü", 0], ["asdfghjklşi", 0.25], ["zxcvbnmöç", 0.75]]; // Turkish Q, with each row's offset
const KEYS = new Map(KEY_ROWS.flatMap(([keys, offset], row) => [...keys].map((k, i) => [k, [i + offset, row]])));
const LINE_BREAK = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/;
// Error type labels, written to sonuc.json → turler; the page shows them through t(), the Turkish is in locales/tr.json.
const TURKISH_LETTER = "Turkish letter";
const TRANSPOSITION = "transposition";
const MISSING_LETTER = "missing letter";

const lower = (s) => s.replaceAll("I", "ı").replaceAll("İ", "i").toLowerCase();
const words = (s) => lower(s).match(WORD) || [];

class Counter extends Map {
  add(key, by = 1) {
    this.set(key, (this.get(key) || 0) + by);
  }
  mostCommon(n) {
    const all = [...this.entries()].sort((a, b) => b[1] - a[1]);
    return n === undefined ? all : all.slice(0, n);
  }
}

function textOf(content) {
  if (Array.isArray(content)) return content.filter((x) => x?.type === "text").map((x) => x.text ?? "").join("\n");
  return typeof content === "string" ? content : "";
}

function sessionFiles(roots) {
  const out = [];
  for (const root of roots) {
    const base = join(root, "projects");
    if (!existsSync(base)) continue;
    for (const project of readdirSync(base, { withFileTypes: true })) {
      if (!project.isDirectory()) continue;
      for (const f of readdirSync(join(base, project.name))) {
        if (f.endsWith(".jsonl")) out.push(join(base, project.name, f));
      }
    }
  }
  return out;
}

/** User messages + the words Claude spells correctly, in a single pass. */
async function collect(roots) {
  const messages = [];
  const seen = new Counter();
  const sessions = new Map();
  for (const file of sessionFiles(roots)) {
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.includes('"user"') && !line.includes('"assistant"')) continue;
      let d;
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      if (d.type === "user" && !d.isMeta && !d.isSidechain) {
        const m = textOf(d.message?.content);
        if (m.trim() && !/^(<|This session is being continued|Caveat:|\[Request interrupted)/.test(m)) {
          messages.push([d.timestamp || "", m]);
        }
      } else if (d.type === "assistant" && Array.isArray(d.message?.content)) {
        for (const c of d.message.content) {
          if (c?.type !== "text") continue;
          const text = String(c.text).replace(/`[^`]*`|"[^"]{0,40}"|“[^”]{0,40}”|'[^']{0,30}'/g, " ");
          for (const w of words(text)) {
            seen.add(w);
            if (!sessions.has(w)) sessions.set(w, new Set());
            sessions.get(w).add(d.sessionId);
          }
        }
      }
    }
  }
  const known = new Set();
  for (const [w, n] of seen) if (n >= 5 && sessions.get(w).size >= 3) known.add(w);
  return { messages, known };
}

const CODE_LINE = /[{};=]|^\s*(at |\$|%|>|#|\/\/|-->)|https?:\/\/|[\p{L}\p{N}_]+@[\p{L}\p{N}_]+|[\p{L}\p{N}_]+\.[\p{L}\p{N}_]{2,4}(?![\p{L}\p{N}_])|\/[\p{L}\p{N}_]+\//u;

function clean(m) {
  const text = m
    .replace(/<pasted_content[\s\S]*?<\/pasted_content>/g, " ")
    .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, " ")
    .replace(/```[\s\S]*?```/g, " ");
  return text.split(LINE_BREAK).filter((s) => s.length <= 400 && !CODE_LINE.test(s)).join("\n");
}

function deletions(w, depth) {
  const out = new Set([w]);
  let edge = [w];
  for (let k = 0; k < depth; k++) {
    const next = new Set();
    for (const x of edge) for (let i = 0; i < x.length; i++) next.add(x.slice(0, i) + x.slice(i + 1));
    for (const x of next) out.add(x);
    edge = [...next];
  }
  return out;
}

/** Damerau-Levenshtein (adjacent transposition = 1). */
function distance(a, b) {
  const rows = a.length + 2, cols = b.length + 2;
  const d = new Int32Array(rows * cols);
  const at = (i, j) => (i + 1) * cols + (j + 1);
  for (let i = -1; i <= a.length; i++) d[at(i, -1)] = i + 1;
  for (let j = -1; j <= b.length; j++) d[at(-1, j)] = j + 1;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let v = Math.min(d[at(i - 1, j)] + 1, d[at(i, j - 1)] + 1, d[at(i - 1, j - 1)] + (a[i] !== b[j] ? 1 : 0));
      if (i && j && a[i] === b[j - 1] && a[i - 1] === b[j]) v = Math.min(v, d[at(i - 2, j - 2)] + 1);
      d[at(i, j)] = v;
    }
  }
  return d[at(a.length - 1, b.length - 1)];
}

function asciiVariant(a, b) {
  if (a.length !== b.length || a === b) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !TR_PAIRS.has(a[i] + b[i])) return false;
  return true;
}

const closeKeys = (a, b) => {
  const [p, q] = [KEYS.get(a), KEYS.get(b)];
  return !p || !q || Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.6;
};

/** Same length: every difference is a swap of neighbours, a Turkish letter or a key next to the right one. */
function sameLengthSlip(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] === b[i + 1] && a[i + 1] === b[i]) i++;
    else if (!TR_PAIRS.has(a[i] + b[i]) && !CLOSE_FORMS.has(a[i] + b[i]) && !closeKeys(a[i], b[i])) return false;
  }
  return true;
}

/** Could fingers have turned the right word into this one? One letter too many or too few always can, two rarely do. */
export function isKeyboardSlip(wrong, right) {
  if (wrong.length === right.length) return sameLengthSlip(wrong, right);
  if (Math.abs(wrong.length - right.length) > 1) return false;
  const [long, short] = wrong.length > right.length ? [wrong, right] : [right, wrong];
  for (let i = 0; i < long.length; i++) if (sameLengthSlip(long.slice(0, i) + long.slice(i + 1), short)) return true;
  return false;
}

/** "kalıyo" → "kalıyor", or null. */
export function fullYorForm(w) {
  const m = SPOKEN_YOR.exec(w);
  return m ? w.slice(0, m.index) + "yor" + (YOR_ENDINGS[m[1]] ?? m[1] ?? "") : null;
}

function errorKind(wrong, right) {
  if (asciiVariant(wrong, right)) return [TURKISH_LETTER, null];
  if (wrong.length === right.length) {
    const f = [];
    for (let i = 0; i < right.length; i++) if (wrong[i] !== right[i]) f.push(i);
    if (f.length === 2 && f[1] === f[0] + 1 && wrong[f[0]] === right[f[1]] && wrong[f[1]] === right[f[0]]) {
      return [TRANSPOSITION, right.slice(f[0], f[1] + 1)];
    }
    if (f.length === 1) return ["wrong letter", right[f[0]] + "→" + wrong[f[0]]];
  }
  if (wrong.length === right.length - 1) {
    for (let i = 0; i < right.length; i++) if (right.slice(0, i) + right.slice(i + 1) === wrong) return [MISSING_LETTER, right[i]];
  }
  if (wrong.length === right.length + 1) {
    for (let i = 0; i < wrong.length; i++) if (wrong.slice(0, i) + wrong.slice(i + 1) === right) return ["extra letter", wrong[i]];
  }
  return ["multiple", null];
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const dictLines = (name) => readFileSync(join(import.meta.dirname, "sozluk", name), "utf8").split("\n").filter(Boolean);

export async function analyze(outDir, roots) {
  const started = Date.now();
  const { messages, known } = await collect(roots);

  const tr = new Map();
  for (const line of dictLines("tr.txt")) {
    const at = line.lastIndexOf(" ");
    tr.set(line.slice(0, at), Number(line.slice(at + 1)));
  }
  tr.delete("faklı"); // a typo that is common in subtitles too: don't count it as a dictionary word
  const en = new Set([...dictLines("en.txt"), ...dictLines("terms.txt")].map((s) => s.split(" ")[0]));

  // Project terms Claude knows that are not in the dictionary: their suffixed forms are correct too ("speyste", "appletler")
  const terms = new Set([...known].filter((w) => w.length >= 4 && !tr.has(w) && !en.has(w)));
  const startsWithTerm = (w) => {
    for (let n = 4; n <= w.length; n++) if (terms.has(w.slice(0, n))) return true;
    return false;
  };
  for (const w of known) if (!tr.has(w)) tr.set(w, 1000);
  const isStem = (w) => (w.length >= MIN_STEM && (en.has(w) || (tr.get(w) ?? 0) >= STEM_FREQUENCY)) || (tr.get(w) ?? 0) >= SHORT_STEM_FREQUENCY;
  /** The stem of a word with endings, or null. It is bare: "oyunlara" + "da" doesn't count, that is a typo of "oyunlarda". */
  const stemOf = (w, nested = false) => {
    for (let n = w.length - 1; n >= 2; n--) {
      const stem = w.slice(0, n), ending = w.slice(n);
      if (!ENDINGS.test(ending) || TWO_VOWELS.test(ending) || !isStem(stem) || /yor$/.test(stem)) continue;
      const person = /[cç][ıiuü](ki)?$/.test(ending);
      if (person && stem.length < MIN_PERSON_STEM) continue;
      if (ending[0] === "y" && !VOWEL.test(stem.at(-1))) continue; // this y only joins two vowels: "okyu"
      if (/^[dt]/.test(ending) && (ending[0] === "t") !== VOICELESS_END.test(stem)) continue;
      if (VOWEL.test(ending[0]) && VOWEL.test(stem.at(-1))) continue; // two vowels need a letter between them: "ekleü"
      if (nested || person || !stemOf(stem, true)) return stem; // "bakım" + "cı": a noun of its own, though "bak" + "ım" fits too
    }
    return null;
  };
  /** "ekliyorduk" comes from "ekle", though the list only has some forms of it; "açlışıyor" comes from nothing. */
  const isVerbForm = (full) => {
    const base = full.replace(/[ıiuü]yor[a-zçğıöşü]*$/, "");
    return base !== full && [base, base + "e", base + "a"].some((v) => (tr.get(v) ?? 0) >= STEM_FREQUENCY);
  };
  /** "kaldı" and "gelmiş" have a verb under them, "kedi" and "notu" don't: "kedimi" is a correct word, not "kedi mi". */
  const isConjugated = (w) => {
    if (isVerbForm(w)) return true;
    const m = PAST_OR_REPORTED.exec(w);
    if (!m) return false;
    const root = w.slice(0, m.index);
    return Math.max(tr.get(`${root}mak`) ?? 0, tr.get(`${root}mek`) ?? 0) >= STEM_FREQUENCY;
  };
  /** "kaldımı" → "kaldım mı", "geliyomu" → "geliyor mu": a question particle without its space. */
  const gluedQuestion = (w) => {
    const m = /m[ıiuü]$/.exec(w);
    if (!m || m.index < 4) return null;
    const base = w.slice(0, m.index), full = fullYorForm(base);
    if (full && (tr.has(full) || isVerbForm(full))) return `${full} ${m[0]}`;
    return (tr.get(base) ?? 0) >= 300 && isConjugated(base) ? `${base} ${m[0]}` : null;
  };

  const index = new Map();
  const ranked = [...tr.entries()].sort((a, b) => b[1] - a[1]).slice(0, 150000);
  for (const [w, n] of ranked) {
    if (w.length < 2 || w.length > 20 || (n < (w.length >= RARE_LONG_LENGTH ? RARE_LONG_FREQUENCY : 100) && !known.has(w))) continue;
    for (const s of deletions(w, w.length >= 5 ? 2 : 1)) {
      const list = index.get(s);
      if (list) list.push(w);
      else index.set(s, [w]);
    }
  }

  const cache = new Map();
  function correct(w, rare) {
    if (cache.has(w)) return cache.get(w);
    const limit = w.length >= TWO_EDITS_LENGTH ? 2 : 1;
    const sorted = [...w].sort().join("");
    const candidates = new Set();
    for (const s of deletions(w, w.length >= SAME_LETTERS_LENGTH ? 2 : limit)) for (const c of index.get(s) || []) candidates.add(c);
    candidates.delete(w);
    let best = null;
    for (const c of candidates) {
      let d;
      if (asciiVariant(w, c)) d = 0.5;
      else {
        d = distance(w, c);
        if (d === 1 && w.length === c.length && sorted === [...c].sort().join("")) d = 0.8;
      }
      if (c.length <= 3 && (tr.get(c) || 0) < 1000) continue; // short, rare candidates such as "gib", "ibi" give wrong corrections
      const freq = tr.get(c) || 0;
      const sameLetters = d === 2 && w.length >= SAME_LETTERS_LENGTH && w.length === c.length && sorted === [...c].sort().join("");
      if (!sameLetters && (d > limit || (!isKeyboardSlip(w, c) && !(d === 1 && !rare && w.length === c.length && freq >= VERY_COMMON)))) continue;
      // A swap beats another edit, unless the other word is far more common: "içn" is "için", not "çin"
      const close = best && Math.abs(d - best.d) <= 0.2;
      if (!best || (close ? freq >= best.freq * (d < best.d ? 0.1 : d > best.d ? 10 : 1) : d < best.d)) best = { d, freq, c };
    }
    let result = best ? best.c : null;
    if (rare && result && (best.d > 1 || (tr.get(result) || 0) < 50 * (tr.get(w) ?? 1))) result = null;
    cache.set(w, result);
    return result;
  }

  const wordsWrong = new Map(); // right → {wrong: count}
  const addWrong = (right, wrong) => {
    if (!wordsWrong.has(right)) wordsWrong.set(right, new Counter());
    wordsWrong.get(right).add(wrong);
  };
  const kinds = new Counter(), pairs = new Counter(), missing = new Counter(), hands = new Counter();
  const daily = new Map();
  let total = 0;
  for (const [time, raw] of messages) {
    const day = time.slice(0, 10);
    if (!daily.has(day)) daily.set(day, [0, 0]);
    const counts = daily.get(day);
    const tokens = words(clean(raw));
    let i = 0;
    while (i < tokens.length) {
      const w = tokens[i++];
      if (w.length < 2) continue;
      total++;
      counts[0]++;
      if (w.length < 3 || SPOKEN.test(w) || known.has(w) || en.has(w) || startsWithTerm(w)) continue;
      const full = fullYorForm(w);
      if (full && (tr.has(full) || isVerbForm(full))) continue;
      const rare = tr.has(w);
      if (rare && tr.get(w) >= 300) continue;
      const question = gluedQuestion(w);
      if (question) {
        addWrong(question, w);
        kinds.add("shifted space");
        counts[1]++;
        continue;
      }
      // shifted space: "miy apsak" → "mi yapsak", "y ada" → "ya da"
      if (!rare && i < tokens.length) {
        const n = tokens[i];
        let found = null;
        for (const [a, b] of [[w.slice(0, -1), w.slice(-1) + n], [w + n.slice(0, 1), n.slice(1)]]) {
          if (tr.get(a) > 50 && tr.get(b) > 50) {
            found = `${a} ${b}`;
            break;
          }
        }
        if (found) {
          addWrong(found, `${w} ${n}`);
          kinds.add("shifted space");
          counts[1]++;
          i++;
          continue;
        }
      }
      const right = correct(full || w, rare);
      if (!right) continue;
      const [kind, detail] = errorKind(full || w, right);
      const stem = stemOf(w);
      if (stem && kind !== TRANSPOSITION && (tr.get(right) || 0) < DOMINANT * (tr.get(stem) ?? Infinity)) continue; // "gridin" is still "girdin"
      addWrong(right, w);
      kinds.add(kind);
      counts[1]++;
      if (kind === TRANSPOSITION) {
        pairs.add(detail);
        // the keys of `eller` are stored data (the page counts them, they are never shown), so they stay as they are
        hands.add(LEFT_HAND.has(detail[0]) !== LEFT_HAND.has(detail[1]) ? "iki el" : "aynı el");
      } else if (kind === MISSING_LETTER) {
        missing.add(detail);
      }
    }
  }

  const list = [...wordsWrong.entries()]
    .map(([right, v]) => [right, [...v.values()].reduce((a, b) => a + b, 0), v.mostCommon(6)])
    .sort((a, b) => b[1] - a[1]);
  const result = {
    uretildi: stamp(),
    sure_sn: Math.round((Date.now() - started) / 100) / 10,
    mesaj: messages.length,
    kelime: total,
    hata: [...kinds.values()].reduce((a, b) => a + b, 0),
    turler: kinds.mostCommon(),
    ciftler: pairs.mostCommon(24),
    eller: Object.fromEntries(hands),
    eksik_harfler: missing.mostCommon(12),
    kelimeler: list.slice(0, 400),
    gunluk: [...daily.entries()].filter(([g]) => g).sort(([a], [b]) => (a < b ? -1 : 1)).map(([g, [count, errors]]) => [g, count, errors]),
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "sonuc.json"), JSON.stringify(result));
  const lines = [
    "# Words I misspell",
    "",
    `Generated by the Typing applet (${result.uretildi}); don't edit by hand, it is rewritten on every run.`,
    `${result.mesaj} messages, ${total} words, ${result.hata} errors.`,
    "",
    "| Correct | Times | Written as |",
    "|---|---|---|",
    ...list.slice(0, 400).map(([d, n, forms]) => `| ${d} | ${n} | ${forms.map(([b]) => b).join(", ")} |`),
  ];
  writeFileSync(join(outDir, "kelimeler.md"), lines.join("\n") + "\n");
  return result;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const [outDir, ...roots] = process.argv.slice(2);
  await analyze(outDir, roots.length ? roots : [...new Set([join(homedir(), ".claude"), process.env.CLAUDE_CONFIG_DIR].filter(Boolean))]);
}
