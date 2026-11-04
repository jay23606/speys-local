import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { hookInstalled, installHook, removeHook } from "./install-hook.js";

const dir = mkdtempSync(join(tmpdir(), "speys-hook-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const HOOK = "/app/applets/official/claude/hook.js";
const folder = (name, settings) => {
  const f = join(dir, name);
  mkdirSync(f);
  if (settings !== undefined) writeFileSync(join(f, "settings.json"), typeof settings === "string" ? settings : JSON.stringify(settings));
  return f;
};
const read = (f) => JSON.parse(readFileSync(join(f, "settings.json"), "utf8"));

test("adds its entries next to the user's own settings and hooks, and keeps a backup", () => {
  const f = folder("a", { model: "x", hooks: { Stop: [{ hooks: [{ type: "command", command: "my-script" }] }] } });
  assert.deepEqual(installHook([f], HOOK), []);
  const s = read(f);
  assert.equal(s.model, "x");
  assert.equal(s.hooks.Stop.length, 2);
  assert.equal(s.hooks.Stop[0].hooks[0].command, "my-script");
  assert.ok(hookInstalled([f]));
  assert.ok(existsSync(join(f, "settings.json.speys-backup")));
});

test("installing twice changes nothing, and a moved install replaces the old path", () => {
  const f = folder("b", {});
  installHook([f], HOOK);
  installHook([f], HOOK);
  assert.equal(read(f).hooks.Stop.length, 1);
  installHook([f], "/new/applets/official/claude/hook.js");
  assert.equal(read(f).hooks.Stop.length, 1);
  assert.match(read(f).hooks.Stop[0].hooks[0].command, /\/new\//);
});

test("remove takes only its own entries", () => {
  const f = folder("c", { hooks: { Stop: [{ hooks: [{ type: "command", command: "my-script" }] }] } });
  installHook([f], HOOK);
  removeHook([f]);
  assert.deepEqual(read(f).hooks, { Stop: [{ hooks: [{ type: "command", command: "my-script" }] }] });
  assert.equal(hookInstalled([f]), false);
});

test("a user's own hook.js is not taken for ours", () => {
  const own = ["node ~/.claude/hook.js", "node /home/me/.claude/hook.js", "node ~/tools/claude/hook.js", "node C:\\Users\\me\\.claude\\hook.js"];
  const hooks = { Stop: own.map((command) => ({ hooks: [{ type: "command", command }] })) };
  const f = folder("e", { hooks });
  assert.equal(hookInstalled([f]), false);
  installHook([f], HOOK);
  assert.deepEqual(read(f).hooks.Stop.slice(0, own.length), hooks.Stop);
  assert.ok(hookInstalled([f]));
  removeHook([f]);
  assert.deepEqual(read(f).hooks, hooks);
});

test("any install of this applet counts as ours", () => {
  for (const [i, dir] of ["official", "store", "custom"].entries()) {
    const f = folder(`f${i}`, {});
    installHook([f], `/old/applets/${dir}/claude/hook.js`);
    assert.ok(hookInstalled([f]));
    installHook([f], HOOK);
    assert.equal(read(f).hooks.Stop.length, 1);
    assert.ok(read(f).hooks.Stop[0].hooks[0].command.includes(`"${process.execPath}" "${HOOK}"`));
  }
  const f = folder("g", {});
  installHook([f], "C:\\app\\applets\\official\\claude\\hook.js");
  assert.ok(hookInstalled([f]));
});

test("an older plain entry of ours is replaced", () => {
  const f = folder("h", { hooks: { Stop: [{ hooks: [{ type: "command", command: `"${process.execPath}" "${HOOK}"` }] }] } });
  installHook([f], HOOK);
  assert.equal(read(f).hooks.Stop.length, 1);
  assert.equal(read(f).hooks.UserPromptSubmit.length, 1);
});

test("the command runs the hook with its input, and does nothing once the hook or Node is gone", { skip: process.platform === "win32" }, () => {
  const hook = join(dir, "applets", "official", "claude", "hook.js");
  mkdirSync(join(hook, ".."), { recursive: true });
  const seen = join(dir, "seen.txt");
  writeFileSync(hook, `require("fs").writeFileSync(${JSON.stringify(seen)}, require("fs").readFileSync(0, "utf8")); process.exitCode = 0;`);
  const f = folder("i", {});
  installHook([f], hook);
  const cmd = read(f).hooks.Stop[0].hooks[0].command;
  const run = (c) => spawnSync("/bin/sh", ["-c", c], { input: "from claude", encoding: "utf8" });
  assert.equal(run(cmd).status, 0);
  assert.equal(readFileSync(seen, "utf8"), "from claude");
  for (const gone of [cmd.replaceAll(process.execPath, "/no/such/node"), cmd.replaceAll(hook, join(dir, "gone.js"))]) {
    const r = run(gone);
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, "", ""]);
  }
});

test("a broken settings file is left alone, a missing Claude folder is not created", () => {
  const f = folder("d", "{ not json");
  assert.deepEqual(installHook([f], HOOK), [f]);
  assert.equal(readFileSync(join(f, "settings.json"), "utf8"), "{ not json");
  installHook([join(dir, "missing")], HOOK);
  assert.equal(existsSync(join(dir, "missing")), false);
});
