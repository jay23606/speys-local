// OwnLearn's Speys Local connection: takes the repo to scan from the settings, asks for it on first open.
// Progress stays in this applet's data folder; as long as the repo path stays the same, earlier progress carries on.
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { dataDir, writeJson } from "./src/learn.js";
import { scan } from "./src/scan.js";
import { modules } from "./src/modules/index.js";
import { handler } from "./src/server.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function readBody(req) {
  return new Promise((done, fail) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => done(body));
    req.on("error", fail);
  });
}

export default function create({ dataDir: appletData, settings, saveSettings, t, language }) {
  process.env.OWNLEARN_HOME = appletData;
  let open = null;

  /** Lessons exist in en and tr only. Asked on every request, so the scan stays and the language follows the setting. */
  const lessonLanguage = () => (language() === "tr" ? "tr" : "en");

  function repoPage(repo, problem) {
    return `<!doctype html><html lang="${esc(language())}"><meta charset="utf-8"><title>OwnLearn</title>
<style>:root{color-scheme:light dark}body{max-width:520px;margin:12vh auto;padding:0 20px;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
h1{font-size:20px;margin:0 0 6px}p{margin:0 0 16px;opacity:.7}.bad{color:#dc2626;opacity:1}
input{width:100%;padding:9px 11px;border:1px solid #8886;border-radius:8px;font:14px ui-monospace,Menlo,Consolas,monospace;background:transparent;color:inherit}
button{margin-top:10px;padding:8px 16px;border:0;border-radius:8px;background:#fb7a01;color:#fff;font-weight:600;cursor:pointer}</style>
<h1>${esc(t("Which of your code do you want to learn from?"))}</h1>
<p>${esc(t("Write the repo's folder path. The code never leaves this computer."))}</p>
${problem ? `<p class="bad">${esc(problem)}</p>` : ""}
<form method="post" action="./repo"><input name="repo" value="${esc(repo || "")}" placeholder="${esc(t("/Users/you/Projects/backend"))}" autofocus required><button>${esc(t("Scan"))}</button></form></html>`;
  }

  /** A scan can take a while on a big repo; it only runs when the applet opens and when the repo changes. */
  function load(repo) {
    const root = resolve(repo);
    if (!existsSync(root) || !statSync(root).isDirectory()) return t("Folder not found: {root}", { root });
    const scanned = modules.map((mod) => ({ mod, map: scan(root, mod) })).filter(({ map }) => map.files > 0);
    if (!scanned.length) return t("This folder has no supported files ({names}).", { names: modules.map((m) => m.name).join(", ") });
    for (const { mod, map } of scanned) writeJson(join(dataDir(root), `map-${mod.id}.json`), map);
    open = handler({ root, scanned, lang: lessonLanguage });
    return null;
  }

  const page = (res, code, html) => {
    res.writeHead(code, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  };

  return async (req, res) => {
    const path = req.url.split("?")[0];
    if (path === "/repo") {
      if (req.method !== "POST") return page(res, 200, repoPage(settings().repo));
      const repo = new URLSearchParams(await readBody(req)).get("repo")?.trim();
      const problem = repo ? load(repo) : t("The folder path is empty.");
      if (problem) return page(res, 400, repoPage(repo, problem));
      saveSettings({ ...settings(), repo });
      res.writeHead(303, { Location: "./" });
      return res.end();
    }
    if (!open) {
      const { repo } = settings();
      const problem = repo ? load(repo) : null;
      if (!open) return page(res, 200, repoPage(repo, problem));
    }
    open(req, res);
  };
}
