// Opening with an empty home folder: with no custom applets, settings or data, every applet must open without an error.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = 3491;
const BASE = `http://localhost:${PORT}`;
const API = {
  today: "/api/habits",
  claude: "/api/oturumlar",
  crm: "/api/crm",
  kasa: "/api/kasa",
  seo: "/api/seo",
  sosyal: "/api/sosyal",
  tasks: "/api/gorevler",
  yazim: "/api/yazim",
};
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

const ids = readdirSync(join(ROOT, "applets", "store"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const preinstalled = ids.filter((id) => JSON.parse(readFileSync(join(ROOT, "applets", "store", id, "applet.json"), "utf8")).preinstalled);
const store = (path, id) => fetch(`${BASE}/api/store/${path}`, { method: "POST", headers: { "X-Panel": "1", "Content-Type": "application/json" }, body: JSON.stringify({ id }) });

test("a new install starts with the preinstalled applets; the others wait in the Store with no page", async () => {
  const shown = (await (await fetch(`${BASE}/api/applets`)).json()).filter((a) => a.enabled && a.visibility === "store").map((a) => a.id);
  assert.deepEqual(shown.sort(), [...preinstalled].sort());
  const listed = (await (await fetch(`${BASE}/api/store`)).json()).applets;
  assert.deepEqual(listed.map((a) => a.id).sort(), [...ids].sort());
  assert.equal(listed.find((a) => a.id === "crm").installed, false);
  assert.equal((await fetch(`${BASE}/a/crm/api/crm`)).status, 404);
  assert.equal((await store("install", "../x")).status, 400);
  assert.equal((await store("install", "crm")).status, 200);
  assert.equal((await fetch(`${BASE}/a/crm/api/crm`)).status, 200);
  assert.equal((await store("remove", "crm")).status, 200);
  assert.equal((await fetch(`${BASE}/a/crm/api/crm`)).status, 404);
  for (const id of ids) assert.equal((await store("install", id)).status, 200, id);
});

test("Store pictures are served, and nothing else from the applet's folder", async () => {
  const today = await fetch(`${BASE}/store-media/today/1.png`);
  assert.equal(today.headers.get("content-type"), "image/png");
  for (const path of ["today/applet.json", "today/..%2Fapplet.json", "..%2Fpackage.json/1.png", "nope/1.png"]) {
    assert.equal((await fetch(`${BASE}/store-media/${path}`)).status, 404, path);
  }
});

for (const id of ids) {
  test(`${id}: page opens`, async () => {
    const r = await fetch(`${BASE}/a/${id}/`);
    assert.equal(r.status, 200);
  });
}

for (const [id, path] of Object.entries(API)) {
  test(`${id}: endpoint works without settings`, async () => {
    const r = await fetch(`${BASE}/a/${id}${path}`);
    assert.equal(r.status, 200);
    await r.json();
  });
}

test("CRM starts with an empty book", async () => {
  const d = await (await fetch(`${BASE}/a/crm/api/crm`)).json();
  assert.equal(d.hatlar.length, 1);
  assert.equal(d.asamalar.length, 5);
  assert.deepEqual(d.kayitlar, []);
});

test("the demo workspace has its own data and leaves main alone", async () => {
  const post = (body) => fetch(`${BASE}/api/workspaces`, { method: "POST", headers: { "X-Panel": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post({ id: "demo" })).status, 200);
  const crm = await (await fetch(`${BASE}/a/crm/api/crm`)).json();
  assert.ok(crm.kayitlar.length > 3);
  const tasks = await (await fetch(`${BASE}/a/tasks/api/gorevler`)).json();
  assert.equal(tasks.projeler.length, 2);
  const sessions = await (await fetch(`${BASE}/a/claude/api/oturumlar`)).json();
  assert.equal(sessions.length, 4);
  const ledger = await (await fetch(`${BASE}/a/kasa/api/kasa`)).json();
  assert.ok(ledger.entries.length > 3);
  assert.equal((await fetch(`${BASE}/a/today/`)).status, 200);
  assert.equal((await post({ id: "main" })).status, 200);
  assert.deepEqual((await (await fetch(`${BASE}/a/crm/api/crm`)).json()).kayitlar, []);
  assert.equal((await post({ id: "../x" })).status, 400);
  assert.equal((await post({ create: "Client Work" })).status, 200);
  assert.ok((await (await fetch(`${BASE}/api/workspaces`)).json()).list.includes("client-work"));
  assert.equal((await post({ id: "main" })).status, 200);
});

test("a project can have GitHub lists and list files; only the files can be written", async () => {
  const folder = join(home, "both");
  mkdirSync(folder);
  writeFileSync(join(folder, "ideas.md"), "# Ideas\n\n- [ ] One\n");
  const json = (path, body) => fetch(`${BASE}${path}`, { method: "POST", headers: { "X-Panel": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  // A name that isn't a repo: the issues list exists but nothing goes to the network.
  const project = { id: "both", name: "Both", github: "not a repo", folder, files: ["ideas.md"] };
  assert.equal((await json("/api/settings", { values: [{ section: "tasks", key: "projects", value: JSON.stringify([project]) }] })).status, 200);
  const [{ listeler }] = (await (await fetch(`${BASE}/a/tasks/api/gorevler`)).json()).projeler;
  assert.deepEqual(listeler.map((l) => [l.ad, !!l.github]), [["issues", true], ["pulls", true], ["ideas.md", false]]);
  const op = { action: "toggle", line: 2, text: "- [ ] One", done: true };
  assert.equal((await json("/a/tasks/api/gorevler", { proje: "both", ad: "ideas.md", op })).status, 200);
  assert.match(readFileSync(join(folder, "ideas.md"), "utf8"), /- \[x\] One/);
  assert.equal((await json("/a/tasks/api/gorevler", { proje: "both", ad: "issues", op })).status, 400);
  assert.equal((await json("/api/settings", { values: [{ section: "tasks", key: "projects", value: "" }] })).status, 200);
});

test("office furniture is saved, and only known items", async () => {
  const send = (headers, body) => fetch(`${BASE}/a/claude/api/office`, { method: "POST", headers, body: JSON.stringify(body) });
  assert.deepEqual((await (await fetch(`${BASE}/a/claude/api/office`)).json()).items, ["clock", "painting", "whiteboard", "plant", "coffee", "cooler", "shelf", "lamp", "cat"]);
  assert.equal((await send({}, { items: [] })).status, 403);
  assert.equal((await send({ "X-Panel": "1" }, { items: "cat" })).status, 400);
  assert.equal((await send({ "X-Panel": "1" }, { items: ["cat", "<script>", "lamp"] })).status, 200);
  assert.deepEqual((await (await fetch(`${BASE}/a/claude/api/office`)).json()).items, ["lamp", "cat"]);
});

test("no personal paths in the code", () => {
  const paths = ["core/server.js", "applets/store/claude/backend.js", "applets/store/yazim/analyze.js", "applets/store/seo/backend.js", "applets/store/today/backend.js"];
  for (const p of paths) {
    const text = readFileSync(join(ROOT, p), "utf8");
    assert.doesNotMatch(text, /\/Users\/|\.claude-2|Speys Ltd/, p);
  }
});
