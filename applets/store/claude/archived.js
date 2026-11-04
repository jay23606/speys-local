// Sessions the user archived: VS Code's Claude extension keeps them in its state database, the desktop app in each session's file.
// Neither is ours to change, so everything here only reads, and anything unreadable means "nothing archived".
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EDITORS = ["Code", "Code - Insiders", "Cursor"];
const EXTENSION_KEY = "Anthropic.claude-code";
const DESKTOP_CHECK_MS = 60_000;

export function appDataFolder(platform = process.platform, home = homedir(), env = process.env) {
  if (platform === "win32") return env.APPDATA || join(home, "AppData", "Roaming");
  return platform === "darwin" ? join(home, "Library", "Application Support") : join(home, ".config");
}

/** The ids in one editor's state database. */
export function readEditorArchive(file) {
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(EXTENSION_KEY);
    const ids = row ? JSON.parse(row.value).hiddenSessionIds : null;
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } finally {
    db.close();
  }
}

/** <folder>/<account>/<org>/local_*.json, each with `isArchived` and the id of the Claude Code session. */
export function readDesktopArchive(folder) {
  const ids = [];
  const subfolders = (dir) => readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(dir, e.name));
  for (const account of existsSync(folder) ? subfolders(folder) : []) {
    for (const org of subfolders(account)) {
      for (const name of readdirSync(org)) {
        if (!name.startsWith("local_") || !name.endsWith(".json")) continue;
        try {
          const session = JSON.parse(readFileSync(join(org, name), "utf8"));
          if (session.isArchived && session.cliSessionId) ids.push(session.cliSessionId);
        } catch {
          // being rewritten; the next check reads it
        }
      }
    }
  }
  return ids;
}

/**
 * Returns a function giving the current set of archived ids. The office asks every 10 seconds: an editor's database is
 * read again only when it changed, and the desktop folder at most once a minute.
 */
export function archiveReader({ appData = appDataFolder() } = {}) {
  const editors = new Map();
  let desktop = [], desktopAt = -Infinity;

  function editorIds(file) {
    let stamp;
    try {
      const { mtimeMs, size } = statSync(file);
      stamp = `${mtimeMs}:${size}`;
    } catch {
      return [];
    }
    const known = editors.get(file);
    if (known?.stamp === stamp) return known.ids;
    try {
      const ids = readEditorArchive(file);
      editors.set(file, { stamp, ids });
      return ids;
    } catch {
      return known?.ids ?? []; // locked for a moment: keep what was last read
    }
  }

  return () => {
    if (Date.now() - desktopAt > DESKTOP_CHECK_MS) {
      desktopAt = Date.now();
      try {
        desktop = readDesktopArchive(join(appData, "Claude", "claude-code-sessions"));
      } catch {
        desktop = [];
      }
    }
    const files = EDITORS.map((app) => join(appData, app, "User", "globalStorage", "state.vscdb"));
    return new Set([...desktop, ...files.flatMap(editorIds)]);
  };
}
