// Typing: keyboard errors and practice. The analysis is heavy, so it runs in a separate process, at most once an hour;
// the server returns the old result and produces the new one in the background. Data folder comes from the settings:
// settings.json → "yazim".dataFolder.
import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const INTERVAL_MS = 3600_000;
const LOCK_MAX_MS = 600_000;

const expand = (p) => (p?.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const ageMs = (file) => Date.now() - statSync(file).mtimeMs;

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((done, fail) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => done(body));
    req.on("error", fail);
  });
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function create({ dataDir, settings, t }) {
  const folder = () => expand(settings().dataFolder) || dataDir;

  function refresh(dir) {
    const lock = join(dir, ".calisiyor");
    closeSync(openSync(lock, "a"));
    const now = new Date();
    utimesSync(lock, now, now);
    const child = spawn(process.execPath, ["--max-old-space-size=4096", join(import.meta.dirname, "analyze.js"), dir, ...(settings().claudeFolders || []).map(expand)], {
      detached: true,
      stdio: "ignore",
    });
    const done = () => rmSync(lock, { force: true });
    child.on("exit", done);
    child.on("error", done);
    child.unref();
  }

  function overview() {
    const dir = folder();
    mkdirSync(dir, { recursive: true });
    const result = join(dir, "sonuc.json");
    const lock = join(dir, ".calisiyor");
    const stale = !existsSync(result) || ageMs(result) > INTERVAL_MS;
    let running = existsSync(lock) && ageMs(lock) < LOCK_MAX_MS;
    if (stale && !running) {
      refresh(dir);
      running = true;
    }
    const data = existsSync(result) ? JSON.parse(readFileSync(result, "utf8")) : {};
    data.yenileniyor = running;
    const practice = join(dir, "alistirmalar.jsonl");
    data.alistirmalar = existsSync(practice)
      ? readFileSync(practice, "utf8").split("\n").filter(Boolean).slice(-60).map((s) => JSON.parse(s))
      : [];
    return data;
  }

  /** A practice result; only numbers and short words are saved. */
  function savePractice(d) {
    const dir = folder();
    mkdirSync(dir, { recursive: true });
    const row = {
      zaman: stamp(),
      kelime: Math.trunc(Number(d.kelime)),
      dogru: Math.trunc(Number(d.dogru)),
      kdk: Math.round(Number(d.kdk) * 10) / 10,
      ritim: Math.round(Number(d.ritim) * 10) / 10,
      hatalar: (d.hatalar || []).slice(0, 60).map(([a, b]) => [String(a).slice(0, 40), String(b).slice(0, 40)]),
    };
    if ([row.kelime, row.dogru, row.kdk, row.ritim].some(Number.isNaN)) throw new Error(t("invalid result"));
    appendFileSync(join(dir, "alistirmalar.jsonl"), JSON.stringify(row) + "\n");
  }

  return async (req, res) => {
    const path = req.url.split("?")[0];
    if (req.method === "GET" && path === "/") {
      return send(res, 200, readFileSync(join(import.meta.dirname, "index.html")), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && path === "/api/yazim") return send(res, 200, overview());
    if (req.method === "POST" && path === "/api/yazim/alistirma") {
      if (req.headers["x-panel"] !== "1") return send(res, 403, { error: t("not allowed") });
      try {
        savePractice(JSON.parse((await readBody(req)) || "{}"));
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
      }
    }
    send(res, 404, { error: t("not found") });
  };
}
