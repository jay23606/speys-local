// Core: finds applets in folders, serves the sidebar, mounts each applet under /a/<id>/.
// Binds to 127.0.0.1 only; nothing is sent out.
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { SOURCE_LANGUAGE, messagesOf, translator } from "../lib/i18n.js";
import { seedDemo } from "./demo.js";
import { screenshotFile, screenshots, startingInstalled } from "./store.js";

const ROOT = resolve(import.meta.dirname, "..");
// Everything lives next to the code, out of git. A workspace is its own settings.json and applet data under apps/<id>:
// data/ is the everyday one ("main"), any other sits beside it as data.<id>; data.demo is rebuilt from core/demo.js.
const BASE = process.env.SPEYS_LOCAL_HOME || join(ROOT, "data");
const MAIN = "main", DEMO = "demo";
const SIBLING = `${basename(BASE)}.`;
const workspaceFolder = (id) => (id === MAIN ? BASE : join(dirname(BASE), SIBLING + id));
const ACTIVE_FILE = join(BASE, "workspace.json");

/** Before November 2026 every workspace was a folder inside data/ (data/main, data/demo): moves them once. */
function moveOldWorkspaces() {
  const old = join(BASE, MAIN);
  if (!existsSync(old) || existsSync(join(BASE, "settings.json"))) return;
  for (const f of readdirSync(BASE)) {
    if (f === MAIN || f.startsWith(".") || !statSync(join(BASE, f)).isDirectory()) continue;
    if (!existsSync(workspaceFolder(f))) renameSync(join(BASE, f), workspaceFolder(f));
  }
  for (const f of readdirSync(old)) {
    if (!existsSync(join(BASE, f))) renameSync(join(old, f), join(BASE, f));
  }
  try {
    rmdirSync(old); // anything left had a name already taken in data/, and stays where it was
  } catch {
    // not empty
  }
}
mkdirSync(BASE, { recursive: true });
moveOldWorkspaces();
for (const folder of [BASE, workspaceFolder(DEMO)]) {
  try {
    if (existsSync(folder)) chmodSync(folder, 0o700); // settings and data are for this account only
  } catch {
    // a filesystem without permissions
  }
}
let DATA, SETTINGS;
function enterWorkspace(id) {
  DATA = workspaceFolder(id);
  SETTINGS = join(DATA, "settings.json");
  process.env.SPEYS_LOCAL_HOME = DATA; // lib/search-console.js reads its settings from here
}
const activeWorkspace = () => {
  try {
    const { active } = JSON.parse(readFileSync(ACTIVE_FILE, "utf8"));
    return active === MAIN || existsSync(workspaceFolder(active)) ? active : MAIN;
  } catch {
    return MAIN;
  }
};
enterWorkspace(activeWorkspace());
const STORE_DIR = join(ROOT, "applets", "store");

/**
 * The folder sets visibility. `applets/store/` is in git: everyone gets it, and an applet there shows up once it is
 * installed from the Store. `applets/custom/` stays out of git, so it cannot reach others by accident.
 */
const SOURCES = [
  { dir: join("applets", "store"), visibility: "store" },
  { dir: join("applets", "custom"), visibility: "custom" },
];
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const readSettings = () => {
  try {
    return JSON.parse(readFileSync(SETTINGS, "utf8"));
  } catch {
    return {};
  }
};

function writeAppletSettings(id, value) {
  mkdirSync(DATA, { recursive: true });
  const all = readSettings();
  all[id] = value;
  writeFileSync(SETTINGS, JSON.stringify(all, null, 2) + "\n");
}

function readFolder({ dir, visibility }) {
  const base = join(ROOT, dir), found = [];
  if (!existsSync(base)) return found;
  for (const id of readdirSync(base)) {
    const folder = join(base, id);
    const file = join(folder, "applet.json");
    if (id.startsWith(".") || !statSync(folder).isDirectory() || !existsSync(file)) continue;
    try {
      found.push({ ...JSON.parse(readFileSync(file, "utf8")), id, folder, visibility }); // the manifest cannot set these
    } catch (e) {
      found.push({ id, folder, visibility, name: id, error: `Could not read applet.json: ${e.message}` });
    }
  }
  return found;
}

