// CRM: a local book; without a file it starts with an empty book of one pipeline. Every change also goes to `gunluk`: that is how a sync will know what changed.
// Setting: Settings → CRM.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const FIELDS = ["title", "contact_name", "contact_role", "contact_phone", "next_action", "next_action_at", "products", "notes", "gundem", "lost_reason"];
const MEETINGS = ["visit", "call", "meeting", "email", "note"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const expand = (p) => (p?.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((done, fail) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => done(body));
    req.on("error", fail);
  });
}

/** Written to disk once, so its names stay in the language it was created in. */
function emptyBook(t) {
  const business_id = randomUUID(), pipeline_id = randomUUID();
  const stages = [
    ["new", t("New"), "open", "#64748B"],
    ["contacted", t("Contacted"), "open", "#0EA5E9"],
    ["proposal", t("Proposal Sent"), "open", "#8B5CF6"],
    ["won", t("Won"), "won", "#10B981"],
    ["lost", t("Lost"), "lost", "#EF4444"],
  ];
  return {
    isletmeler: [{ id: business_id, name: t("My Business") }],
    ayarlar: [],
    hatlar: [{ id: pipeline_id, business_id, name: t("Sales"), position: 0 }],
    asamalar: stages.map(([key, label, kind, color], position) => ({ pipeline_id, key, label, kind, color, position })),
    kayitlar: [],
    gorusmeler: [],
    gunluk: [],
  };
}

export default function create({ dataDir, settings, t }) {
  const file = () => expand(settings().file) || join(dataDir, "veri.json");
  const version = () => String(statSync(file(), { bigint: true }).mtimeNs);

  function overview() {
    if (!existsSync(file())) {
      mkdirSync(dirname(file()), { recursive: true });
      writeFileSync(file(), JSON.stringify(emptyBook(t), null, 1) + "\n");
    }
    const d = JSON.parse(readFileSync(file(), "utf8"));
    const last = new Map();
    for (const meeting of d.gorusmeler || []) {
      if (!last.has(meeting.deal_id) || meeting.occurred_on > last.get(meeting.deal_id)) last.set(meeting.deal_id, meeting.occurred_on);
    }
    for (const deal of d.kayitlar || []) deal.son_gorusme = last.get(deal.id) ?? null;
    d.surum = version();
    d.varsayilan_isletme = settings().defaultBusiness ?? null;
    delete d.gunluk;
    return d;
  }

  /** One operation. False (409) if the file changed in the meantime. */
  function apply(input) {
    let q = input;
    if (q.surum && String(q.surum) !== version()) return false;
    const d = JSON.parse(readFileSync(file(), "utf8"));
    const now = new Date().toISOString().replace("Z", "+00:00");
    const find = (id) => {
      const deal = d.kayitlar.find((x) => x.id === id);
      if (!deal) throw new Error(t("record not found"));
      return deal;
    };
    const stagesOf = (pipeline) => d.asamalar.filter((s) => s.pipeline_id === pipeline);
    const { op } = q;
    let deal;
    if (op === "asama") {
      deal = find(q.id);
      if (!stagesOf(deal.pipeline_id).some((s) => s.key === q.stage)) throw new Error(t("stage not found"));
      deal.stage = q.stage;
      deal.won_at = q.stage === "won" ? now : null;
    } else if (op === "guncelle") {
      deal = find(q.id);
      for (let [field, value] of Object.entries(q.alanlar)) {
        if (!FIELDS.includes(field)) throw new Error(t("field: {field}", { field }));
        if (field === "next_action_at" && value && !DATE_RE.test(value)) throw new Error(t("date"));
        if (field === "products") value = (value || []).map(String);
        else if (field === "gundem") value = Boolean(value);
        else if (typeof value === "string") value = value.trim() || null;
        deal[field] = value;
      }
      if (!deal.title && !deal.place_name) throw new Error(t("name is empty"));
    } else if (op === "ekle") {
      const pipeline = d.hatlar.find((p) => p.id === q.pipeline_id);
      if (!pipeline) throw new Error(t("pipeline not found"));
      const title = (q.title || "").trim();
      if (!title) throw new Error(t("name is empty"));
      const open = stagesOf(pipeline.id).filter((s) => s.kind === "open");
      deal = {
        id: randomUUID(), business_id: pipeline.business_id, pipeline_id: pipeline.id, title,
        stage: q.stage || open[0].key, products: [], created_at: now, yerel: true,
      };
      d.kayitlar.unshift(deal);
      q = { ...q, id: deal.id };
    } else if (op === "sil") {
      deal = find(q.id);
      d.kayitlar = d.kayitlar.filter((x) => x !== deal);
      d.gorusmeler = d.gorusmeler.filter((m) => m.deal_id !== deal.id);
    } else if (op === "gorusme") {
      deal = find(q.deal_id);
      if (!MEETINGS.includes(q.kind)) throw new Error(t("meeting kind"));
      const day = q.occurred_on || today();
      if (!DATE_RE.test(day)) throw new Error(t("date"));
      const meeting = {
        id: randomUUID(), deal_id: deal.id, kind: q.kind, occurred_on: day, outcome: null,
        note: (q.note || "").trim() || null, created_at: now, yerel: true,
      };
      d.gorusmeler.unshift(meeting);
      q = { ...q, id: meeting.id };
    } else if (op === "gorusme_sil") {
      d.gorusmeler = d.gorusmeler.filter((m) => m.id !== q.id);
    } else {
      throw new Error(t("unknown operation"));
    }
    if (op === "asama" || op === "guncelle") deal.updated_at = now;
    const { surum: _version, ...logged } = q;
    (d.gunluk ??= []).push({ zaman: now, ...logged });
    const temp = file() + ".yeni";
    writeFileSync(temp, JSON.stringify(d, null, 1) + "\n");
    renameSync(temp, file());
    return true;
  }

  return async (req, res) => {
    const path = req.url.split("?")[0];
    if (req.method === "GET" && path === "/") {
      return send(res, 200, readFileSync(join(import.meta.dirname, "index.html")), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && path === "/api/crm") return send(res, 200, overview());
    if (req.method === "POST" && path === "/api/crm") {
      if (req.headers["x-panel"] !== "1") return send(res, 403, { error: t("not allowed") });
      try {
        const ok = apply(JSON.parse((await readBody(req)) || "{}"));
        return send(res, ok ? 200 : 409, { ok });
      } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
      }
    }
    send(res, 404, { error: t("not found") });
  };
}
