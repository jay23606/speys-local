// Claude: the status of sessions. Settings: settings.json → "claude" (folders, eventsFile, projectsRoot); defaults when empty.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { archiveReader } from "./archived.js";
import { sessions } from "./sessions.js";
import { hookInstalled, installHook, removeHook } from "./install-hook.js";
import { NONE, chosenSounds, listSounds, soundPath, soundsFolder } from "./sounds.js";

const expand = (p) => (p?.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const FURNITURE = ["clock", "painting", "whiteboard", "plant", "coffee", "cooler", "shelf", "lamp", "cat"];

/** On Windows a virus scanner or another reader can hold the file for a moment, and renaming over it fails. */
export function renameWithRetry(from, to, rename = renameSync, wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)) {
  for (let attempt = 0; ; attempt++) {
    try {
      return rename(from, to);
    } catch (e) {
      if (attempt >= 5 || !["EPERM", "EACCES", "EBUSY"].includes(e.code)) throw e;
      wait(50);
    }
  }
}

function defaultFolders() {
  const paths = [join(homedir(), ".claude"), process.env.CLAUDE_CONFIG_DIR].filter(Boolean);
  return [...new Set(paths)].filter((p) => existsSync(p)).map((path, i) => ({ path, label: i ? basename(path) : "Claude" }));
}

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

export default function create({ dataDir, settings, baseDir, t }) {
  // Sound and the hook belong to the computer, not to a workspace: the hook runs outside the dashboard and reads the base folder.
  const home = baseDir;
  const baseFile = join(home, "settings.json");
  const readBase = () => {
    try {
      return JSON.parse(readFileSync(baseFile, "utf8"));
    } catch {
      return {};
    }
  };
  const baseClaude = () => readBase().claude || {};
  function saveBaseClaude(change) {
    const all = readBase();
    all.claude = { ...all.claude, ...change };
    mkdirSync(home, { recursive: true });
    writeFileSync(`${baseFile}.new`, JSON.stringify(all, null, 2) + "\n");
    renameWithRetry(`${baseFile}.new`, baseFile);
  }
  /** The real Claude folders: never the demo's made-up ones. */
  const claudeFolders = () => {
    const own = baseClaude().folders;
    return own ? own.map((f) => expand(f.path)) : defaultFolders().map((f) => f.path);
  };
  const archived = archiveReader();
  const hookFile = join(import.meta.dirname, "hook.js");
  // On by default; the switch on the page turns it off for good.
  let hookFailed = [];
  if (!baseClaude().hookOff) hookFailed = installHook(claudeFolders(), hookFile);
  const options = () => {
    const s = settings();
    return {
      folders: s.folders ? s.folders.map((f) => ({ ...f, path: expand(f.path) })) : defaultFolders(),
      eventsFile: expand(s.eventsFile) || join(dataDir, "olaylar.jsonl"),
      projectsRoot: expand(s.projectsRoot) || homedir(),
    };
  };

  return async (req, res) => {
    const path = req.url.split("?")[0];
    if (req.method === "GET" && path === "/") {
      return send(res, 200, readFileSync(join(import.meta.dirname, "index.html")), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && path === "/api/oturumlar") return send(res, 200, sessions({ ...options(), t, hidden: archived() }));
    if (req.method === "GET" && path === "/api/sounds") {
      return send(res, 200, {
        options: listSounds(home), chosen: chosenSounds(home, baseClaude().sounds), none: NONE, folder: relative(resolve(import.meta.dirname, "..", "..", ".."), soundsFolder(home)).split(sep).join("/"),
        canPlay: process.platform === "darwin", hook: hookInstalled(claudeFolders()), hookFailed: hookFailed.map((f) => f.replace(homedir(), "~")),
      });
    }
    if (req.method === "GET" && path === "/api/office") return send(res, 200, { items: baseClaude().officeItems ?? FURNITURE });
    if (req.method === "POST" && path === "/api/office") {
      if (req.headers["x-panel"] !== "1") return send(res, 403, { error: "forbidden" });
      const { items } = JSON.parse((await readBody(req)) || "{}");
      if (!Array.isArray(items)) return send(res, 400, { error: "items must be a list" });
      saveBaseClaude({ officeItems: FURNITURE.filter((id) => items.includes(id)) });
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && path.startsWith("/api/sounds")) {
      if (req.headers["x-panel"] !== "1") return send(res, 403, { error: "forbidden" });
      const q = JSON.parse((await readBody(req)) || "{}");
      if (path === "/api/sounds/hook") {
        saveBaseClaude({ hookOff: !q.on });
        if (q.on) hookFailed = installHook(claudeFolders(), hookFile);
        else {
          hookFailed = [];
          removeHook(claudeFolders());
        }
        return send(res, 200, { ok: true });
      }
      if (path === "/api/sounds/play") {
        const file = process.platform === "darwin" && soundPath(home, q.id);
        if (!file) return send(res, 400, { error: "cannot play this sound" });
        execFile("afplay", [file], () => {});
        return send(res, 200, { ok: true });
      }
      if (!["done", "approval"].includes(q.event) || (q.id !== NONE && !soundPath(home, q.id))) return send(res, 400, { error: "unknown sound" });
      saveBaseClaude({ sounds: { ...baseClaude().sounds, [q.event]: q.id } });
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: t("Not found") });
  };
}