const byOrder = (a, b) => (a.order ?? 100) - (b.order ?? 100);

/** Custom is read after the Store: a copy with the same id replaces the Store applet. */
function findApplets() {
  const found = new Map();
  for (const source of SOURCES) for (const a of readFolder(source)) found.set(a.id, a);
  return [...found.values()].sort(byOrder);
}

/** Every Store applet, also one a custom copy replaces. */
const storeApplets = () => readFolder(SOURCES[0]).sort(byOrder);

/**
 * A backend loads on its first request: the dashboard opens fast and an unopened applet holds no memory.
 * A broken applet does not take the core down; its error shows on its own page.
 */
function loadBackend(applet) {
  applet.loading ||= (async () => {
    try {
      const { default: create } = await import(pathToFileURL(join(applet.folder, applet.backend)).href);
      const dataDir = join(DATA, "apps", applet.id);
      mkdirSync(dataDir, { recursive: true });
      applet.handle = await create({
        dataDir,
        settings: () => readSettings()[applet.id] || {},
        saveSettings: (value) => writeAppletSettings(applet.id, value),
        t: translatorOf(applet),
        language: () => activeLanguage,
        baseDir: workspaceFolder(MAIN),
      });
    } catch (e) {
      applet.error = `Could not load the backend: ${e.message}`;
    }
  })();
  return applet.loading;
}

const iconOf = (applet) => {
  try {
    return applet.icon ? readFileSync(join(applet.folder, applet.icon), "utf8") : null;
  } catch {
    return null;
  }
};

// —— language: the setting, or the browser's language; a language needs core/locales/<lang>.json
const CORE_FOLDER = import.meta.dirname;
const availableLanguages = () => {
  const dir = join(CORE_FOLDER, "locales");
  return [SOURCE_LANGUAGE, ...(existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [])];
};
function languageOf(req) {
  const available = availableLanguages();
  const chosen = readSettings()._dashboard?.language;
  if (available.includes(chosen)) return chosen;
  for (const part of (req.headers["accept-language"] || "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (available.includes(code)) return code;
  }
  return SOURCE_LANGUAGE;
}
/** The language of the request being served; a backend's `t` uses it. */
let activeLanguage = SOURCE_LANGUAGE;
const translatorOf = (applet) => translator(() => messagesOf(applet.folder, activeLanguage));

const publicView = (applet, shown = shownApplets(), t = translatorOf(applet)) => ({
  id: applet.id,
  enabled: shown(applet),
  name: applet.name || applet.id, // applet names are the same in every language
  description: applet.description ? t(applet.description) : "",
  icon: iconOf(applet),
  visibility: applet.visibility,
  dashboard: !!applet.dashboard,
  url: applet.url || `/a/${applet.id}/`,
  error: applet.error || null,
});

const BOOT = Date.now();
const mtime = (file) => {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};
const CORE_PAGES = ["ui.html", "settings.html", "store.html", "kit.css", "kit.js", "logo.svg"].map((f) => join(import.meta.dirname, f));

/** Page file times: when one changes, the browser reloads it by itself. */
function versionView(applets) {
  return {
    boot: BOOT,
    core: Math.max(...CORE_PAGES.map(mtime), mtime(join(CORE_FOLDER, "locales", `${activeLanguage}.json`))),
    pages: Object.fromEntries(applets.map((a) => [a.id, Math.max(mtime(join(a.folder, a.page || "index.html")), mtime(join(a.folder, "locales", `${activeLanguage}.json`)))])),
    update: autoCheckOn() ? updateWaiting : null,
  };
}

const jsFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => join(dir, f)) : []);
const serverCode = (applets) => [
  ...jsFiles(import.meta.dirname), ...jsFiles(join(ROOT, "lib")),
  ...applets.flatMap((a) => jsFiles(a.folder)),
];
const serverStamp = (applets) => Math.max(0, ...serverCode(applets).map(mtime));

const expandHome = (p) => (typeof p === "string" && p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o ConnectTimeout=10" };

function git(args, timeout = 30_000) {
  return new Promise((done, fail) => {
    execFile("git", ["-C", ROOT, ...args], { env: GIT_ENV, timeout, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) fail(new Error((stderr || error.message).trim().split("\n").at(-1)));
      else done(stdout.trim());
    });
  });
}

