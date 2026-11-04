// Claude sessions: the transcripts of the last 48 hours + the events written by the hook. Files run to many MB; only the tail is read.
import { existsSync, openSync, closeSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

const WINDOW_S = 48 * 3600;
const RUNNING_S = 15 * 60;
const ORDER = { onay: 0, calisiyor: 1, bitti: 2, yanitsiz: 3, sessiz: 4 };

export function readTail(file, bytes = 400_000) {
  const size = statSync(file).size;
  const length = Math.min(size, bytes);
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString("utf8").split(/\r\n|\r|\n/);
  if (size > bytes) lines.shift(); // partial line
  const out = [];
  for (const s of lines) {
    try {
      if (s) out.push(JSON.parse(s));
    } catch {
      // partial or broken line
    }
  }
  return out;
}

/** Session → its last status event. */
export function lastEvents(file) {
  const out = new Map();
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!out.has(e.oturum)) out.set(e.oturum, {});
    if (e.olay === "Notification" && !e.onay) continue; // a "waiting for input" notice does not change the status
    const s = out.get(e.oturum);
    s.olay = e.olay;
    s.zaman = e.zaman ?? 0;
    if (e.mesaj) s.mesaj = e.mesaj;
  }
  return out;
}

/** The folder the session was opened in (the one on the last lines can drift with `cd`). */
function startFolder(file) {
  const size = Math.min(statSync(file).size, 200_000);
  const buffer = Buffer.alloc(size);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buffer, 0, size, 0);
  } finally {
    closeSync(fd);
  }
  for (const line of buffer.toString("utf8").split("\n")) {
    if (!line.includes('"cwd"')) continue;
    try {
      return JSON.parse(line).cwd ?? "";
    } catch {
      // truncated line
    }
  }
  return "";
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((p) => p?.type === "text").map((p) => p.text ?? "").join(" ");
  return "";
}

export function clean(s, max) {
  const text = String(s ?? "")
    .replace(/<(system-reminder|ide_selection|ide_opened_file)[\s\S]*?<\/\1>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max - 1).join("").trimEnd() + "…";
}

export function projectName(cwd, root) {
  const rel = relative(root, cwd);
  if (rel.startsWith("..") || rel === cwd) return basename(cwd) || cwd;
  const parts = rel.split(sep).filter(Boolean);
  if (!parts.length) return basename(cwd) || cwd;
  return parts.length > 1 ? parts.slice(-2).join(" / ") : parts[0];
}

function statusOf(event, mtime, now) {
  const active = now - mtime < RUNNING_S ? "calisiyor" : "yanitsiz";
  if (event.olay === "Notification") return mtime > (event.zaman ?? 0) + 5 ? active : "onay"; // permission was granted and it kept writing
  if (event.olay === "UserPromptSubmit") return active;
  if (event.olay === "Stop") return "bitti";
  return now - mtime < 120 ? "calisiyor" : "sessiz"; // a session from before the hooks: file time only
}

export function sessions({ folders, eventsFile, projectsRoot, t, hidden }) {
  const now = Date.now() / 1000;
  const events = lastEvents(eventsFile);
  const list = [];
  for (const { path: root, label } of folders) {
    const base = join(root, "projects");
    if (!existsSync(base)) continue;
    for (const project of readdirSync(base, { withFileTypes: true })) {
      if (!project.isDirectory() || project.name.startsWith("-private-")) continue; // temporary folders of subagents
      for (const name of readdirSync(join(base, project.name))) {
        if (!name.endsWith(".jsonl") || hidden?.has(name.slice(0, -6))) continue;
        const file = join(base, project.name, name);
        const mtime = statSync(file).mtimeMs / 1000;
        if (now - mtime > WINDOW_S) continue;
        let title = "", prompt = "", reply = "";
        const tail = readTail(file);
        for (let i = tail.length - 1; i >= 0 && !(title && prompt && reply); i--) {
          const s = tail[i];
          if (!title && s.type === "ai-title") title = s.aiTitle ?? "";
          else if (!prompt && s.type === "last-prompt") prompt = s.lastPrompt ?? "";
          else if (!reply && s.type === "assistant" && !s.isSidechain) reply = textOf(s.message?.content);
        }
        const cwd = startFolder(file);
        const id = name.slice(0, -6);
        const event = events.get(id) || {};
        const status = statusOf(event, mtime, now);
        list.push({
          oturum: id,
          yapilandirma: label,
          proje: cwd ? projectName(cwd, projectsRoot) : project.name,
          baslik: clean(title || prompt || t("(untitled)"), 90),
          istek: clean(prompt, 220),
          cevap: clean(reply, 260),
          durum: status,
          zaman: mtime,
          onay_mesaji: status === "onay" ? event.mesaj ?? "" : "",
        });
      }
    }
  }
  list.sort((a, b) => ORDER[a.durum] - ORDER[b.durum] || b.zaman - a.zaman);
  return list.slice(0, 30);
}
