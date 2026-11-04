// Reads the Claude folders: sizes, memories and setup. Session transcripts are only measured: what was said in them may
// hold secrets, so the only thing read from one is its working folder. Of settings, env values and MCP arguments stay out.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const HEADER_BYTES = 64 * 1024;
const MAX_BODY = 200 * 1024;
const BIGGEST_SESSIONS = 20;

const expand = (p) => (typeof p === "string" && /^~[\\/]/.test(p) ? join(homedir(), p.slice(2)) : p);
export const tilde = (p, home = homedir()) => (typeof p === "string" && p.startsWith(home) ? `~${p.slice(home.length)}` : p);
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null; // missing or being written: counts as empty
  }
};
const isFolder = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** The folders named in the settings, else ~/.claude, CLAUDE_CONFIG_DIR and ~/.claude-* with sessions in them. */
export function findFolders(saved, home = homedir(), env = process.env) {
  const named = Array.isArray(saved) ? saved.map((f) => expand(typeof f === "string" ? f : f?.path)) : null;
  const others = () => readdirSync(home).filter((f) => f.startsWith(".claude-") && isFolder(join(home, f, "projects"))).sort().map((f) => join(home, f));
  const list = named?.length ? named : [join(home, ".claude"), env.CLAUDE_CONFIG_DIR, ...others()];
  return [...new Set(list.filter(Boolean))].filter(isFolder);
}

/** Bytes and files under a path. Symbolic links count as themselves, so a link can't lead outside or around in circles. */
async function measure(path) {
  const info = await lstat(path).catch(() => null);
  if (!info) return { size: 0, files: 0 };
  if (!info.isDirectory()) return { size: info.size, files: 1 };
  const total = { size: 0, files: 0 };
  const names = await readdir(path).catch(() => []);
  for (const name of names) {
    const part = await measure(join(path, name));
    total.size += part.size;
    total.files += part.files;
  }
  return total;
}

async function workingFolder(file) {
  const handle = await open(file, "r").catch(() => null);
  if (!handle) return null;
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(buffer.toString("utf8", 0, bytesRead));
    return m ? JSON.parse(`"${m[1]}"`) : null;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

async function projectOf(root, dir) {
  const path = join(root, dir);
  const names = await readdir(path).catch(() => []);
  const sessions = [];
  for (const name of names.filter((n) => n.endsWith(".jsonl"))) {
    const file = join(path, name), id = name.slice(0, -6);
    const info = await lstat(file).catch(() => null);
    if (!info) continue;
    // a session's sub-agents and saved tool output sit in a folder with its name
    const extra = names.includes(id) ? await measure(join(path, id)) : { size: 0 };
    sessions.push({ id, file, size: info.size + extra.size, modified: info.mtimeMs });
  }
  sessions.sort((a, b) => b.modified - a.modified);
  let cwd = null;
  for (const s of sessions.slice(0, 5)) if ((cwd = await workingFolder(s.file))) break;
  return { dir, cwd, name: cwd ? basename(cwd) : dir, sessions: sessions.map(({ file: _file, ...s }) => s), ...(await measure(path)), modified: sessions[0]?.modified ?? null };
}

/** The text between the first two --- lines: top-level and one-level-down `key: value`. */
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const fields = {};
  if (!m) return fields;
  for (const line of m[1].split(/\r?\n/)) {
    const f = /^\s*([\w-]+):\s*(.+)$/.exec(line);
    if (!f || f[1] in fields) continue;
    const value = f[2].trim();
    try {
      fields[f[1]] = value.startsWith('"') ? JSON.parse(value) : value;
    } catch {
      fields[f[1]] = value;
    }
  }
  return fields;
}
const stripFront = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, "");

async function textFile(file) {
  const info = await lstat(file).catch(() => null);
  if (!info?.isFile()) return null;
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) return null;
  return { text: text.slice(0, MAX_BODY), size: info.size, modified: info.mtimeMs };
}

async function memoriesOf(folder, projects, home) {
  const out = [];
  for (const project of projects) {
    const dir = join(folder, "projects", project.dir, "memory");
    for (const name of await readdir(dir).catch(() => [])) {
      if (!name.endsWith(".md") || name === "MEMORY.md") continue;
      const file = await textFile(join(dir, name));
      if (!file) continue;
      const front = frontmatter(file.text);
      out.push({
        project: project.name, file: name, path: tilde(join(dir, name), home), name: front.name || name.slice(0, -3),
        description: front.description || "", type: front.type || "", size: file.size, modified: file.modified, body: stripFront(file.text),
      });
    }
  }
  return out;
}

