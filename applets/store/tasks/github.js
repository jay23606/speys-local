// A repo's GitHub issues and pull requests as lists: a project with "github": "owner/repo". They are there to keep an
// eye on, so nothing here writes to GitHub; "Today" and "This week" are personal and stay on this computer. Shown as
// task-list text, so every page reads them the way it reads a file. Goes on the network only when one of these lists is opened.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isoDay, readJson, writeJson } from "../../../lib/common.js";

export const GITHUB_LISTS = ["issues", "pulls"];
const API = "https://api.github.com";
const REPO_RE = /^[\w-][\w.-]*\/[\w-][\w.-]*$/;
const PERSONAL_TAGS = ["bugün", "bu-hafta"];
const FIRST_TIMERS = ["FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "NONE"];
const MAX_AGE_MS = 60_000;
const TIMEOUT_MS = 5_000;
const TOKEN_AGE_MS = 5 * 60_000;
const NOTE_LENGTH = 240;
const MAX_PULL_DETAILS = 30;
const GH = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"].find(existsSync) || "gh";

const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const labelTag = (name) => String(name).toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
const labelTags = (item) => (item.labels || []).map((l) => labelTag(l.name ?? l)).filter(Boolean);

/** The first line of text, past any headings, without markdown that would make it a task or a divider. */
function noteOf(body) {
  const first = String(body ?? "").split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/^[\s>*+-]+/, "").trim()).find(Boolean);
  return first ? `  ${first.slice(0, NOTE_LENGTH)}` : null;
}

/**
 * Rows as task-file text; `numbers[line]` is the issue or pull request on that line. The link after the title keeps a
 * title's own #word from reading as a tag.
 */
