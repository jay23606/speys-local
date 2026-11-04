import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { createGithub, issueRow, pullRow, renderRows } from "./github.js";

const REPO = "acme/tool";
const issue = (number, extra = {}) => ({
  number, title: `Issue ${number}`, state: "open", labels: [], body: "", html_url: `https://github.com/${REPO}/issues/${number}`, ...extra,
});
const pull = (number, extra = {}) => ({
  number, title: `Pull ${number}`, state: "open", labels: [], body: "", html_url: `https://github.com/${REPO}/pull/${number}`,
  user: { login: "someone" }, author_association: "CONTRIBUTOR", created_at: new Date().toISOString(), draft: false,
  additions: 208, deletions: 50, changed_files: 23, ...extra,
});
const folders = [];
after(() => folders.forEach((f) => rmSync(f, { recursive: true, force: true })));

const t = (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, k) => values[k]);

/** A stand-in for the GitHub API that fails the test on anything but a read. */
function fakeGithub({ issues = [], pulls = [], token = "secret-token" } = {}) {
  const calls = [];
  const fetchFn = async (url, options) => {
    const { pathname, searchParams } = new URL(url);
    calls.push({ url, pathname, method: options.method ?? "GET", headers: options.headers });
    assert.ok(!options.method || options.method === "GET", "a list must never write to GitHub");
    const number = /\/pulls\/(\d+)$/.exec(pathname)?.[1];
    const state = searchParams.get("state");
    const data = number ? pulls.find((p) => p.number === +number)
      : pathname.endsWith("/pulls") ? pulls
      : issues.filter((i) => (i.state === "closed") === (state === "closed"));
    const etag = `"${JSON.stringify(data).length}-${url}"`;
    if (options.headers["If-None-Match"] === etag) return new Response(null, { status: 304 });
    return new Response(JSON.stringify(data), { status: 200, headers: { etag } });
  };
  const dataDir = mkdtempSync(join(tmpdir(), "speys-github-"));
  folders.push(dataDir);
  return { calls, github: createGithub({ dataDir, t, fetchFn, tokenFn: async () => token }) };
}
const lineOf = (text, words) => text.split("\n").findIndex((l) => l.includes(words));
const byName = (lists, name) => lists.find((l) => l.ad === name).icerik;

