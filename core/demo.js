// The demo workspace: made-up data for trying the dashboard and taking screenshots. It is rebuilt every time it is
// opened, with dates around today. Nothing here reads the real Claude folders or any real data.
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { LEGACY } from "./store.js";

const DAY = 86400;
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const write = (file, text) => writeFileSync(file, text);
const writeJson = (file, value) => write(file, JSON.stringify(value, null, 1) + "\n");
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

const SESSIONS = [
  ["shop-api", "Add Stripe webhooks", "add stripe webhooks for failed payments", "Webhook handler is in place. Writing the retry test now.", 20, "UserPromptSubmit"],
  ["blog", "Run the database migration", "migrate the posts table to add a slug column", "Ready to run the migration on production. Waiting for your approval.", 60, "Notification"],
  ["landing-page", "Fix the mobile header", "the header overlaps the hero on small screens", "Fixed: the header now collapses below 720px. Checked on an iPhone viewport.", 240, "Stop"],
  ["mobile-app", "Offline task sync", "make tasks work offline and sync when back online", "Tasks now queue locally and sync on reconnect. 14 tests pass.", 1500, "Stop"],
];
const SENTENCES = [
  "please check the database migration and fix the error in the deploy script",
  "can you update the readme with the install instructions and the screenshots",
  "the function should return the user profile and handle the missing account case",
  "add a test for the payment webhook and make sure the retry logic works",
  "refactor the component so the header and the footer share the same layout",
  "look at the failing build and tell me which dependency broke the release",
  "write a short summary of what changed in this branch before we merge",
  "make the dashboard faster and remove the query that runs on every request",
];
const TYPOS = { please: "plase", check: "chekc", database: "databse", the: "teh", update: "udpate", function: "funciton", should: "shoudl", return: "retrun", component: "componet", which: "whcih", write: "wirte", summary: "sumary", before: "befroe", remove: "remvoe", request: "reqeust" };
const PRACTICE_MISTAKES = [[["chekc", "check"]], [["teh", "the"], ["databse", "database"]], [["funciton", "function"]], [["udpate", "update"]], [["retrun", "return"], ["teh", "the"]], [["shoudl", "should"]], [["wirte", "write"]], [["plase", "please"]]];

function seedClaude(dir) {
  const now = Date.now() / 1000, claude = join(dir, "demo-claude"), events = [];
  SESSIONS.forEach(([project, title, ask, reply, age, event], i) => {
    const folder = join(dir, "projects", project);
    mkdirSync(folder, { recursive: true });
    const logs = join(claude, "projects", `demo-${project}`);
    mkdirSync(logs, { recursive: true });
    const id = `demo-${i}`, stamp = new Date((now - age) * 1000).toISOString(), file = join(logs, `${id}.jsonl`);
    write(file, jsonl([
      { type: "user", sessionId: id, cwd: folder, timestamp: stamp, message: { role: "user", content: ask } },
      { type: "assistant", sessionId: id, cwd: folder, timestamp: stamp, message: { role: "assistant", content: [{ type: "text", text: reply }] } },
      { type: "ai-title", sessionId: id, aiTitle: title },
      { type: "last-prompt", sessionId: id, lastPrompt: ask },
    ]));
    utimesSync(file, now - age, now - age);
    events.push({ zaman: now - age, olay: event, oturum: id, ...(event === "Notification" ? { onay: true, mesaj: "Claude needs your permission to use Bash" } : {}) });
  });
  mkdirSync(join(dir, "apps", "claude"), { recursive: true });
  write(join(dir, "apps", "claude", "olaylar.jsonl"), jsonl(events));

  // Four weeks of messages with fewer typos over time, for Typo Check. A fixed pattern keeps the numbers stable.
  const logs = join(claude, "projects", "demo-typing");
  mkdirSync(logs, { recursive: true });
  const rows = [];
  let tick = 0;
  for (let day = 28; day >= 1; day--) {
    for (let n = 0; n < 14; n++) {
      const words = SENTENCES[n % SENTENCES.length].split(" ").map((w) => (TYPOS[w] && ++tick % Math.round(30 - day * 0.6) === 0 ? TYPOS[w] : w));
      rows.push({ type: "user", sessionId: `t${day}`, cwd: join(dir, "projects"), timestamp: new Date((now - day * DAY + n * 600) * 1000).toISOString(), message: { role: "user", content: words.join(" ") } });
    }
  }
  const file = join(logs, "typing.jsonl");
  write(file, jsonl(rows));
  utimesSync(file, now - 3 * DAY, now - 3 * DAY);
  mkdirSync(join(dir, "apps", "yazim"), { recursive: true });
  const accuracy = [86, 88, 87, 90, 92, 91, 94, 96];
  write(join(dir, "apps", "yazim", "alistirmalar.jsonl"), jsonl(accuracy.map((a, i) => {
    const d = new Date((now - (accuracy.length - i) * 2 * DAY) * 1000);
    return { zaman: `${iso(d)} 18:${pad(10 + i)}`, kelime: 30, dogru: Math.round((30 * a) / 100), kdk: +(42 + i * 1.7).toFixed(1), ritim: +(38 - i * 2.1).toFixed(1), hatalar: PRACTICE_MISTAKES[i] };
  })));
  return claude;
}

