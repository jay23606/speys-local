// Slay the Spire 2. Reads the game's history folders on the first request; after that only new or changed files are parsed.
import { existsSync, mkdirSync, readFileSync, watch } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { expand, handleWrite, page, send, writeJson } from "../../../lib/common.js";
import { parseLog, playsFor } from "./plays.js";
import { filterRuns, listRow, parseCurrent, parseRun, parseRunDetail, summarize } from "./runs.js";

const defaultFolder = () =>
  process.platform === "win32"
    ? join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "SlayTheSpire2")
    : join(homedir(), "Library", "Application Support", "SlayTheSpire2");

const list = (dir) => readdir(dir, { withFileTypes: true }).catch(() => []);
const folders = async (dir) => (await list(dir)).filter((e) => e.isDirectory()).map((e) => e.name);
/** The Steam id the save folder is named after; a non-Steam folder has none. */
const ownerOf = (account) => (/^\d{17}$/.test(account) ? account : null);

/** <folder>/steam/<steam id>/profile*\/saves, each with its Steam id. */
async function findSaveFolders(root) {
  const found = [];
  for (const account of await folders(join(root, "steam"))) {
    for (const profile of (await folders(join(root, "steam", account))).filter((f) => /^profile\d+$/.test(f))) {
      found.push({ saves: join(root, "steam", account, profile, "saves"), account });
    }
  }
  return found;
}

/** saves/history/*.run; the game's own *.run.backup files are skipped. */
async function findRunFiles(root) {
  const found = [];
  for (const { saves, account } of await findSaveFolders(root)) {
    for (const entry of await list(join(saves, "history"))) {
      if (entry.isFile() && entry.name.endsWith(".run")) found.push({ path: join(saves, "history", entry.name), account });
    }
  }
  return found;
}

/** The run being played: saves/current_run.save (solo) and current_run_mp.save (co-op). Small, so read on every request. */
async function currentRuns(root) {
  const found = [];
  for (const { saves, account } of await findSaveFolders(root)) {
    for (const entry of await list(saves)) {
      if (!entry.isFile() || !/^current_run(_mp)?\.save$/.test(entry.name)) continue;
      const run = parseCurrent(await readFile(join(saves, entry.name), "utf8").catch(() => ""));
      if (run) found.push({ ...run, owner: ownerOf(account) });
    }
  }
  return found;
}