// The automatic check only fetches and asks: getting the update stays a click. It waits after startup to keep opening light.
const UPDATE_FIRST_CHECK = 60_000, UPDATE_CHECK_EVERY = 60 * 60_000;
const autoCheckOn = () => readSettings()._dashboard?.autoUpdateCheck !== false;
let updateChecked = false, updateWaiting = null, fetching = null;

async function waitingCommits() {
  const log = await git(["log", "--format=%h|%cs|%s", "HEAD..@{u}"]);
  return log ? log.split("\n").map((l) => {
    const [hash, day, ...m] = l.split("|");
    return { hash, date: day, message: m.join("|") };
  }) : [];
}

/** Version info; with `check` it asks the remote, otherwise it only reads what the last check brought. */
async function updateStatus(check) {
  if (!existsSync(join(ROOT, ".git"))) return { git: false };
  const [head, branch, changes] = await Promise.all([
    git(["log", "-1", "--format=%h|%cs"]), git(["branch", "--show-current"]), git(["status", "--porcelain"]),
  ]);
  const [version, date] = head.split("|");
  const out = { git: true, version, date, branch, changes: changes ? changes.split("\n").length : 0, autoCheck: autoCheckOn() };
  if (check) {
    await (fetching ??= git(["fetch", "--quiet"], 60_000).finally(() => { fetching = null; }));
    out.commits = await waitingCommits();
    updateChecked = true;
  } else if (updateChecked) {
    out.commits = await waitingCommits().catch(() => []);
  } else {
    return out;
  }
  out.checked = true;
  updateWaiting = out.commits.length ? { count: out.commits.length, latest: out.commits[0].hash } : null;
  return out;
}

function backgroundCheck() {
  updateStatus(true).catch(() => { /* offline or no upstream: the next round tries again */ });
}

function setAutoCheck(on) {
  const all = readSettings();
  const panel = (all._dashboard ??= {});
  if (on) delete panel.autoUpdateCheck;
  else panel.autoUpdateCheck = false;
  writeAll(all);
  if (on) backgroundCheck();
}

/** Fast-forward only: local changes are never overwritten, a conflict returns an error. Restarts under launchd. */
async function applyUpdate() {
  try {
    await git(["pull", "--ff-only", "--quiet"], 120_000);
  } catch (e) {
    if (/Aborting|overwritten|Not possible to fast-forward|diverging/i.test(e.message)) {
      throw new Error(coreT("Conflicts with local changes, nothing was changed. Have Claude sort it out."));
    }
    throw e;
  }
  const managed = process.env.XPC_SERVICE_NAME === "app.speys.local";
  if (managed) setTimeout(() => process.exit(0), 300);
  return { ok: true, restarting: managed };
}

const slugOf = (name) => String(name).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const coreT = (text, values) => translator(() => messagesOf(CORE_FOLDER, activeLanguage))(text, values);

/** Settings page: each applet's applet.json → settings schema + the values on this machine. */
function settingsView(applets) {
  const all = readSettings();
  return {
    file: SETTINGS,
    applets: applets.filter((a) => (a.settings || []).length && shownApplets()(a)).map((a) => {
      const t = translatorOf(a);
      return {
        id: a.id, name: a.name || a.id, visibility: a.visibility, icon: iconOf(a),
        fields: a.settings.map((f) => {
          const section = f.section || a.id;
          const value = all[section]?.[f.key];
          const exists = f.type === "path" && value ? existsSync(expandHome(value)) : undefined;
          return { ...f, label: t(f.label), hint: f.hint && t(f.hint), placeholder: f.placeholder && t(f.placeholder), section, value, exists };
        }),
      };
    }),
  };
}

/**
 * A Store applet shows up once it is installed; a custom one unless it is turned off. Removing or turning one off keeps
 * its data. A Store applet that isn't installed also has no page and no endpoints; a turned-off custom one keeps them.
 */
function shownApplets() {
  const panel = readSettings()._dashboard || {};
  const installed = new Set(panel.installed || []), disabled = new Set(panel.disabled || []);
  return (a) => (a.visibility === "custom" ? !disabled.has(a.id) : installed.has(a.id));
}

