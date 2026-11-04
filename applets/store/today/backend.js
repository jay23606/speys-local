// Today: a dashboard over the other applets. The page reads them over HTTP, so a missing applet only hides its card;
// the one thing kept here is the habit list.
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { expand, handleWrite, isoDay, page, readJson, send, writeJson } from "../../../lib/common.js";

const slug = (name) => name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "habit";

export default function create({ dataDir, settings, t }) {
  const file = () => expand(settings().habitsFile) || join(dataDir, "habits.json");
  const load = () => (existsSync(file()) ? readJson(file()) : { habits: [], log: {} });

  function apply(q) {
    const d = load();
    if (q.op === "add") {
      const name = String(q.name ?? "").trim().slice(0, 80);
      if (!name) throw new Error(t("Name is empty."));
      let id = slug(name), n = 2;
      while (d.habits.some((h) => h.id === id)) id = `${slug(name)}-${n++}`;
      d.habits.push({ id, name });
    } else if (q.op === "toggle") {
      if (!d.habits.some((h) => h.id === q.id)) return false;
      const day = isoDay(), done = new Set(d.log[day] || []);
      done.has(q.id) ? done.delete(q.id) : done.add(q.id);
      d.log[day] = [...done];
    } else if (q.op === "remove") {
      d.habits = d.habits.filter((h) => h.id !== q.id);
    } else {
      throw new Error("unknown op");
    }
    mkdirSync(dirname(file()), { recursive: true });
    writeJson(file(), d);
    return true;
  }

  return (req, res) => {
    const path = req.url.split("?")[0];
    if (req.method === "GET" && path === "/") return page(res, import.meta.dirname);
    if (req.method === "GET" && path === "/api/habits") {
      const d = load();
      return send(res, 200, { habits: d.habits, done: d.log[isoDay()] || [] });
    }
    if (req.method === "POST" && path === "/api/habits") return handleWrite(req, res, apply);
    send(res, 404, { error: "not found" });
  };
}