async function instructionsOf(folder, cwds, home) {
  const candidates = [
    { scope: "Global", file: join(folder, "CLAUDE.md") },
    ...cwds.flatMap(({ name, cwd }) => ["CLAUDE.md", "CLAUDE.local.md", join(".claude", "CLAUDE.md")].map((f) => ({ scope: name, file: join(cwd, f) }))),
  ];
  const out = [];
  for (const { scope, file } of candidates) {
    const read = await textFile(file);
    if (read) out.push({ scope, path: tilde(file, home), size: read.size, modified: read.modified, body: read.text });
  }
  return out;
}

async function skillsOf(folder) {
  const root = join(folder, "skills"), out = [];
  for (const name of await readdir(root).catch(() => [])) {
    const file = await textFile(join(root, name, "SKILL.md"));
    if (!file) continue;
    const front = frontmatter(file.text);
    out.push({ name: front.name || name, description: front.description || "", size: (await measure(join(root, name))).size });
  }
  return out;
}

/** The entries of one settings file a person wants to check; env and anything else stays out. */
function settingsOf(file, home) {
  const s = readJson(file);
  if (!s) return null;
  const hooks = Object.entries(s.hooks || {}).flatMap(([event, entries]) => (Array.isArray(entries) ? entries : []).flatMap((e) =>
    (e.hooks || []).map((h) => ({ event, matcher: e.matcher || "", command: String(tilde(String(h.command ?? ""), home)).replaceAll(home, "~") }))));
  const rules = (k) => (Array.isArray(s.permissions?.[k]) ? s.permissions[k].map(String) : []);
  return {
    path: tilde(file, home), hooks, allow: rules("allow"), ask: rules("ask"), deny: rules("deny"),
    plugins: Object.entries(s.enabledPlugins || {}).filter(([, on]) => on).map(([id]) => id),
  };
}

function mcpOf(folder, home) {
  const account = readJson(folder === join(home, ".claude") ? join(home, ".claude.json") : join(folder, ".claude.json"));
  if (!account) return [];
  const names = new Map(Object.keys(account.mcpServers || {}).map((name) => [name, "all projects"]));
  for (const [path, project] of Object.entries(account.projects || {})) {
    for (const name of Object.keys(project?.mcpServers || {})) if (!names.has(name)) names.set(name, basename(path));
  }
  return [...names].map(([name, where]) => ({ name, where }));
}

function pluginsOf(folder) {
  const installed = readJson(join(folder, "plugins", "installed_plugins.json"));
  return Object.keys(installed?.plugins || {});
}

export async function overview(saved, home = homedir(), env = process.env) {
  const folders = [];
  for (const folder of findFolders(saved, home, env)) {
    const items = [];
    for (const name of await readdir(folder).catch(() => [])) items.push({ name, ...(await measure(join(folder, name))) });
    items.sort((a, b) => b.size - a.size);
    const root = join(folder, "projects"), projects = [];
    for (const dir of await readdir(root).catch(() => [])) if (isFolder(join(root, dir))) projects.push(await projectOf(root, dir));
    projects.sort((a, b) => b.size - a.size);
    const cwds = [...new Map(projects.filter((p) => p.cwd && existsSync(p.cwd)).map((p) => [p.cwd, p])).values()];
    folders.push({
      path: tilde(folder, home), size: items.reduce((t, i) => t + i.size, 0), files: items.reduce((t, i) => t + i.files, 0), items,
      projects: projects.map(({ sessions, cwd, ...p }) => ({ ...p, cwd: tilde(cwd, home), sessionCount: sessions.length })),
      biggest: projects.flatMap((p) => p.sessions.map((s) => ({ ...s, project: p.name }))).sort((a, b) => b.size - a.size).slice(0, BIGGEST_SESSIONS),
      memories: await memoriesOf(folder, projects, home),
      instructions: await instructionsOf(folder, cwds, home),
      skills: await skillsOf(folder),
      plugins: pluginsOf(folder),
      mcp: mcpOf(folder, home),
      settings: ["settings.json", "settings.local.json"].map((f) => settingsOf(join(folder, f), home)).filter(Boolean),
    });
  }
  return { folders, scannedAt: Date.now() };
}