test("issues read as a list, and pull requests are left out of it", async () => {
  const { github } = fakeGithub({ issues: [
    issue(1, { labels: [{ name: "good first issue" }], body: "\n> - [ ] First line of the body\nmore" }),
    issue(2, { state: "closed", closed_at: "2026-10-01T12:00:00Z" }),
    issue(3, { pull_request: {} }),
  ] });
  const text = byName(await github.lists(REPO), "issues");
  assert.match(text, /^# Issues\n/);
  assert.match(text, /- \[ \] Issue 1 \[#1\]\(https:\/\/github\.com\/acme\/tool\/issues\/1\) #good-first-issue\n {2}\[ \] First line of the body\n/);
  assert.match(text, /- \[x\] Issue 2 \[#2\]\(.+\) #bitti-\d{4}-\d{2}-\d{2}\n/);
  assert.doesNotMatch(text, /Issue 3/);
});

test("a pull request shows who opened it, its size and how long it has waited", async () => {
  const { github } = fakeGithub({ pulls: [pull(19, { user: { login: "arda" }, author_association: "FIRST_TIME_CONTRIBUTOR", draft: true })] });
  const text = byName(await github.lists(REPO), "pulls");
  assert.match(text, /^# Pull requests\n/);
  assert.match(text, /- \[ \] Pull 19 \[#19\]\(.+\) · arda · 23 files · \+208 −50 · today #draft #first-time\n/);
});

test("a pull request's row knows who opened it; a picture comes only from GitHub's address", async () => {
  const avatar = "https://avatars.githubusercontent.com/u/1?v=4";
  const { github } = fakeGithub({ pulls: [
    pull(1, { user: { login: "arda", avatar_url: avatar } }),
    pull(2, { user: { login: "other", avatar_url: "https://evil.example/x.png" } }),
  ] });
  const list = (await github.lists(REPO)).find((l) => l.ad === "pulls");
  const lines = list.icerik.split("\n");
  assert.deepEqual(list.kisiler[lines.findIndex((l) => l.includes("Pull 1"))], { login: "arda", avatar });
  assert.deepEqual(list.kisiler[lines.findIndex((l) => l.includes("Pull 2"))], { login: "other", avatar: null });
});

test("the note skips headings and reads the first real line", () => {
  const { text } = renderRows([issueRow(issue(1, { body: "## Summary\n\n- Serve the icon\n- More" }))], {}, "Issues");
  assert.match(text, /\n {2}Serve the icon\n/);
  assert.doesNotMatch(text, /Summary/);
});

test("pull request wording: one file, one day, many days", () => {
  const day = 86_400_000, now = Date.parse("2026-10-31T12:00:00Z");
  const row = (ago, files) => pullRow(pull(1, { created_at: new Date(now - ago * day).toISOString() }), { changed_files: files, additions: 1, deletions: 0 }, t, now).meta;
  assert.equal(row(1, 1), "someone · 1 file · +1 −0 · 1 day");
  assert.equal(row(9, 2), "someone · 2 files · +1 −0 · 9 days");
});

test("someone can show only a repo's pull requests", async () => {
  const { github, calls } = fakeGithub({ issues: [issue(1)], pulls: [pull(2)] });
  assert.deepEqual((await github.lists(REPO, ["pulls"])).map((l) => l.ad), ["pulls"]);
  assert.ok(calls.every((c) => c.pathname.includes("/pulls")));
});

test("a title's own #word stays in the title, and an applet label is a plain tag", () => {
  const { text } = renderRows([issueRow(issue(7, { title: "Fix the #bugün bug #2", labels: [{ name: "⌨️ typo-check" }] }))], {}, "Issues");
  assert.match(text, /- \[ \] Fix the #bugün bug #2 \[#7\]\(.+\) #typo-check\n/);
});

test("Today and This week stay on this computer, on either list", async () => {
  const { github, calls } = fakeGithub({ issues: [issue(1, { labels: [{ name: "bug" }] })], pulls: [pull(2)] });
  for (const [list, words, number] of [["issues", "Issue 1", 1], ["pulls", "Pull 2", 2]]) {
    const now = byName(await github.lists(REPO), list), line = lineOf(now, words);
    assert.equal(await github.write(REPO, list, { action: "tags", line, text: now.split("\n")[line], tags: ["bug", "bugün", "<x>"] }), true);
    assert.match(byName(await github.lists(REPO), list).split("\n")[line], new RegExp(`\\[#${number}\\]\\(.+ #bugün`));
  }
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("everything else is refused: these lists are read-only", async () => {
  const { github, calls } = fakeGithub({ issues: [issue(1)] });
  const now = byName(await github.lists(REPO), "issues"), line = lineOf(now, "Issue 1"), text = now.split("\n")[line];
  for (const action of ["toggle", "edit", "add", "delete", "move", "nest", "date"]) {
    await assert.rejects(github.write(REPO, "issues", { action, line, text, newText: "x", done: true }), /read-only/);
  }
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("known lists never go to the network: a list not read yet waits, a read one stays", async () => {
  const { github, calls } = fakeGithub({ issues: [issue(1)] });
  const before = github.known(REPO);
  assert.deepEqual(before.map((l) => [l.ad, l.bekliyor]), [["issues", true], ["pulls", true]]);
  assert.equal(calls.length, 0);
  await github.lists(REPO, ["issues"]);
  const after = github.known(REPO);
  assert.equal(after[0].bekliyor, undefined);
  assert.match(after[0].icerik, /Issue 1/);
  assert.equal(after[1].bekliyor, true);
  const seen = calls.length;
  github.known(REPO);
  assert.equal(calls.length, seen);
});

test("a tag isn't saved when the line isn't what the page saw", async () => {
  const { github } = fakeGithub({ issues: [issue(1)] });
  await github.lists(REPO);
  assert.equal(await github.write(REPO, "issues", { action: "tags", line: 2, text: "- [ ] Something else", tags: ["bugün"] }), false);
  assert.equal(await github.write(REPO, "issues", { action: "tags", line: 0, text: "# Issues", tags: ["bugün"] }), false);
});

test("the token only goes to the GitHub API, and is left out when there is none", async () => {
  const signedIn = fakeGithub({ issues: [issue(1)] });
  await signedIn.github.lists(REPO);
  assert.ok(signedIn.calls.every((c) => c.url.startsWith("https://api.github.com/") && c.headers.Authorization === "Bearer secret-token"));
  const anonymous = fakeGithub({ issues: [issue(1)], token: null });
  await anonymous.github.lists(REPO);
  assert.ok(anonymous.calls.every((c) => !("Authorization" in c.headers)));
});

test("a bad repo name never reaches the network, and a failure shows as a heading", async () => {
  const { github, calls } = fakeGithub();
  for (const repo of ["../../user", "acme", "acme/tool/issues", "a/b?x=1"]) {
    assert.match(byName(await github.lists(repo), "issues"), /Not a repo name/);
    await assert.rejects(github.write(repo, "issues", { action: "tags", line: 2, text: "x", tags: [] }));
  }
  assert.equal(calls.length, 0);
  const dataDir = mkdtempSync(join(tmpdir(), "speys-github-"));
  folders.push(dataDir);
  const failing = createGithub({ dataDir, t, tokenFn: async () => null, fetchFn: async () => new Response('{"message":"Not Found"}', { status: 404 }) });
  assert.match(byName(await failing.lists(REPO), "pulls"), /^# Pull requests\n\n## GitHub answered 404: Not Found\n$/);
});
