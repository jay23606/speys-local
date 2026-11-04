#!/usr/bin/env node
// Claude hook: records the event, and gives a macOS notification + sound when
// a long job finishes or permission is requested. Rules: print nothing,
// never block, exit silently on any error.
//
// The sound is chosen on the Claude Sessions page (settings.json → claude.sounds); see sounds.js.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { SOURCE_LANGUAGE, messagesOf, translator } from "../../../lib/i18n.js";
import { clean, projectName, readTail } from "./sessions.js";
import { chosenSounds, soundPath } from "./sounds.js";

const HOME = process.env.SPEYS_LOCAL_HOME || join(import.meta.dirname, "..", "..", "..", "data");
const DONE_AFTER_S = 45;
const MAX_LINES = 3000;

function readSettings() {
  try {
    return JSON.parse(readFileSync(join(HOME, "settings.json"), "utf8")) || {};
  } catch {
    return {};
  }
}

/** The dashboard's language setting, else the system's (LANG=tr_TR.UTF-8 → tr; C and POSIX have none). */
const languageOf = (all) => all._dashboard?.language || process.env.LANG?.match(/^[a-z]{2}(?![a-z])/i)?.[0].toLowerCase() || SOURCE_LANGUAGE;

const expand = (p) => (p?.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

function lastStart(file, session) {
  if (!existsSync(file)) return 0;
  let at = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.includes(session) || !line.includes('"UserPromptSubmit"')) continue;
    try {
      at = JSON.parse(line).zaman ?? at;
    } catch {
      // broken line
    }
  }
  return at;
}

function notify(title, subtitle, message, sound) {
  if (process.platform !== "darwin") return;
  const quote = (s) => String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const script = `display notification "${quote(message)}" with title "${quote(title)}" subtitle "${quote(subtitle)}"`;
  const soundFile = soundPath(HOME, chosenSounds(HOME, readSettings().claude?.sounds)[sound]);
  const commands = [["osascript", ["-e", script]]];
  if (soundFile) commands.push(["afplay", [soundFile]]);
  for (const [cmd, args] of commands) spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

function sessionTitle(transcript) {
  if (!transcript) return "";
  const tail = readTail(transcript, 200_000);
  for (let i = tail.length - 1; i >= 0; i--) {
    if (tail[i].type === "ai-title") return tail[i].aiTitle ?? "";
    if (tail[i].type === "last-prompt") return clean(tail[i].lastPrompt, 90);
  }
  return "";
}

function trim(file) {
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  if (lines.length > MAX_LINES) writeFileSync(file, lines.slice(-MAX_LINES / 2).join("\n") + "\n");
}

function run() {
  const data = JSON.parse(readFileSync(0, "utf8") || "{}");
  const event = data.hook_event_name;
  const session = data.session_id;
  if (!session || !["UserPromptSubmit", "Stop", "Notification"].includes(event)) return;

  const all = readSettings();
  const s = all.claude || {};
  // the translation file is read only when a notification goes out, not on every event
  const t = translator(() => messagesOf(import.meta.dirname, languageOf(all)));
  const file = expand(s.eventsFile) || join(HOME, "apps", "claude", "olaylar.jsonl");
  const root = expand(s.projectsRoot) || homedir();
  const project = data.cwd ? projectName(data.cwd, root) : "";
  const now = Date.now() / 1000;
  const row = { zaman: now, olay: event, oturum: session };

  if (event === "Notification") {
    const message = data.message ?? "";
    const approval = data.notification_type === "permission_prompt" || message.toLowerCase().includes("permission");
    Object.assign(row, { onay: approval, mesaj: message });
    if (approval) notify(t("Claude · waiting for approval"), project, message, "approval");
  } else if (event === "Stop" && !data.stop_hook_active) {
    const started = lastStart(file, session);
    if (started && now - started >= DONE_AFTER_S) {
      const minutes = Math.round((now - started) / 60);
      const took = minutes ? t("{n} min", { n: minutes }) : t("{n} s", { n: Math.round(now - started) });
      notify(t("Claude · done ({took})", { took }), project, sessionTitle(data.transcript_path), "done");
    }
  }

  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(row) + "\n");
  trim(file);
}

try {
  run();
} catch {
  // the hook never blocks Claude
}
process.exitCode = 0;
