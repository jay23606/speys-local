// Installs the hook into Claude Code's settings, so status and sound work without a manual step. It only adds its own
// entries, keeps a backup of the first version it touches, and never rewrites a settings file it can't parse.
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EVENTS = ["UserPromptSubmit", "Stop", "Notification"];
// `official` is where the applet lived before November 2026: an entry pointing there is ours too, and gets replaced
const OURS = /applets[\\/](?:official|store|custom)[\\/]claude[\\/]hook\.js/;
const isOurs = (h) => OURS.test(h?.command ?? "");

function read(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

function write(file, data) {
  const backup = `${file}.speys-backup`;
  if (existsSync(file) && !existsSync(backup)) copyFileSync(file, backup);
  const temp = `${file}.speys-new`;
  writeFileSync(temp, JSON.stringify(data, null, 2) + "\n");
  renameSync(temp, file);
}

/** Entries of other hooks stay as they are; an entry left empty goes away. */
function withoutOurs(entries = []) {
  return entries.map((e) => ({ ...e, hooks: (e.hooks || []).filter((h) => !isOurs(h)) })).filter((e) => e.hooks.length);
}

// On Windows the plain form; elsewhere a deleted folder or a removed Node leaves the entry behind doing nothing, without an error on every event.
const command = (hookFile) => {
  const plain = `"${process.execPath}" "${hookFile}"`;
  return process.platform === "win32" ? plain : `[ -f "${hookFile}" ] && ${plain} 2>/dev/null || true`;
};

/** A folder that doesn't exist means Claude Code isn't there: nothing is created. Returns the folders it failed on. */
export function installHook(folders, hookFile) {
  const failed = [];
  for (const folder of folders) {
    if (!existsSync(folder)) continue;
    const file = join(folder, "settings.json");
    try {
      const settings = read(file);
      const current = EVENTS.every((e) => settings.hooks?.[e]?.some((entry) => entry.hooks?.some((h) => h.command === command(hookFile))));
      if (current) continue;
      settings.hooks ??= {};
      for (const e of EVENTS) settings.hooks[e] = [...withoutOurs(settings.hooks[e]), { hooks: [{ type: "command", command: command(hookFile) }] }];
      write(file, settings);
    } catch {
      failed.push(folder);
    }
  }
  return failed;
}

export function removeHook(folders) {
  for (const folder of folders) {
    const file = join(folder, "settings.json");
    if (!existsSync(file)) continue;
    try {
      const settings = read(file);
      if (!settings.hooks) continue;
      for (const e of EVENTS) {
        if (!settings.hooks[e]) continue;
        settings.hooks[e] = withoutOurs(settings.hooks[e]);
        if (!settings.hooks[e].length) delete settings.hooks[e];
      }
      if (!Object.keys(settings.hooks).length) delete settings.hooks;
      write(file, settings);
    } catch {
      // a file we can't parse is left alone
    }
  }
}

export function hookInstalled(folders) {
  return folders.some((folder) => {
    try {
      return EVENTS.some((e) => read(join(folder, "settings.json")).hooks?.[e]?.some((entry) => entry.hooks?.some(isOurs)));
    } catch {
      return false;
    }
  });
}
