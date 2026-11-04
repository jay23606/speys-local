// The automatic update check can be switched off, and switching it needs the panel's header.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = 3493;
const BASE = `http://localhost:${PORT}`;

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

const setAuto = (on, headers = { "X-Panel": "1" }) => fetch(`${BASE}/api/update/auto`, { method: "POST", headers, body: JSON.stringify({ on }) });

test("the switch needs the panel's header", async () => {
  assert.equal((await setAuto(false, {})).status, 403);
});

test("the check is on by default and can go off; nothing asks before a check", async () => {
  const status = () => fetch(`${BASE}/api/update`).then((r) => r.json());
  const version = await fetch(`${BASE}/api/version`).then((r) => r.json());
  assert.equal(version.update, null);
  assert.equal((await status()).autoCheck, true);

  assert.equal((await setAuto(false)).status, 200);
  assert.equal((await status()).autoCheck, false);
  const settings = JSON.parse(readFileSync(join(home, ".speys-local", "settings.json"), "utf8"));
  assert.equal(settings._dashboard.autoUpdateCheck, false);
});