function seedTasks(dir) {
  const shop = join(dir, "projects", "shop-api", "tasks"), site = join(dir, "projects", "landing-page", "tasks");
  mkdirSync(shop, { recursive: true });
  mkdirSync(site, { recursive: true });
  write(join(shop, "backlog.md"), `# Backlog

## This week

- [ ] Add Stripe webhooks #bugün
  Failed payments should retry twice, then email the customer.
  - [x] Webhook handler
  - [ ] Retry test
- [ ] Review the pricing page copy #bugün
- [x] Move images to the CDN #bugün #bitti-${dayOffset(0)}
- [ ] Write the launch post #bu-hafta
- [x] Rotate the API keys #bitti-${dayOffset(-2)}

## Later

- [ ] Dark mode for the invoice page
- [ ] Export orders as CSV
- [ ] Invite teammates by link
`);
  write(join(shop, "bugs.md"), "# Bugs\n\n- [ ] Checkout button stays disabled after a failed card\n- [ ] Search ignores accents\n");
  write(join(site, "launch.md"), "# Launch\n\n- [ ] Fix the mobile header #bugün\n- [ ] Record the demo video\n- [ ] Submit to Product Hunt\n");
  return [
    { id: "shop", name: "Shop API", folder: shop, pattern: "*.md", finishDate: true },
    { id: "site", name: "Landing page", folder: site, pattern: "*.md", finishDate: true },
  ];
}

function seedCrm(dir) {
  const business_id = "demo-business", pipeline_id = "demo-sales", now = new Date().toISOString();
  const stages = [["new", "New", "open", "#64748B"], ["contacted", "Contacted", "open", "#0EA5E9"], ["proposal", "Proposal sent", "open", "#8B5CF6"], ["won", "Won", "won", "#10B981"], ["lost", "Lost", "lost", "#EF4444"]];
  const deals = [
    ["Northwind Traders", "contacted", "Send the revised quote", -2, "Dana Reyes"],
    ["Lumen Dental", "proposal", "Call about the proposal", 0, "Sam Okafor"],
    ["Acme Coffee", "contacted", "Book a demo", 0, "Priya Nair"],
    ["Oak & Iron", "proposal", "Check if the contract is signed", 3, "Lee Park"],
    ["Blue Bottle Studio", "new", "First call", 6, "Mia Chen"],
    ["Harbor Yoga", "new", null, null, null],
    ["Fable Books", "won", null, null, "Noor Haddad"],
  ];
  mkdirSync(join(dir, "apps", "crm"), { recursive: true });
  writeJson(join(dir, "apps", "crm", "veri.json"), {
    isletmeler: [{ id: business_id, name: "My Studio" }], ayarlar: [],
    hatlar: [{ id: pipeline_id, business_id, name: "Sales", position: 0 }],
    asamalar: stages.map(([key, label, kind, color], position) => ({ pipeline_id, key, label, kind, color, position })),
    kayitlar: deals.map(([title, stage, next_action, inDays, contact_name], i) => ({
      id: `demo-deal-${i}`, business_id, pipeline_id, title, stage, next_action, contact_name,
      next_action_at: inDays === null ? null : dayOffset(inDays), products: [], created_at: now, yerel: true,
    })),
    gorusmeler: [], gunluk: [],
  });
}