export default function create({ dataDir, settings, saveSettings }) {
  mkdirSync(dataDir, { recursive: true });
  const cacheFile = join(dataDir, "runs.json");
  let cache = null, scanning = null;

  function loadCache() {
    if (cache) return cache;
    try {
      cache = JSON.parse(readFileSync(cacheFile, "utf8"));
    } catch {
      cache = {};
    }
    return cache;
  }

  async function scanOnce(root) {
    const known = loadCache();
    const next = {};
    let changed = false;
    for (const { path, account } of await findRunFiles(root)) {
      const { mtimeMs, size } = await stat(path);
      const old = known[path];
      if (old && old.mtimeMs === mtimeMs && old.size === size) {
        next[path] = old;
        continue;
      }
      const run = parseRun(await readFile(path, "utf8"));
      next[path] = { mtimeMs, size, run: run && { ...run, owner: ownerOf(account) } };
      changed = true;
    }
    if (changed || Object.keys(known).length !== Object.keys(next).length) writeJson(cacheFile, next, 0);
    cache = next;
    return next;
  }

  /** One scan at a time: requests arriving during a scan share its result. */
  function scan(root) {
    scanning ??= scanOnce(root).finally(() => { scanning = null; });
    return scanning;
  }

  async function allRuns(root) {
    const entries = Object.values(await scan(root));
    const byKey = new Map(entries.filter((e) => e.run).map((e) => [e.run.sourceKey, e.run]));
    return { runs: [...byKey.values()].sort((a, b) => b.startTime - a.startTime), failed: entries.filter((e) => !e.run).length };
  }

  // Damage dealt is only in the save of the run being played; the history file of a finished run drops it. It is copied
  // here whenever that save changes, so a finished run keeps the last number seen: up to the room the game last saved in.
  const dealtFile = join(dataDir, "dealt.json");
  let dealt = null;

  function loadDealt() {
    if (dealt) return dealt;
    try {
      dealt = JSON.parse(readFileSync(dealtFile, "utf8"));
    } catch {
      dealt = {};
    }
    return dealt;
  }

  function rememberDealt(runs) {
    const known = loadDealt();
    let changed = false;
    for (const run of runs) {
      const values = run.players.map((p) => p.totals.dealt);
      if (values.every((v) => v == null)) continue;
      const old = known[run.sourceKey];
      if (old && old.floor === run.floors && String(old.dealt) === String(values)) continue;
      known[run.sourceKey] = { dealt: values, floor: run.floors };
      changed = true;
    }
    if (changed) writeJson(dealtFile, known, 0);
  }

  async function readCurrent(root) {
    const runs = await currentRuns(root);
    rememberDealt(runs);
    return runs;
  }

  // The game saves after every room; watching the folder catches runs played while the page is closed. It starts with the
  // backend (first request), costs nothing while nothing changes, and is moved when the folder setting changes.
  let watched = null, watchers = [], settle = null;
  async function watchSaves(root) {
    if (watched === root) return;
    watched = root;
    watchers.forEach((w) => w.close());
    watchers = [];
    for (const { saves } of await findSaveFolders(root)) {
      try {
        const w = watch(saves, (event, name) => {
          if (!/^current_run(_mp)?\.save$/.test(String(name))) return;
          clearTimeout(settle);
          settle = setTimeout(() => readCurrent(root).catch(() => {}), 2000);
        });
        w.on("error", () => {});
        w.unref();
        watchers.push(w);
      } catch {}
    }
  }

  /** A finished run with the damage dealt remembered for it; `dealtFloor` says how far the number goes. */
  function withDealt(run) {
    const saved = loadDealt()[run.sourceKey];
    if (!saved) return run;
    return {
      ...run,
      dealtFloor: saved.floor,
      players: run.players.map((p, i) => ({ ...p, totals: { ...p.totals, dealt: saved.dealt[i] ?? null } })),
    };
  }

  // Cards played come from the game's log, which keeps five launches: every changed log is read again and its runs kept here.
  const playsFile = join(dataDir, "plays.json");
  let plays = null, logsRead = 0;

  async function readLogs(root) {
    plays ??= (() => {
      try {
        return JSON.parse(readFileSync(playsFile, "utf8"));
      } catch {
        return { files: {}, runs: {} };
      }
    })();
    let changed = false;
    for (const entry of await list(join(root, "logs"))) {
      if (!entry.isFile() || !/^godot.*\.log$/.test(entry.name)) continue;
      const path = join(root, "logs", entry.name);
      const { mtimeMs, size } = await stat(path);
      if (plays.files[entry.name] === `${size}:${mtimeMs}`) continue;
      for (const part of parseLog(await readFile(path, "utf8"))) {
        // a finished part is known by its history file; one cut off by a restart by its seed
        const key = part.start ? `start:${part.start}` : `seed:${part.seed}`;
        const total = (p) => Object.values(p?.players ?? {}).reduce((sum, x) => sum + x.played, 0);
        if (total(part) >= total(plays.runs[key])) plays.runs[key] = part;
      }
      plays.files[entry.name] = `${size}:${mtimeMs}`;
      changed = true;
    }
    if (changed) writeJson(playsFile, plays, 0);
    logsRead = Date.now();
    return plays;
  }

  /** The list page reads the logs now and then, so a run's cards are kept before the game rotates its log away. */
  const readLogsSometimes = (root) => { if (Date.now() - logsRead > 10 * 60_000) readLogs(root).catch(() => {}); };

  async function withPlays(run, root) {
    const { runs } = await readLogs(root).catch(() => ({ runs: {} }));
    const parts = [runs[`start:${run.startTime}`], runs[`seed:${run.seed}`]].filter(Boolean);
    const found = playsFor(run, parts);
    return found ? { ...run, players: run.players.map((p, i) => ({ ...p, plays: found[i] })) } : run;
  }

  const rootFolder = () => expand(settings().folder) || defaultFolder();

  return async (req, res) => {
    const url = new URL(req.url, "http://local");
    if (req.method === "GET" && url.pathname === "/") return page(res, import.meta.dirname);
    if (req.method === "GET" && url.pathname === "/api/runs") {
      const root = rootFolder();
      if (!existsSync(root)) return send(res, 200, { not_found: true, folder: root });
      watchSaves(root).catch(() => {});
      readLogsSometimes(root);
      const [{ runs, failed }, playing] = await Promise.all([allRuns(root), readCurrent(root)]);
      const filter = { mode: url.searchParams.get("mode"), character: url.searchParams.get("character"), person: url.searchParams.get("person") };
      const shown = filterRuns(runs, filter);
      // a finished run is in history; if the game left its current_run file behind, the history copy wins
      const finished = new Set(runs.map((r) => r.sourceKey));
      return send(res, 200, {
        current: filterRuns(playing.filter((r) => !finished.has(r.sourceKey)), filter).map(listRow),
        ...summarize(shown),
        // each list ignores its own filter, so another character or person can still be picked
        characters: summarize(filterRuns(runs, { ...filter, character: null })).characters,
        people: summarize(filterRuns(runs, { ...filter, person: null })).people,
        runs: shown.map(listRow),
        total: runs.length,
        failed,
        names: settings().people || {},
      });
    }
    if (req.method === "GET" && url.pathname === "/api/run") {
      const key = url.searchParams.get("key"), root = rootFolder();
      const found = Object.entries(await scan(root)).find(([, e]) => e.run?.sourceKey === key);
      const run = found ? parseRunDetail(await readFile(found[0], "utf8")) : (await readCurrent(root)).find((r) => r.sourceKey === key);
      if (!run) return send(res, 404, { error: "not found" });
      return send(res, 200, await withPlays(found ? withDealt({ ...run, owner: found[1].run.owner }) : run, root));
    }
    if (req.method === "GET" && url.pathname === "/api/names") {
      const read = (file) => JSON.parse(readFileSync(join(import.meta.dirname, file), "utf8"));
      return send(res, 200, { ...read("names.json"), badges: read("badges.json") }, undefined, "max-age=86400");
    }
    if (req.method === "POST" && url.pathname === "/api/person") {
      return handleWrite(req, res, ({ steamId, name }) => {
        if (!/^\d{17}$/.test(steamId)) throw new Error("bad steam id");
        const current = settings();
        const people = { ...current.people };
        if (String(name || "").trim()) people[steamId] = String(name).trim();
        else delete people[steamId];
        saveSettings({ ...current, people });
        return true;
      });
    }
    send(res, 404, { error: "not found" });
  };
}
