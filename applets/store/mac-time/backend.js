// Mac Time: what Speys Mac wrote (~/Library/Application Support/Speys/kullanim) and macOS's power log. Reads only.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { page, send } from "../../../lib/common.js";
import { dayOf, screenOn, summarize } from "./usage.js";

const FOLDER = join(homedir(), "Library", "Application Support", "Speys", "kullanim");
const LOG_MAX_AGE_MS = 60_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function create() {
  let log = "", logAt = 0, pending = null;

  function powerLog() {
    if (Date.now() - logAt < LOG_MAX_AGE_MS) return Promise.resolve(log);
    pending ??= new Promise((done) => {
      execFile("pmset", ["-g", "log"], { maxBuffer: 256 * 1024 * 1024, timeout: 20_000 }, (error, stdout) => {
        if (!error) { log = stdout; logAt = Date.now(); }
        pending = null;
        done(log);
      });
    });
    return pending;
  }

  const fileOf = (day) => join(FOLDER, `${day}.jsonl`);
  const read = (day) => (existsSync(fileOf(day)) ? readFileSync(fileOf(day), "utf8") : "");

  async function overview(day) {
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(`${day}T12:00`);
      d.setDate(d.getDate() - i);
      const name = dayOf(d);
      week.push({ day: name, total: summarize(read(name)).total });
    }
    return {
      day, today: dayOf(new Date()), macOS: process.platform === "darwin", tracking: existsSync(FOLDER),
      ...summarize(read(day)), screen: process.platform === "darwin" ? screenOn(await powerLog(), day) : null, week,
    };
  }

  return async (req, res) => {
    const url = new URL(req.url, "http://local");
    if (req.method === "GET" && url.pathname === "/") return page(res, import.meta.dirname);
    if (req.method === "GET" && url.pathname === "/api/day") {
      const day = url.searchParams.get("day") || dayOf(new Date());
      if (!DAY_RE.test(day)) return send(res, 400, { error: "day" });
      return send(res, 200, await overview(day));
    }
    send(res, 404, { error: "not found" });
  };
}
