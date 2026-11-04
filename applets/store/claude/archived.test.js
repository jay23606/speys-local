import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { appDataFolder, archiveReader, readDesktopArchive, readEditorArchive } from "./archived.js";
import { sessions } from "./sessions.js";

const root = mkdtempSync(join(tmpdir(), "claude-archive-"));
after(() => rmSync(root, { recursive: true, force: true }));
let next = 0;
const folder = () => {
  const dir = join(root, String(next++));
  mkdirSync(dir, { recursive: true });
  return dir;
};

function editorDb(appData, value, app = "Code") {
  const dir = join(appData, app, "User", "globalStorage");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "state.vscdb");
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE, value TEXT)");
  if (value !== undefined) db.prepare("INSERT OR REPLACE INTO ItemTable VALUES ('Anthropic.claude-code', ?)").run(value);
  db.close();
  return file;
}

function desktopSession(appData, name, content) {
  const dir = join(appData, "Claude", "claude-code-sessions", "account", "org");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
}

test("the app data folder of each system", () => {
  assert.equal(appDataFolder("win32", "C:/Users/a", { APPDATA: "C:/Users/a/AppData/Roaming" }), "C:/Users/a/AppData/Roaming");
  assert.equal(appDataFolder("darwin", "/Users/a", {}), join("/Users/a", "Library", "Application Support"));
  assert.equal(appDataFolder("linux", "/home/a", {}), join("/home/a", ".config"));
});

test("reads the ids the extension hid", () => {
  assert.deepEqual(readEditorArchive(editorDb(folder(), JSON.stringify({ hiddenSessionIds: ["a", 5, "b"] }))), ["a", "b"]);
  assert.deepEqual(readEditorArchive(editorDb(folder(), JSON.stringify({ other: 1 }))), []);
  assert.deepEqual(readEditorArchive(editorDb(folder())), []);
});

test("reads only the archived desktop sessions and skips a broken file", () => {
  const appData = folder();
  desktopSession(appData, "local_1.json", JSON.stringify({ isArchived: true, cliSessionId: "kept" }));
  desktopSession(appData, "local_2.json", JSON.stringify({ isArchived: false, cliSessionId: "open" }));
  desktopSession(appData, "local_3.json", "{ broken");
  desktopSession(appData, "other.json", JSON.stringify({ isArchived: true, cliSessionId: "not a session" }));
  assert.deepEqual(readDesktopArchive(join(appData, "Claude", "claude-code-sessions")), ["kept"]);
});

test("a computer with neither has nothing archived", () => {
  assert.deepEqual([...archiveReader({ appData: join(root, "missing") })()], []);
});

test("joins every source and notices a change in the database", () => {
  const appData = folder();
  const file = editorDb(appData, JSON.stringify({ hiddenSessionIds: ["one"] }));
  editorDb(appData, JSON.stringify({ hiddenSessionIds: ["cursor"] }), "Cursor");
  desktopSession(appData, "local_1.json", JSON.stringify({ isArchived: true, cliSessionId: "desktop" }));
  const read = archiveReader({ appData });
  assert.deepEqual([...read()].sort(), ["cursor", "desktop", "one"]);
  editorDb(appData, JSON.stringify({ hiddenSessionIds: ["two"] }));
  utimesSync(file, new Date(), new Date(Date.now() + 5000));
  assert.deepEqual([...read()].sort(), ["cursor", "desktop", "two"]);
});

test("an unreadable database keeps what was last read", () => {
  const appData = folder();
  const file = editorDb(appData, JSON.stringify({ hiddenSessionIds: ["one"] }));
  const read = archiveReader({ appData });
  assert.deepEqual([...read()], ["one"]);
  writeFileSync(file, "this is not a database");
  assert.deepEqual([...read()], ["one"]);
});

test("the session list leaves archived sessions out", () => {
  const base = folder();
  const project = join(base, "projects", "demo");
  mkdirSync(project, { recursive: true });
  for (const id of ["open", "hidden"]) writeFileSync(join(project, `${id}.jsonl`), `${JSON.stringify({ cwd: "/work/demo", type: "last-prompt", lastPrompt: id })}\n`);
  const list = (hidden) => sessions({ folders: [{ path: base, label: "Claude" }], eventsFile: join(base, "none.jsonl"), projectsRoot: "/work", t: (s) => s, hidden }).map((s) => s.oturum).sort();
  assert.deepEqual(list(), ["hidden", "open"]);
  assert.deepEqual(list(new Set(["hidden"])), ["open"]);
});
