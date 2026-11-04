// Claude Wrapped. The page asks, a process reads the transcripts in the background, and the answer comes from its cache.
// Nothing leaves this computer; sharing the card is a file the user saves.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expand, send } from "../../../lib/common.js";
import { monthsIn, summarize } from "./stats.js";

const STALE_MS = 5 * 60_000;
const isFolder = (p) => existsSync(p) && statSync(p).isDirectory();

function foldersFrom(saved) {
  const named = Array.isArray(saved) ? saved.map((f) => expand(typeof f === "string" ? f : f?.path)).filter(Boolean) : [];
  if (named.length) return named.filter(isFolder);
  const home = homedir();
  const others = readdirSync(home).filter((f) => f.startsWith(".claude-") && isFolder(join(home, f, "projects"))).map((f) => join(home, f));
  return [...new Set([join(home, ".claude"), process.env.CLAUDE_CONFIG_DIR, ...others].filter(Boolean))].filter(isFolder);
}

export default function create({ dataDir, settings }) {
  const cacheFile = join(dataDir, "wrapped.json");
  const scan = { running: false, done: 0, total: 0, error: null };
  let files = null, readAt = 0;

  const scanStale = () => Date.now() - (existsSync(cacheFile) ? statSync(cacheFile).mtimeMs : 0) > STALE_MS;

  function startScan() {
    if (scan.running) return;
    Object.assign(scan, { running: true, done: 0, total: 0, error: null });
    const child = spawn(process.execPath, ["--max-old-space-size=2048", join(import.meta.dirname, "scan-child.js"), cacheFile, JSON.stringify(foldersFrom(settings().folders))], { stdio: ["ignore", "pipe", "ignore"] });
    let rest = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      const lines = (rest + chunk).split("\n");
      rest = lines.pop();
      const last = lines.at(-1)?.split(" ");
      if (last?.length === 2) [scan.done, scan.total] = last.map(Number);
    });
    child.on("error", (e) => { scan.error = String(e.message); scan.running = false; });
    child.on("close", (code) => {
      if (code) scan.error = `exit ${code}`;
      scan.running = false;
    });
  }

  function loaded() {
    if (!existsSync(cacheFile)) return null;
    const at = statSync(cacheFile).mtimeMs;
    if (at !== readAt) {
      files = JSON.parse(readFileSync(cacheFile, "utf8"));
      readAt = at;
    }
    return files;
  }

  return (req, res) => {
    const url = new URL(req.url, "http://local");
    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, readFileSync(join(import.meta.dirname, "index.html")), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/api/wrapped") {
      if (url.searchParams.get("refresh") === "1" || scanStale()) startScan();
      const all = loaded();
      const period = url.searchParams.get("period") || "30d";
      return send(res, 200, {
        scan,
        periods: all ? monthsIn(all) : [],
        data: all ? summarize(all, period) : null,
      });
    }
    send(res, 404, { error: "not found" });
  };
}