export function renderRows(rows, personal, title) {
  const lines = [`# ${title}`, ""], numbers = {}, people = {};
  for (const row of rows) {
    const tags = [...(personal[row.number] || []), ...row.tags];
    numbers[lines.length] = row.number;
    if (row.person) people[lines.length] = row.person;
    lines.push(`- [${row.closed ? "x" : " "}] ${oneLine(row.title)} [#${row.number}](${row.url})${row.meta ? ` · ${row.meta}` : ""}${tags.map((tag) => ` #${tag}`).join("")}`);
    const note = noteOf(row.body);
    if (note) lines.push(note);
  }
  return { text: lines.join("\n") + "\n", numbers, people };
}

/** Who opened it, with a picture only from GitHub's own address: the page loads it as an image. */
const personOf = (user) => user?.login && {
  login: user.login,
  avatar: /^https:\/\/avatars\.githubusercontent\.com\//.test(user.avatar_url ?? "") ? user.avatar_url : null,
};

export const issueRow = (issue) => ({
  number: issue.number, title: issue.title, url: issue.html_url, body: issue.body, closed: issue.state === "closed",
  tags: [...labelTags(issue), ...(issue.state === "closed" && issue.closed_at ? [`bitti-${isoDay(new Date(issue.closed_at))}`] : [])],
});

/** What deciding on a pull request takes: who opened it, how big it is, how long it has waited. `detail` holds the size. */
export function pullRow(pull, detail, t, now = Date.now()) {
  const days = Math.floor((now - new Date(pull.created_at)) / 86_400_000);
  const size = detail && [
    detail.changed_files === 1 ? t("1 file") : t("{n} files", { n: detail.changed_files }),
    `+${detail.additions} −${detail.deletions}`,
  ];
  const age = days < 1 ? t("today") : days === 1 ? t("1 day") : t("{n} days", { n: days });
  return {
    number: pull.number, title: pull.title, url: pull.html_url, body: pull.body, closed: false,
    person: personOf(pull.user),
    meta: [pull.user?.login, ...(size || []), age].filter(Boolean).join(" · "),
    tags: [...labelTags(pull), ...(pull.draft ? ["draft"] : []), ...(FIRST_TIMERS.includes(pull.author_association) ? ["first-time"] : [])],
  };
}

/** The signed-in gh account's token, if there is one; it stays in memory and only goes to the GitHub API. */
function ghToken() {
  return new Promise((done) => {
    execFile(GH, ["auth", "token"], { timeout: TIMEOUT_MS }, (error, stdout) => done(error ? null : stdout.trim() || null));
  });
}

export function createGithub({ dataDir, t, fetchFn = fetch, tokenFn = ghToken }) {
  const entries = new Map(); // "repo list" → { rows, error, at, pending, etags, pages }
  const personalFile = join(dataDir, "github-tags.json");
  const allPersonal = () => (existsSync(personalFile) ? readJson(personalFile) : {});
  let token = null, tokenAt = 0;

  async function request(path, etag) {
    if (Date.now() - tokenAt > TOKEN_AGE_MS) {
      token = await tokenFn();
      tokenAt = Date.now();
    }
    const r = await fetchFn(API + path, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "speys-local",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(etag ? { "If-None-Match": etag } : {}),
      },
    });
    if (r.status === 304) return { unchanged: true };
    if (r.status === 401) throw new Error(t("Sign in to GitHub first: run gh auth login."));
    if (!r.ok) throw new Error(t("GitHub answered {status}: {message}", { status: r.status, message: (await r.json().catch(() => ({}))).message || "" }));
    return { data: await r.json(), etag: r.headers.get("etag") };
  }

  /** An unchanged answer costs nothing against the rate limit. */
  async function page(entry, path) {
    const r = await request(path, entry.etags[path]);
    if (!r.unchanged) {
      entry.etags[path] = r.etag;
      entry.pages[path] = r.data;
    }
    return entry.pages[path];
  }

  async function readIssues(entry, repo) {
    const open = await page(entry, `/repos/${repo}/issues?state=open&sort=created&direction=asc&per_page=100`);
    const closed = await page(entry, `/repos/${repo}/issues?state=closed&sort=updated&direction=desc&per_page=30`);
    return [...open, ...closed].filter((issue) => !issue.pull_request).map(issueRow); // the API lists pull requests as issues too
  }

  async function readPulls(entry, repo) {
    const pulls = await page(entry, `/repos/${repo}/pulls?state=open&sort=created&direction=asc&per_page=100`);
    const details = await Promise.all(pulls.map((pull, i) => (i < MAX_PULL_DETAILS ? page(entry, `/repos/${repo}/pulls/${pull.number}`) : null)));
    return pulls.map((pull, i) => pullRow(pull, details[i], t));
  }

  async function refresh(entry, repo, list) {
    try {
      entry.rows = await (list === "pulls" ? readPulls : readIssues)(entry, repo);
      entry.error = null;
    } catch (e) {
      entry.error = String(e.message || e); // what was last read stays on screen
    }
    entry.at = Date.now();
  }

  /** The first read waits; after that the last result answers at once and a stale one renews in the background. */
  async function read(repo, list) {
    const key = `${repo} ${list}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = { rows: null, error: null, at: 0, pending: null, etags: {}, pages: {} };
      entries.set(key, entry);
    }
    if (Date.now() - entry.at > MAX_AGE_MS) {
      entry.pending ??= refresh(entry, repo, list).finally(() => (entry.pending = null));
    }
    if (entry.pending && !entry.rows && !entry.error) await entry.pending;
    return entry;
  }

  const titleOf = (list) => (list === "pulls" ? t("Pull requests") : t("Issues"));
  const rendered = (repo, list, entry) => renderRows(entry.rows, allPersonal()[repo] || {}, titleOf(list));

  /** `shown` narrows the lists, for someone who only wants a repo's pull requests. */
  const wantedLists = (shown) => GITHUB_LISTS.filter((list) => !Array.isArray(shown) || shown.includes(list));

  function listOf(repo, list, entry) {
    const of = (icerik, kisiler = {}) => ({ ad: list, claude: false, bitenler: false, github: true, icerik, kisiler });
    if (!REPO_RE.test(repo)) return of(`# ${titleOf(list)}\n\n## ${t("Not a repo name: {repo}", { repo })}\n`);
    if (!entry?.rows && !entry?.error) return { ...of(`# ${titleOf(list)}\n`), bekliyor: true };
    if (!entry.rows) return of(`# ${titleOf(list)}\n\n## ${entry.error}\n`);
    const { text, people } = rendered(repo, list, entry);
    return of(text, people);
  }

  /** What is already here, without going to GitHub: a list not read yet says so with `bekliyor`. */
  const known = (repo, shown) => wantedLists(shown).map((list) => listOf(repo, list, entries.get(`${repo} ${list}`)));

  /** Reads the lists: the page asks for the one that's open. */
  const lists = (repo, shown) => Promise.all(wantedLists(shown).map(async (list) =>
    listOf(repo, list, REPO_RE.test(repo) ? await read(repo, list) : null)));

  /** The one change these lists take: the personal tags. False (409) if the line is no longer what the page saw. */
  async function write(repo, list, op) {
    if (op?.action !== "tags" || !REPO_RE.test(repo)) throw new Error(t("This list is read-only: open it on GitHub."));
    const entry = await read(repo, list);
    if (!entry.rows) throw new Error(entry.error);
    const { text, numbers } = rendered(repo, list, entry);
    const number = numbers[op.line];
    if (!number || text.split("\n")[op.line] !== op.text) return false;
    const all = allPersonal();
    all[repo] = { ...all[repo], [number]: (Array.isArray(op.tags) ? op.tags : []).filter((tag) => PERSONAL_TAGS.includes(tag)) };
    writeJson(personalFile, all);
    return true;
  }

  return { known, lists, write };
}