function setListed(list, id, on) {
  const all = readSettings();
  const panel = (all._dashboard ??= {});
  const set = new Set(panel[list] || []);
  on ? set.add(id) : set.delete(id);
  panel[list] = [...set].sort();
  writeAll(all);
}

/** A workspace gets its installed list once, the first time it is opened; `disabled` keeps only custom applets after that. */
function ensureInstalled() {
  const all = readSettings();
  if (Array.isArray(all._dashboard?.installed)) return;
  const panel = (all._dashboard ??= {});
  const store = storeApplets();
  panel.installed = startingInstalled(store, { inUse: existsSync(SETTINGS), disabled: panel.disabled || [] });
  if (panel.disabled) panel.disabled = panel.disabled.filter((id) => !store.some((a) => a.id === id));
  writeAll(all);
}

function writeAll(all) {
  mkdirSync(DATA, { recursive: true });
  const temp = `${SETTINGS}.new`;
  writeFileSync(temp, JSON.stringify(all, null, 2) + "\n");
  renameSync(temp, SETTINGS);
}

/** Empty means "follow the browser". */
function setLanguage(language) {
  if (language && !availableLanguages().includes(language)) throw new Error(`Unknown language: ${language}`);
  const all = readSettings();
  const panel = (all._dashboard ??= {});
  if (language) panel.language = language;
  else delete panel.language;
  writeAll(all);
}

/** Only fields in the schema are written; an empty value deletes the key (back to the default). */
function saveSettings(applets, { values }) {
  const known = new Map();
  for (const a of applets) for (const f of a.settings || []) known.set(`${f.section || a.id}.${f.key}`, f);
  const all = readSettings();
  for (const { section, key, value } of values || []) {
    const field = known.get(`${section}.${key}`);
    if (!field) throw new Error(`Unknown setting: ${key}`);
    const target = (all[section] ??= {});
    const text = String(value ?? "").trim();
    if (!text) {
      delete target[key];
    } else if (field.type === "json") {
      try {
        target[key] = JSON.parse(text);
      } catch {
        throw new Error(coreT("{label}: not valid JSON", { label: field.label }));
      }
    } else {
      target[key] = text;
    }
  }
  writeAll(all);
}

function readBody(req) {
  return new Promise((done, fail) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => done(body));
    req.on("error", fail);
  });
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function sendFile(res, file) {
  send(res, 200, readFileSync(file), TYPES[extname(file)] || "application/octet-stream");
}

function serveStatic(applet, path, res) {
  const file = resolve(applet.folder, path === "/" ? applet.page || "index.html" : "." + path);
  if (!file.startsWith(applet.folder + sep) || !existsSync(file) || statSync(file).isDirectory()) {
    return send(res, 404, { error: "not found" });
  }
  sendFile(res, file);
}

