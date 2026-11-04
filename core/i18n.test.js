// Every text marked for translation has its Turkish, and the language reaches the page.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { format, messagesOf } from "../lib/i18n.js";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = 3492;
const BASE = `http://localhost:${PORT}`;

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return ["sozluk", "modules", "locales", "node_modules"].includes(name) ? [] : sources(path);
    return [".js", ".html"].includes(extname(name)) && !name.endsWith(".test.js") ? [path] : [];
  });
}

const literals = (text) => [...text.matchAll(/(?<![\w.$])t\(\s*"((?:[^"\\]|\\.)*)"/g), ...text.matchAll(/(?<![\w.$])t\(\s*'((?:[^'\\]|\\.)*)'/g)]
  .map((m) => m[1].replace(/\\(.)/g, "$1"));

const folders = [join(ROOT, "core"), ...readdirSync(join(ROOT, "applets", "store")).map((id) => join(ROOT, "applets", "store", id)).filter((p) => statSync(p).isDirectory())];

for (const folder of folders) {
  test(`${folder.slice(ROOT.length + 1)}: every t() has a Turkish translation`, () => {
    const messages = messagesOf(folder, "tr");
    const core = messagesOf(join(ROOT, "core"), "tr");
    const missing = [...new Set(sources(folder).flatMap((f) => literals(readFileSync(f, "utf8"))))].filter((k) => !(k in messages) && !(k in core));
    assert.deepEqual(missing, []);
  });

  const manifest = join(folder, "applet.json");
  if (existsSync(manifest)) {
    test(`${folder.slice(ROOT.length + 1)}: applet.json text has a Turkish translation`, () => {
      const a = JSON.parse(readFileSync(manifest, "utf8"));
      const messages = messagesOf(folder, "tr");
      const texts = [a.name, a.description, a.category, a.reads, ...(a.settings || []).flatMap((f) => [f.label, f.hint, f.placeholder])].filter(Boolean);
      assert.deepEqual(texts.filter((k) => !(k in messages) && k !== a.name), []);
    });
  }
}

test("format fills in values and leaves unknown ones", () => {
  assert.equal(format("{n} open, {x}", { n: 3 }), "3 open, {x}");
});

const home = mkdtempSync(join(tmpdir(), "speys-local-"));
let server;

before(async () => {
  server = spawn(process.execPath, [join(ROOT, "start.js"), "--port", String(PORT), "--no-open"], {
    env: { ...process.env, HOME: home, USERPROFILE: home, SPEYS_LOCAL_HOME: join(home, ".speys-local"), CLAUDE_CONFIG_DIR: "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/api/applets`);
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  throw new Error("the server did not start");
});

after(() => {
  server.kill();
  rmSync(home, { recursive: true, force: true });
});

const kit = (language, referer = `${BASE}/a/crm/`) => fetch(`${BASE}/kit.js`, { headers: { "Accept-Language": language, Referer: referer } }).then((r) => r.text());

test("the browser language picks the messages; English carries none", async () => {
  assert.match(await kit("en"), /window\.I18N=\{"language":"en","messages":\{\}\}/);
  assert.match(await kit("tr-TR,tr;q=0.9"), /window\.I18N=\{"language":"tr","messages":\{"/);
  assert.match(await kit("de"), /"language":"en"/);
});

test("the chosen language beats the browser, and empty goes back to it", async () => {
  const set = (language) => fetch(`${BASE}/api/language`, { method: "POST", headers: { "X-Panel": "1", "Content-Type": "application/json" }, body: JSON.stringify({ language }) });
  assert.equal((await set("tr")).status, 200);
  assert.match(await kit("en"), /"language":"tr"/);
  assert.equal((await set("")).status, 200);
  assert.match(await kit("en"), /"language":"en"/);
  assert.equal((await set("xx")).status, 400);
});