async function seedLedger(dir, root) {
  const { emptyLedger, saveEntry } = await import(pathToFileURL(join(root, "applets", "store", "kasa", "ledger.js")).href);
  const ledger = emptyLedger(), today = new Date();
  const inMonth = (day) => iso(new Date(today.getFullYear(), today.getMonth(), Math.min(day, today.getDate())));
  for (const [direction, title, amount, category, day] of [
    ["in", "Client invoice: Northwind", 48000, "hizmet", 3], ["in", "Client invoice: Fable Books", 22500, "hizmet", 12], ["in", "Template sales", 6400, "satis", 18],
    ["out", "Coworking desk", 6500, "kira", 1], ["out", "Figma", 1450, "yazilim", 2], ["out", "Hosting", 980, "yazilim", 5], ["out", "Laptop repair", 3200, "ekipman", 9], ["out", "Newsletter ads", 4200, "pazarlama", 15],
  ]) saveEntry(ledger, { direction, title, amount, category, entryDate: inMonth(day), status: "paid" });
  mkdirSync(join(dir, "apps", "kasa"), { recursive: true });
  writeJson(join(dir, "apps", "kasa", "defter.json"), ledger);
}

function seedSocial(dir) {
  const root = join(dir, "social");
  mkdirSync(root, { recursive: true });
  const steps = (render, paylasildi) => ({ veri: true, kesit: render, render, paylasildi });
  writeJson(join(root, "takvim.json"), {
    hesaplar: [
      { id: "studio", ad: "My Studio", kullanici: "@mystudio", avatar: "", renk: "#fb7a01", takipci: 4210, gunler: [1, 3, 5] },
      { id: "founder", ad: "Founder", kullanici: "@founder", avatar: "", renk: "#7c4ddb", takipci: 1280, gunler: [2, 4] },
    ],
    videolar: [
      { id: "demo-1", hesap: "studio", tarih: dayOffset(0), baslik: "Three things we learned shipping in public", dizi: "Build log", kapak: "", adimlar: steps(true, false), aciklama: "What we'd do again, and what we wouldn't." },
      { id: "demo-2", hesap: "founder", tarih: dayOffset(0), baslik: "How I plan my week with Claude", dizi: "Workflow", kapak: "", adimlar: steps(true, true), aciklama: "My Sunday routine, start to finish." },
      { id: "demo-3", hesap: "studio", tarih: dayOffset(2), baslik: "Our landing page, before and after", dizi: "Build log", kapak: "", adimlar: steps(false, false), aciklama: "" },
      { id: "demo-4", hesap: "founder", tarih: dayOffset(-3), baslik: "The tool I built in one afternoon", dizi: "Workflow", kapak: "", adimlar: steps(true, true), aciklama: "", rakamlar: {} },
    ],
    kuyruk: [], arka_plan: [],
  });
  return root;
}

function seedHabits(dir) {
  mkdirSync(join(dir, "apps", "today"), { recursive: true });
  writeJson(join(dir, "apps", "today", "habits.json"), {
    habits: [{ id: "morning-walk", name: "Morning walk" }, { id: "inbox-zero", name: "Clear the inbox" }, { id: "read", name: "Read for 20 minutes" }],
    log: { [dayOffset(0)]: ["morning-walk"] },
  });
}

/** Writes the whole demo into a workspace folder: the applets it has data for are installed, and `disabled` hides this computer's own. */
export async function seedDemo(dir, { disabled = [], language } = {}) {
  const root = resolve(import.meta.dirname, "..");
  mkdirSync(dir, { recursive: true });
  const claude = seedClaude(dir);
  const projects = seedTasks(dir);
  seedCrm(dir);
  await seedLedger(dir, root);
  const social = seedSocial(dir);
  seedHabits(dir);
  writeJson(join(dir, "settings.json"), {
    _dashboard: { installed: LEGACY, disabled, autoUpdateCheck: false, ...(language ? { language } : {}) },
    tasks: { projects },
    claude: { folders: [{ path: claude, label: "Claude" }], projectsRoot: join(dir, "projects") },
    yazim: { claudeFolders: [claude] },
    sosyal: { root: social },
    seo: { sites: [{ id: "studio", name: "My Studio", domain: "example.com", file: join(dir, "apps", "seo", "studio.json") }] },
  });
}
