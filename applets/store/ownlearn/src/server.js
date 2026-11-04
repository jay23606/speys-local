// Local web UI: http://localhost:4792. Binds to 127.0.0.1 only; nothing is sent anywhere.
// Every API call names its module (?m=sql); each module keeps its own progress file.
import { createServer } from "node:http";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { answer, dataDir, readJson, session, today, writeJson } from "./learn.js";
import { loadCourse } from "./course.js";

const UI = join(import.meta.dirname, "ui", "index.html");

const pick = (text, lang) => (text && typeof text === "object" ? text[lang] || text.en : text);

/** Standalone server for `bin/ownlearn.js`. */
export function serve({ port = 4792, ...options }) {
  const server = createServer(handler(options));
  server.listen(port, "127.0.0.1");
  return server;
}

/**
 * `scanned`: [{ mod, map }] for the modules this repo has, in the order they are shown.
 * `lang`: a language, or a function asked on every request when the language can change while running.
 */
export function handler({ root, scanned, lang: language = "en" }) {
  const languageNow = () => (typeof language === "function" ? language() : language);
  // the language of the request being served; views read it synchronously
  let lang = languageNow();
  const dir = dataDir(root);
  // before modules existed SQL progress lived in progress.json
  if (existsSync(join(dir, "progress.json")) && !existsSync(join(dir, "progress-sql.json"))) {
    renameSync(join(dir, "progress.json"), join(dir, "progress-sql.json"));
  }
  const progressFile = (mod) => join(dir, `progress-${mod.id}.json`);
  const load = (mod) => readJson(progressFile(mod), { topics: {}, log: [] });
  const save = (mod, progress) => writeJson(progressFile(mod), progress);
  // read on every call: a course Claude writes while the page is open shows up on reload
  const course = (mod) => loadCourse(dir, mod);

  const topicView = (mod, map, t, progress) => {
    const m = map.topics[t.id];
    const s = progress.topics[t.id];
    return {
      id: t.id, level: t.level, name: pick(t.name, lang), explain: pick(t.explain, lang), why: pick(t.why, lang),
      count: m.count, files: m.files.length, example: m.examples[0] ? { ...m.examples[0], context: undefined } : null,
      box: s?.box ?? null, right: s?.right ?? 0, wrong: s?.wrong ?? 0, due: s?.due ?? null,
    };
  };

  const state = ({ mod, map }) => {
    const progress = load(mod);
    const s = session(mod, map, progress);
    return {
      lang, root, module: mod.name, scannedAt: map.scannedAt, files: map.files, statements: map.statements, today: today(),
      answeredToday: s.answeredToday,
      topics: mod.topics.map((t) => topicView(mod, map, t, progress)),
      questions: s.questions.map(({ topic, variant, example, order }) => {
        const t = mod.topics.find((x) => x.id === topic);
        const q = t.questions[variant];
        return {
          topic, variant, name: pick(t.name, lang), q: pick(q.q, lang), order,
          options: order.map((i) => pick(q.options[i], lang)),
          example: { ...example, context: undefined },
        };
      }),
    };
  };

  /** Notebook: slips the tool noticed, per lesson, and your own notes. */
  const notesView = (mod, progress) => ({
    auto: (progress.notes || []).map((n) => {
      const m = mod.mistakes.find((x) => x.id === n.rule);
      const l = course(mod).lessons.find((x) => x.id === n.lesson);
      return { ...n, title: pick(m?.title, lang), explain: pick(m?.explain, lang), lessonTitle: pick(l?.title, lang) };
    }),
    own: progress.own || {},
  });

  const lessonView = ({ mod, map }) => {
    const progress = load(mod);
    const c = course(mod);
    // each lesson runs on a practice database: the general one, the repo's copy, or a query's own tables
    const schemas = [], at = (schema) => (schemas.includes(schema) ? schemas : schemas.push(schema) && schemas).indexOf(schema);
    const lessons = c.lessons.map((l) => lesson(mod, map, l, progress.lessons?.[l.id], at(l.schema)));
    return {
      notes: notesView(mod, progress),
      lang,
      courseSource: c.source,
      packages: (mod.packages || []).map((p) => ({ id: p.id, repo: !!p.repo, title: pick(p.title, lang), about: pick(p.about, lang) })),
      schemas: schemas.map((s) => mod.tableInfo(s)),
      // the order to write a query in; a module without one shows none
      writing: mod.writing ? {
        intro: pick(mod.writing.intro, lang),
        steps: mod.writing.steps.map((s) => ({ id: s.id, kw: s.kw, q: pick(s.q, lang), how: pick(s.how, lang) })),
      } : null,
      lessons,
    };
  };

  const lesson = (mod, map, l, p, tablesAt) => {
        const ex = l.topic && map.topics[l.topic]?.examples[0];
        const base = { id: l.id, pkg: l.pkg, source: l.source, tablesAt, title: pick(l.title, lang), done: p?.done ?? null };
        if (l.read) {
          const sql = l.anatomy.lines.map((x) => x.sql).join("\n");
          return {
            ...base, read: true, explain: pick(l.explain, lang), focus: [], steps: [],
            anatomy: {
              goal: pick(l.anatomy.goal, lang), result: mod.check(l.schema, sql),
              lines: l.anatomy.lines.map((x) => ({ sql: x.sql, why: pick(x.why, lang), step: mod.annotate ? mod.annotate(x.sql)[0].step : null })),
            },
          };
        }
        return {
          ...base, explain: pick(l.explain, lang), task: pick(l.task, lang),
          // example results come with the page: no "try it" button, the answer is right under the query
          examples: (l.examples || (l.example ? [{ sql: l.example }] : [])).map((e) => ({ sql: e.sql, note: pick(e.note, lang) || null, result: mod.check(l.schema, e.sql) })),
          hasVisual: !!l.visual,
          focus: l.focus || [], steps: mod.stepsOf ? mod.stepsOf(l.solution) : [],
          wants: mod.wants ? mod.wants(l.schema, l.solution) : [],
          expected: mod.check(l.schema, l.solution),
          hint: pick(l.hint, lang), solution: l.solution, ordered: !!l.ordered, tries: p?.tries ?? 0,
          mine: ex ? { ...ex, context: undefined } : null, mineCount: l.topic ? map.topics[l.topic]?.count ?? 0 : 0,
          // a query from your own repo: where it is, what it is for, its parts with why
          yours: l.yours ? {
            file: l.from.file, line: l.from.line || 1, code: l.from.code, purpose: pick(l.purpose, lang),
            walk: l.walk.map((w) => ({ code: w.code, why: pick(w.why, lang) })), practice: pick(l.practice, lang) || null,
          } : null,
        };
  };

  const run = async ({ mod }, { sql, lesson: id }) => {
    const asked = lang; // another request may run during the query
    const c = course(mod);
    const lesson = id && c.lessons.find((l) => l.id === id);
    const text = String(sql || "");
    const r = await mod.checkLimited(lesson ? lesson.schema : c.lessons[0].schema, text, lesson);
    lang = asked;
    if (r.limit) r.error = pick({ en: r.error, tr: "Bu sorgu çok uzun sürdü ya da çok büyüdü, durduruldu." }, lang);
    if (lesson) {
      const progress = load(mod);
      const p = ((progress.lessons ||= {})[lesson.id] ||= { tries: 0, done: null });
      p.tries++;
      if (r.ok && !p.done) p.done = today();
      // slips go to the notebook, one note per lesson and slip; repeats only count up
      r.mistakes = mod.findMistakes(text).map(({ id: rule, hit }) => {
        const notes = (progress.notes ||= []);
        let n = notes.find((x) => x.lesson === lesson.id && x.rule === rule);
        if (!n) notes.push((n = { lesson: lesson.id, rule, first: today(), count: 0 }));
        Object.assign(n, { wrote: hit.wrote, fixed: hit.fixed, last: today(), count: n.count + 1 });
        const m = mod.mistakes.find((x) => x.id === rule);
        return { rule, ...hit, title: pick(m.title, lang), explain: pick(m.explain, lang), count: n.count };
      });
      save(mod, progress);
    }
    return r;
  };

  /** A lesson to read is done when you say so. */
  const done = ({ mod }, { lesson }) => {
    if (!course(mod).lessons.some((l) => l.id === lesson && l.read)) throw new Error("not a lesson to read");
    const progress = load(mod);
    const p = ((progress.lessons ||= {})[lesson] ||= { tries: 0, done: null });
    p.done ||= today();
    save(mod, progress);
    return { done: p.done };
  };

  const note = ({ mod }, { lesson, text }) => {
    if (!course(mod).lessons.some((l) => l.id === lesson)) throw new Error("unknown lesson");
    const progress = load(mod);
    progress.own ||= {};
    if (String(text || "").trim()) progress.own[lesson] = { text: String(text).trim(), date: today() };
    else delete progress.own[lesson];
    save(mod, progress);
    return notesView(mod, progress);
  };

  const reply = ({ mod }, { topic, variant, choice }) => {
    const progress = load(mod);
    const r = answer(mod, progress, topic, variant, choice);
    save(mod, progress);
    return { ...r, explain: pick(mod.topics.find((x) => x.id === topic).explain, lang) };
  };

  const visual = ({ mod }, id) => {
    // the lesson's picture: its queries run on the sandbox, the browser draws them
    const l = course(mod).lessons.find((x) => x.id === id);
    const v = l?.visual;
    if (!v) return null;
    const q = (sql) => (sql ? mod.check(l.schema, sql) : null);
    const table = (sql) => (sql && /\bFROM\s+([\w.]+)/i.exec(sql)?.[1]) || null;
    return { ...v, note: pick(v.note, lang) || null, source: q(v.source), result: q(v.result), left: q(v.left), right: q(v.right),
      leftName: table(v.left), rightName: table(v.right) };
  };

  const send = (res, code, body, type = "application/json; charset=utf-8") => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const post = (req, res, fn) => {
    const asked = lang; // another request may run while the body arrives
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      lang = asked;
      try {
        send(res, 200, await fn(JSON.parse(body || "{}")));
      } catch (e) {
        send(res, 400, { error: String(e.message || e) });
      }
    });
  };

  return (req, res) => {
    const host = (req.headers.host || "").split(":")[0];
    if (host !== "localhost" && host !== "127.0.0.1") return send(res, 403, { error: "host" });
    lang = languageNow();
    const url = new URL(req.url, "http://localhost");
    const s = scanned.find((x) => x.mod.id === url.searchParams.get("m")) || scanned[0];
    try {
      if (req.method === "GET") {
        if (url.pathname === "/") return send(res, 200, readFileSync(UI), "text/html; charset=utf-8");
        if (url.pathname === "/api/modules") {
          return send(res, 200, scanned.map(({ mod, map }) => ({ id: mod.id, name: mod.name, files: map.files, statements: map.statements })));
        }
        if (url.pathname === "/api/state") return send(res, 200, state(s));
        if (url.pathname === "/api/lessons") return send(res, 200, lessonView(s));
        if (url.pathname === "/api/visual") {
          const v = visual(s, url.searchParams.get("lesson"));
          return v ? send(res, 200, v) : send(res, 404, { error: "no visual" });
        }
      }
      if (req.method === "POST") {
        // Running standalone there is no dashboard in front: another site must not be able to post here
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: "origin" });
        if (url.pathname === "/api/run") return post(req, res, (b) => run(s, b));
        if (url.pathname === "/api/note") return post(req, res, (b) => note(s, b));
        if (url.pathname === "/api/done") return post(req, res, (b) => done(s, b));
        if (url.pathname === "/api/answer") return post(req, res, (b) => reply(s, b));
      }
      send(res, 404, { error: "not found" });
    } catch (e) {
      send(res, 500, { error: String(e.message || e) });
    }
  };
}