export async function startDashboard({ port = 3400 }) {
  ensureInstalled();
  const applets = findApplets();
  const startStamp = serverStamp(applets);
  /** A new folder shows up without a restart, a removed one goes; running backends are kept. */
  function syncApplets() {
    const found = findApplets();
    const known = new Map(applets.map((a) => [a.id, a]));
    applets.length = 0;
    for (const a of found) {
      const old = known.get(a.id);
      applets.push(old && old.folder === a.folder ? Object.assign(old, { ...a, handle: old.handle, loading: old.loading, error: old.error ?? a.error }) : a);
    }
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!res.headersSent) send(res, 400, { error: String(e.message || e) });
      else res.end();
    });
  });

  async function handle(req, res) {
    // Keeps another site from reaching this server through DNS
    const host = (req.headers.host || "").split(":")[0];
    if (host !== "localhost" && host !== "127.0.0.1") return send(res, 403, { error: "host" });
    // Keeps a site open in another tab from writing to applets
    const origin = req.headers.origin;
    if (req.method !== "GET" && origin && origin !== `http://${req.headers.host}`) {
      return send(res, 403, { error: "origin" });
    }
    // Keeps other sites from triggering anything here with an image or a form; only opening a page by link is allowed
    const site = req.headers["sec-fetch-site"];
    const opening = req.headers["sec-fetch-mode"] === "navigate" && req.headers["sec-fetch-dest"] === "document";
    if (site && site !== "same-origin" && site !== "none" && !opening) return send(res, 403, { error: "cross-site" });
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const url = new URL(req.url, "http://localhost");
    activeLanguage = languageOf(req);
    if (url.pathname === "/") return sendFile(res, join(import.meta.dirname, "ui.html"));
    if (url.pathname === "/logo.svg") return sendFile(res, join(import.meta.dirname, "logo.svg"));
    // Shared look and helpers. kit.js carries the language and the messages of the applet asking for it (from the
    // Referer), so a translated page needs no extra request and the source language costs nothing.
    if (url.pathname === "/kit.css") return sendFile(res, join(CORE_FOLDER, "kit.css"));
    if (url.pathname === "/kit.js") {
      const id = /\/a\/([^/]+)\//.exec(req.headers.referer || "")?.[1];
      const applet = id && applets.find((a) => a.id === id);
      const messages = { ...messagesOf(CORE_FOLDER, activeLanguage), ...(applet ? messagesOf(applet.folder, activeLanguage) : {}) };
      return send(res, 200, `window.I18N=${JSON.stringify({ language: activeLanguage, messages })};\n${readFileSync(join(CORE_FOLDER, "kit.js"), "utf8")}`, TYPES[".js"]);
    }
    if (url.pathname === "/api/language") {
      if (req.method === "POST") {
        if (req.headers["x-panel"] !== "1") return send(res, 403, { error: "forbidden" });
        try {
          setLanguage(JSON.parse((await readBody(req)) || "{}").language);
          return send(res, 200, { ok: true });
        } catch (e) {
          return send(res, 400, { error: String(e.message || e) });
        }
      }
      return send(res, 200, { language: activeLanguage, chosen: readSettings()._dashboard?.language ?? "", available: availableLanguages() });
    }
    if (url.pathname === "/api/applets") {
      if (req.method === "POST") {
        if (req.headers["x-panel"] !== "1") return send(res, 403, { error: "forbidden" });
        const q = JSON.parse((await readBody(req)) || "{}");
        const applet = applets.find((a) => a.id === q.id);
        if (!applet) return send(res, 400, { error: "no such applet" });
        if (applet.visibility === "custom") setListed("disabled", q.id, !q.enabled);
        else setListed("installed", q.id, !!q.enabled);
        return send(res, 200, { ok: true });
      }
      syncApplets();
      const shown = shownApplets();
      return send(res, 200, applets.map((a) => publicView(a, shown)));
    }
    if (url.pathname === "/api/version") {
      // Server code changed: restart under launchd; the page notices from `boot` and reloads
      if (process.env.XPC_SERVICE_NAME === "app.speys.local" && serverStamp(applets) > startStamp) {
        setTimeout(() => process.exit(0), 100);
      }
      return send(res, 200, versionView(applets));
    }
    if (url.pathname === "/api/new-applet" && req.method === "GET") return send(res, 200, { folder: ROOT }); // where to run Claude Code
    if (url.pathname === "/api/update/auto") {
      if (req.method !== "POST" || req.headers["x-panel"] !== "1") return send(res, 403, { error: "forbidden" });
      setAutoCheck(JSON.parse((await readBody(req)) || "{}").on !== false);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/update") {
      try {
        if (req.method === "POST") {
          if (req.headers["x-panel"] !== "1") return send(res, 403, { error: "forbidden" });
          return send(res, 200, await applyUpdate());
        }
        return send(res, 200, await updateStatus(url.searchParams.get("check") === "1"));
      } catch (e) {
        return send(res, 502, { error: String(e.message || e) });
      }
    }
    if (url.pathname === "/api/workspaces") {
      if (req.method === "POST") {
        if (req.headers["x-panel"] !== "1") return send(res, 403, { error: "forbidden" });
        try {
          const q = JSON.parse((await readBody(req)) || "{}");
          const id = q.create ? slugOf(q.create) : q.id;
          if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id ?? "")) throw new Error(coreT("Use letters and digits for the name."));
          if (id !== MAIN && id !== DEMO && !q.create && !existsSync(workspaceFolder(id))) throw new Error("no such workspace");
          mkdirSync(workspaceFolder(id), { recursive: true });
          if (id === DEMO) await seedDemo(workspaceFolder(DEMO), { disabled: applets.filter((a) => a.visibility === "custom").map((a) => a.id) });
          mkdirSync(BASE, { recursive: true });
          writeFileSync(ACTIVE_FILE, JSON.stringify({ active: id }) + "\n");
          enterWorkspace(id);
          ensureInstalled();
          // Backends hold their data folder: they are created again on the next request
          for (const a of applets) {
            delete a.handle;
            delete a.loading;
            if (a.error?.startsWith("Could not load")) delete a.error;
          }
          return send(res, 200, { ok: true, active: id });
        } catch (e) {
          return send(res, 400, { error: String(e.message || e) });
        }
      }
      const others = readdirSync(dirname(BASE))
        .filter((f) => f.startsWith(SIBLING) && statSync(join(dirname(BASE), f)).isDirectory())
        .map((f) => f.slice(SIBLING.length))
        .filter((id) => id !== MAIN && id !== DEMO && /^[a-z0-9][a-z0-9-]{0,40}$/.test(id));
      return send(res, 200, { active: activeWorkspace(), list: [MAIN, DEMO, ...others.sort()] });
    }
    if (url.pathname === "/store") return sendFile(res, join(CORE_FOLDER, "store.html"));
    if (url.pathname === "/api/store" && req.method === "GET") {
      const installed = new Set(readSettings()._dashboard?.installed || []);
      const custom = new Set(applets.filter((a) => a.visibility === "custom").map((a) => a.id));
      return send(res, 200, {
        applets: storeApplets().map((a) => {
          const t = translatorOf(a);
          return {
            id: a.id, name: a.name || a.id, description: a.description ? t(a.description) : "", author: a.author || "Speys",
            category: a.category ? t(a.category) : null, reads: a.reads ? t(a.reads) : null, platforms: a.platforms || [],
            icon: iconOf(a), shots: screenshots(a.folder), installed: installed.has(a.id), customCopy: custom.has(a.id),
          };
        }),
      });
    }
    if (url.pathname.startsWith("/store-media/")) {
      const [id, name] = url.pathname.slice("/store-media/".length).split("/");
      const file = ID.test(id) ? screenshotFile(join(STORE_DIR, id), name) : null;
      return file ? sendFile(res, file) : send(res, 404, { error: "not found" });
    }
    if (url.pathname === "/api/store/install" || url.pathname === "/api/store/remove") {
      if (req.method !== "POST" || req.headers["x-panel"] !== "1") return send(res, 403, { error: "forbidden" });
      const { id } = JSON.parse((await readBody(req)) || "{}");
      if (!storeApplets().some((a) => a.id === id)) return send(res, 400, { error: coreT("This applet is not in the store.") });
      setListed("installed", id, url.pathname.endsWith("/install"));
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/settings") return sendFile(res, join(import.meta.dirname, "settings.html"));
    if (url.pathname === "/api/settings") {
      if (req.method === "GET") return send(res, 200, settingsView(applets));
      if (req.method !== "POST" || req.headers["x-panel"] !== "1") return send(res, 403, { error: "forbidden" });
      try {
        saveSettings(applets, JSON.parse((await readBody(req)) || "{}"));
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
      }
    }

    const hit = /^\/a\/([^/]+)(\/.*)?$/.exec(url.pathname);
    const applet = hit && applets.find((m) => m.id === hit[1]);
    if (!applet || (applet.visibility === "store" && !shownApplets()(applet))) return send(res, 404, { error: "not found" });
    // The trailing / matters: applet pages make requests relative to their own address
    if (!hit[2]) {
      res.writeHead(302, { Location: `/a/${applet.id}/${url.search}` });
      return res.end();
    }
    if (applet.backend) await loadBackend(applet);
    if (applet.error) return send(res, 500, { error: applet.error });

    try {
      if (!applet.handle) return serveStatic(applet, hit[2], res);
      req.url = hit[2] + url.search;
      await applet.handle(req, res);
    } catch (e) {
      if (!res.headersSent) send(res, 500, { error: String(e.message || e) });
    }
  }

  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", done);
  });
  const autoCheck = () => { if (autoCheckOn()) backgroundCheck(); };
  setTimeout(autoCheck, UPDATE_FIRST_CHECK).unref();
  setInterval(autoCheck, UPDATE_CHECK_EVERY).unref();
  return { server, applets };
}
