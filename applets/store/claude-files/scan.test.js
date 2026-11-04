import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { findFolders, frontmatter, overview } from "./scan.js";

const home = mkdtempSync(join(tmpdir(), "speys-claude-files-"));
after(() => rmSync(home, { recursive: true, force: true }));
const put = (path, text = "") => {
  const file = join(home, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const SECRET = "sk-very-secret-value";
const code = join(home, "code", "app");

put(".claude/CLAUDE.md", "be brief");
put("code/app/CLAUDE.md", "project rules");
put(".claude/projects/-code-app/s1.jsonl", `${JSON.stringify({ cwd: code, message: `my key is ${SECRET}` })}\n`);
put(".claude/projects/-code-app/s1/subagents/a.jsonl", "x".repeat(5000));
put(".claude/projects/-code-app/memory/MEMORY.md", "- index");
put(".claude/projects/-code-app/memory/tone.md", '---\nname: tone\ndescription: "Keep it short"\nmetadata:\n  type: feedback\n---\n\nShort answers.');
put(".claude/skills/demo/SKILL.md", "---\nname: demo\ndescription: A demo skill\n---\nbody");
put(".claude/settings.json", JSON.stringify({ env: { TOKEN: SECRET }, enabledPlugins: { "a@b": true, "c@d": false }, permissions: { allow: ["Bash(ls)"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: `node ${home}/h.js` }] }] } }));
put(".claude.json", JSON.stringify({ mcpServers: { one: { env: { KEY: SECRET } } }, projects: { [code]: { mcpServers: { two: { args: [SECRET] } } } } }));
put(".claude-2/projects/-x/s.jsonl", "{}\n");
put(".claude-empty/file", "");
symlinkSync(home, join(home, ".claude", "loop"));

const data = await overview(undefined, home, {});
const main = data.folders[0];

test("finds the default folders, and the named ones when set", () => {
  assert.deepEqual(findFolders(undefined, home, {}), [join(home, ".claude"), join(home, ".claude-2")]);
  assert.deepEqual(findFolders([join(home, ".claude-2")], home, {}), [join(home, ".claude-2")]);
  assert.deepEqual(findFolders(["/no/such/folder"], home, {}), []);
});

test("a session counts with its folder, and a link is not followed", () => {
  assert.equal(main.biggest[0].project, "app");
  assert.ok(main.biggest[0].size > 5000);
  assert.ok(main.size < 20_000);
  assert.equal(main.projects[0].sessionCount, 1);
  assert.equal(main.projects[0].cwd, "~/code/app");
});

test("memories come with their fields, without the index", () => {
  assert.deepEqual(main.memories.map((m) => [m.name, m.description, m.type, m.project, m.body]), [["tone", "Keep it short", "feedback", "app", "Short answers."]]);
});

test("setup lists instructions, skills, plugins, hooks and permissions", () => {
  assert.deepEqual(main.instructions.map((i) => [i.scope, i.path, i.body]), [["Global", "~/.claude/CLAUDE.md", "be brief"], ["app", "~/code/app/CLAUDE.md", "project rules"]]);
  assert.deepEqual(main.skills.map((s) => [s.name, s.description]), [["demo", "A demo skill"]]);
  assert.deepEqual(main.settings[0].plugins, ["a@b"]);
  assert.deepEqual(main.settings[0].allow, ["Bash(ls)"]);
  assert.equal(main.settings[0].hooks[0].command, "node ~/h.js");
  assert.deepEqual(main.mcp, [{ name: "one", where: "all projects" }, { name: "two", where: "app" }]);
});

test("nothing from a transcript, env or MCP arguments comes through", () => {
  assert.ok(!JSON.stringify(data).includes(SECRET));
});

test("frontmatter tolerates what it can't read", () => {
  assert.deepEqual(frontmatter("no front"), {});
  assert.equal(frontmatter('---\ndescription: "broken\n---').description, '"broken');
});
