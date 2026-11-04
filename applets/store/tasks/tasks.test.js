import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOp, moveBetween, toLf } from "./tasks.js";

const FILE = "# Liste\n\n- [ ] Birinci #bugün\n  not satırı\n  - [ ] alt iş\n- [ ] İkinci\n";

test("no operation when the file has changed", () => {
  assert.equal(applyOp(FILE, { action: "toggle", line: 2, text: "- [ ] Başka", done: true }), null);
});

test("a tick keeps tags and writes then removes the finish date", () => {
  const text = "- [ ] Birinci #bugün";
  const done = applyOp(FILE, { action: "toggle", line: 2, text, done: true }, true).split("\n")[2];
  assert.match(done, /^- \[x\] Birinci #bugün #bitti-\d{4}-\d{2}-\d{2}$/);
  const back = applyOp(FILE.replace(text, done), { action: "toggle", line: 2, text: done, done: false }, true);
  assert.equal(back.split("\n")[2], text);
});

test("deleting also removes the subtasks", () => {
  assert.equal(applyOp(FILE, { action: "delete", line: 2, text: "- [ ] Birinci #bugün" }), "# Liste\n\n- [ ] İkinci\n");
});

test("a new task goes under the title", () => {
  assert.equal(applyOp(FILE, { action: "add", newText: " Yeni  iş " }).split("\n")[2], "- [ ] Yeni iş");
});

test("a task cannot move into its own subtask", () => {
  const op = { action: "move", line: 2, text: "- [ ] Birinci #bugün", targetLine: 4, targetText: "  - [ ] alt iş" };
  assert.equal(applyOp(FILE, op), null);
});

test("moving between lists takes the block with its indentation", () => {
  const moved = moveBetween(FILE, "# Öteki\n", 4, "  - [ ] alt iş");
  assert.equal(moved.target, "# Öteki\n\n- [ ] alt iş");
  assert.ok(!moved.source.includes("alt iş"));
});

test("a tab-indented block is a subtask: delete, move and add treat it as one", () => {
  const tabs = "- [ ] parent\n\t- [ ] child\n\t\t- [ ] grandchild\n- [ ] other\n";
  assert.equal(applyOp(tabs, { action: "delete", line: 0, text: "- [ ] parent" }), "- [ ] other\n");
  assert.equal(
    applyOp(tabs, { action: "move", line: 1, text: "\t- [ ] child", targetLine: 3, targetText: "- [ ] other", position: "after" }),
    "- [ ] parent\n- [ ] other\n- [ ] child\n\t- [ ] grandchild\n",
  );
  assert.equal(moveBetween(tabs, "# Other\n", 1, "\t- [ ] child").target, "# Other\n\n- [ ] child\n\t- [ ] grandchild");
  assert.equal(
    applyOp(tabs, { action: "add", newText: "new", parentLine: 1, parentText: "\t- [ ] child" }),
    "- [ ] parent\n\t- [ ] child\n\t\t- [ ] grandchild\n   - [ ] new\n- [ ] other\n",
  );
});

const CRLF = "# List\r\n\r\n- [ ] One\r\n  - [ ] Sub\r\n- [ ] Two\r\n";

test("CRLF files work and keep their line endings", () => {
  assert.equal(toLf(CRLF), "# List\n\n- [ ] One\n  - [ ] Sub\n- [ ] Two\n");
  assert.equal(applyOp(CRLF, { action: "toggle", line: 2, text: "- [ ] One", done: true }), CRLF.replace("- [ ] One", "- [x] One"));
  assert.equal(applyOp(CRLF, { action: "delete", line: 2, text: "- [ ] One" }), "# List\r\n\r\n- [ ] Two\r\n");
  assert.equal(applyOp(CRLF, { action: "add", newText: "New" }), "# List\r\n\r\n- [ ] New\r\n- [ ] One\r\n  - [ ] Sub\r\n- [ ] Two\r\n");
  assert.equal(
    applyOp(CRLF, { action: "add", newText: "New", parentLine: 2, parentText: "- [ ] One" }),
    "# List\r\n\r\n- [ ] One\r\n  - [ ] Sub\r\n  - [ ] New\r\n- [ ] Two\r\n",
  );
});

test("moving between lists keeps each file's own line endings", () => {
  const moved = moveBetween(CRLF, "# Other\n\n- [ ] Old\n", 2, "- [ ] One");
  assert.equal(moved.source, "# List\r\n\r\n- [ ] Two\r\n");
  assert.equal(moved.target, "# Other\n\n- [ ] One\n  - [ ] Sub\n- [ ] Old\n");
  const back = moveBetween("# Other\n\n- [ ] Old\n  - [ ] Sub\n", CRLF, 2, "- [ ] Old");
  assert.equal(back.target, "# List\r\n\r\n- [ ] Old\r\n  - [ ] Sub\r\n- [ ] One\r\n  - [ ] Sub\r\n- [ ] Two\r\n");
});
