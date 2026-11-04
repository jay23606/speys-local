// Tasks: md lists in each project's own folder. Files stay where they are; only the list files named in the
// settings are written. Projects come from data/settings.json → "tasks".
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { GITHUB_LISTS, createGithub } from "./github.js";
import { applyOp, moveBetween, toLf } from "./tasks.js";

const expand = (p) => (typeof p === "string" && p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const isFile = (path) => existsSync(path) && statSync(path).isFile();
const isFolder = (path) => typeof path === "string" && existsSync(path) && statSync(path).isDirectory();

/** A one-level pattern such as `listeler/*.md`; a number at the start of a file name gives the order. */
function matchPattern(folder, pattern) {
  const at = pattern.lastIndexOf("/");
  const dir = at === -1 ? "" : pattern.slice(0, at);
  const suffix = pattern.slice(at + 1).replace(/^\*/, "");
  const full = join(folder, dir);
  if (!isFolder(full)) return [];
  return readdirSync(full).filter((f) => f.endsWith(suffix) && isFile(join(full, f))).sort().map((f) => (dir ? `${dir}/${f}` : f));
}

/** A project with no usable folder has no lists; one bad entry must not take the others down. */
const listNames = (p) => {
  if (!isFolder(p.folder)) return [];
  return Array.isArray(p.files) ? p.files.filter((f) => isFile(join(p.folder, f))) : matchPattern(p.folder, typeof p.pattern === "string" ? p.pattern : "*.md");
};

function iconType(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  return bytes.subarray(0, 500).includes("<svg") ? "image/svg+xml" : "image/x-icon";
}

function send(res, code, body, type = "application/json; charset=utf-8", cache = "no-store") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": cache });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((done, fail) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => done(body));
    req.on("error", fail);
  });
}

export default function create({ dataDir, settings, saveSettings, t }) {
  const github = createGithub({ dataDir, t });
  const projects = () =>
    (Array.isArray(settings().projects) ? settings().projects : []).filter((p) => p && typeof p === "object" && p.id)
      .map((p) => ({ ...p, folder: expand(p.folder), icon: expand(p.icon) }));

  /** From the form on the page, for someone who doesn't want to write JSON in Settings. */
  function addProject({ name, folder }) {
    const title = String(name ?? "").trim(), path = String(folder ?? "").trim();
    if (!title) throw new Error(t("name is empty"));
    if (!isFolder(expand(path))) throw new Error(t("Folder not found: {path}", { path }));
    const taken = new Set(projects().map((p) => p.id));
    const base = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "project";
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    const current = settings();
    saveSettings({ ...current, projects: [...(Array.isArray(current.projects) ? current.projects : []), { id, name: title, folder: path, pattern: "*.md" }] });
    return id;
  }

  /** A first list for a project whose folder has none. */
  function createList(id) {
    const project = projects().find((p) => p.id === id);
    if (!project || !isFolder(project.folder) || listNames(project).length) throw new Error(t("invalid project"));
    const name = Array.isArray(project.files) ? project.files[0] : (typeof project.pattern === "string" ? project.pattern : "*.md").replace("*", "tasks");
    if (!name || name.includes("..")) throw new Error(t("invalid file"));
    const file = join(project.folder, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "# Tasks\n\n");
    return name;
  }

  const fileLists = (p) => listNames(p).map((a) => ({
    ad: a,
    claude: (p.claude || []).includes(a),
    bitenler: a === p.doneList,
    icerik: toLf(readFileSync(join(p.folder, a), "utf8")),
  }));

  /** A project can have a repo's GitHub lists, list files, or both: GitHub comes first, read only once opened. */
  const overview = () => ({
    projeler: projects().map((p) => ({
      id: p.id,
      ad: p.name || p.id,
      listeler: [
        ...(p.github ? github.known(p.github, p.githubLists) : []),
        ...(p.github && !p.folder ? [] : fileLists(p)),
      ],
      bitis_tarihi: !!p.finishDate && !p.github,
      ikon: !!p.icon,
      sekme: "gorevler",
      ...(p.github ? { github: p.github } : {}),
    })),
  });

  /** Only one of the project's list files; no other path is accepted. */
  function listPath(project, name) {
    if (!listNames(project).includes(name)) throw new Error(t("invalid file"));
    return join(project.folder, name);
  }

  function write({ proje, ad, op, tasi }) {
    const project = projects().find((p) => p.id === proje);
    if (!project) throw new Error(t("invalid project"));
    if (project.github && GITHUB_LISTS.includes(ad)) return github.write(project.github, ad, op);
    if (tasi) {
      const from = listPath(project, tasi.kaynak);
      const to = listPath(project, tasi.hedef);
      const moved = moveBetween(readFileSync(from, "utf8"), readFileSync(to, "utf8"), tasi.satir, tasi.metin);
      if (!moved) return false;
      writeFileSync(to, moved.target);
      writeFileSync(from, moved.source);
      return true;
    }
    const file = listPath(project, ad);
    const next = applyOp(readFileSync(file, "utf8"), op, !!project.finishDate);
    if (next === null) return false;
    writeFileSync(file, next);
    return true;
  }

  return async (req, res) => {
    const path = req.url.split("?")[0];
    if (req.method === "GET" && path === "/") {
      return send(res, 200, readFileSync(join(import.meta.dirname, "index.html")), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && path === "/api/gorevler") return send(res, 200, overview());
    if (req.method === "GET" && path === "/api/gorevler/github") {
      const q = new URL(req.url, "http://local").searchParams, ad = q.get("ad");
      const project = projects().find((p) => p.id === q.get("proje"));
      if (!project?.github || !GITHUB_LISTS.includes(ad)) return send(res, 404, { error: t("not found") });
      return send(res, 200, (await github.lists(project.github, [ad]))[0]);
    }
    if (req.method === "GET" && path.startsWith("/ikon/")) {
      const project = projects().find((p) => p.id === path.slice(6));
      if (!project?.icon || !existsSync(project.icon)) return send(res, 404, { error: t("not found") });
      const bytes = readFileSync(project.icon);
      return send(res, 200, bytes, iconType(bytes), "max-age=86400");
    }
    if (req.method === "POST" && (path === "/api/proje" || path === "/api/liste")) {
      if (req.headers["x-panel"] !== "1") return send(res, 403, { error: t("forbidden") });
      try {
        const body = JSON.parse((await readBody(req)) || "{}");
        return send(res, 200, path === "/api/proje" ? { id: addProject(body) } : { ad: createList(body.proje) });
      } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
      }
    }
    if (req.method === "POST" && path === "/api/gorevler") {
      if (req.headers["x-panel"] !== "1") return send(res, 403, { error: t("forbidden") });
      try {
        const ok = await write(JSON.parse((await readBody(req)) || "{}"));
        // 409: the file changed in the meantime; the page reloads
        return send(res, ok ? 200 : 409, { ok });
      } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
      }
    }
    send(res, 404, { error: t("not found") });
  };
}
