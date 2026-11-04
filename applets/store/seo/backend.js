// SEO: the same data for every site: daily task, opportunities, checks + computed status (live sitemap, blog post
// checks, latest report, task list, Search Console) and how a page looks in search. Setting: Settings → SEO → Sites.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { daysAgo, expand, handleWrite, isoDay, isoMinute, page, readJson, send, version, writeJson } from "../../../lib/common.js";
import * as searchConsole from "../../../lib/search-console.js";

const STATES = ["fikir", "sirada", "yapiliyor", "bitti"];
const PREVIEW_S = 6 * 3600;
const WORD = "[\\p{L}\\p{N}_]";

/** Turkish lower-casing: ı/I/İ → i. */
const fold = (s) => [...s].map((c) => ("Iİı".includes(c) ? "i" : c.toLowerCase())).join("");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function keywordPattern(keyword) {
  const words = fold(keyword).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const parts = words.map((k) => {
    const root = [...k].length > 4 && "iuü".includes(k.at(-1)) ? k.slice(0, -1) : k; // Turkish compound suffix: programı → program
    return `${escapeRe(root)}${WORD}*`;
  });
  return `(?<!${WORD})${parts.join("\\s+")}`;
}

const hasMatch = (pattern, text) => !!pattern && new RegExp(pattern, "iu").test(text);
const countMatches = (pattern, text) => (pattern ? [...text.matchAll(new RegExp(pattern, "giu"))].length : 0);

function checkPost(folder, name, domain, t) {
  const post = join(folder, "post.md");
  if (!existsSync(post)) return null;
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(readFileSync(post, "utf8"));
  if (!m) return null;
  const front = {};
  for (const line of m[1].split("\n")) {
    const at = line.indexOf(":");
    if (at !== -1) front[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^"+|"+$/g, "");
  }
  if (front.status === "archived") return null; // not published: keep it out of the daily fix suggestions
  const body = m[2];
  const keyword = front.focusKeyword || "";
  const pattern = keywordPattern(keyword);
  const paragraphs = body.split("\n\n").filter((p) => p.trim() && !/^[#!<]/.test(p.trimStart()));
  const intro = fold(paragraphs.slice(0, 2).join(" "));
  const headings = fold(body.split("\n").filter((s) => /^#{2,3} /.test(s)).join("\n"));
  const count = countMatches(pattern, fold(body));
  const description = front.seoDescription || "";
  const length = [...description].length;
  const links = [...body.matchAll(new RegExp(`\\]\\((/[^)]*|https://${escapeRe(domain)}[^)]*)\\)`, "g"))].length;
  const checks = [
    ["anahtar", t("Keyword chosen"), !!keyword],
    ["giris", t("Appears in the intro"), hasMatch(pattern, intro)],
    ["baslik", t("In a subheading"), hasMatch(pattern, headings)],
    ["sayi", t("At least 3 times in the text ({count})", { count }), count >= 3],
    ["aciklama", t("Appears in the description"), hasMatch(pattern, fold(description))],
    ["uzunluk", t("Description 120–160 characters ({length})", { length }), length >= 120 && length <= 160],
    ["baglanti", t("Internal link ({links})", { links }), links >= 1],
    ["arastirma", "anahtar-kelimeler.md", existsSync(join(folder, "anahtar-kelimeler.md"))],
  ];
  return {
    slug: name, baslik: front.title || name, anahtar: keyword, tarih: front.date || "",
    kontrol: checks.map(([id, ad, tamam]) => ({ id, ad, tamam })),
    puan: checks.filter((c) => c[2]).length, toplam: checks.length,
  };
}

function run(cmd, args, timeout) {
  return new Promise((done) => {
    execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" }, (error, stdout) => done({ error, stdout: stdout || "" }));
  });
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const unescapeHtml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? all;
    const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return String.fromCodePoint(code);
  });

/** @type counts + the few fields the preview needs (rating, price range, site name). */
function walkJsonLd(node, types, extra) {
  if (Array.isArray(node)) return node.forEach((x) => walkJsonLd(x, types, extra));
  if (!node || typeof node !== "object") return;
  const type = node["@type"];
  for (const name of Array.isArray(type) ? type : type ? [type] : []) {
    types[name] = (types[name] || 0) + 1;
    if (name === "WebSite" && node.name) extra.site_adi ??= node.name;
  }
  if (node.aggregateRating && typeof node.aggregateRating === "object" && !Array.isArray(node.aggregateRating)) extra.puan ??= node.aggregateRating;
  if (node.priceRange) extra.fiyat ??= node.priceRange;
  for (const v of Object.values(node)) if (v && typeof v === "object") walkJsonLd(v, types, extra);
}

async function readPage(url) {
  const dir = mkdtempSync(join(tmpdir(), "seo-"));
  try {
    const head = join(dir, "head"), bodyFile = join(dir, "body");
    const { stdout } = await run("curl", ["-sL", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "5", "-m", "20", "-A", "Mozilla/5.0 (speys-local)", "-D", head, "-o", bodyFile, "-w", "%{http_code} %{url_effective}", url], 25_000);
    const space = stdout.indexOf(" ");
    const code = /^\d+$/.test(stdout.slice(0, space)) ? Number(stdout.slice(0, space)) : 0;
    const finalUrl = space === -1 ? url : stdout.slice(space + 1);
    const text = existsSync(bodyFile) ? readFileSync(bodyFile, "utf8") : "";
    const headers = existsSync(head) ? readFileSync(head, "latin1") : "";
    // Next.js streams metadata in the body for browsers (in the head for bots); the first match is right in both
    const meta = (name) => {
      const m = new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]+content="([^"]*)"`).exec(text);
      return m ? unescapeHtml(m[1]) : null;
    };
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(text);
    const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/.exec(text);
    // client pages such as /menu give the canonical in an HTTP Link header; use the last response's headers
    const blocks = headers.split("\r\n\r\n");
    const lastHeaders = blocks.length > 1 ? blocks.at(-2) : headers;
    const link = /^link:.*<([^>]+)>;\s*rel="?canonical"?/im.exec(lastHeaders);
    const types = {}, extra = {};
    let broken = 0;
    for (const m of text.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      try {
        walkJsonLd(JSON.parse(m[1]), types, extra);
      } catch {
        broken++;
      }
    }
    return {
      kod: code, son_url: finalUrl,
      baslik: title ? unescapeHtml(title[1].trim()) : null,
      aciklama: meta("description"),
      site_adi: extra.site_adi || meta("og:site_name"),
      canonical: canonical ? canonical[1] : link ? link[1] : null,
      canonical_kaynak: canonical ? "html" : link ? "http" : null,
      robots: meta("robots"),
      turler: types, jsonld_bozuk: broken,
      puan: extra.puan ?? null, fiyat: extra.fiyat ?? null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function googleView(url, property, languageCode) {
  const r = await searchConsole.api("/v1/urlInspection/index:inspect", { inspectionUrl: url, siteUrl: property, languageCode });
  const i = r.inspectionResult || {};
  const index = i.indexStatusResult || {}, rich = i.richResultsResult || {};
  return {
    durum: index.coverageState ?? null, karar: index.verdict ?? null, son_tarama: index.lastCrawlTime ?? null,
    google_canonical: index.googleCanonical ?? null,
    zengin_karar: rich.verdict ?? null,
    zengin: (rich.detectedItems || []).flatMap((d) => (d.items || []).map((it) => ({
      tur: unescapeHtml(d.richResultType || ""), ad: it.name ?? null,
      sorunlar: (it.issues || []).map((s) => ({ seviye: s.severity ?? null, mesaj: s.issueMessage ?? null })),
    }))),
  };
}

/** validator.schema.org: the errors on every node and property. */
async function schemaOrg(url) {
  const { stdout } = await run("curl", ["-s", "-m", "60", "-X", "POST", "https://validator.schema.org/validate", "--data-urlencode", `url=${url}`], 65_000);
  const d = JSON.parse(stdout.slice(stdout.indexOf("{")));
  const errors = [];
  const trim = (s) => s.replace(/^\/+|\/+$/g, "");
  const walk = (n, path) => {
    if (Array.isArray(n)) return n.forEach((x) => walk(x, path));
    if (!n || typeof n !== "object") return;
    const name = n.pred || n.typeGroup || "";
    for (const e of n.errors || []) errors.push({ yer: trim(`${path}/${name}`), tur: e.errorType ?? null, ayrinti: e.args ?? null, seviye: e.severity ?? null });
    for (const key of ["nodes", "types", "properties", "nodeProperties", "target"]) {
      if (key in n) walk(n[key], key === "target" ? trim(`${path}/${name}`) : n.typeGroup || path);
    }
  };
  walk(d.tripleGroups || [], "");
  return { turler: (d.tripleGroups || []).map((g) => g.type ?? null), hatalar: errors };
}

// A site without a file starts with the same tasks; `gunluk` and `kontroller` in a site's file replace them.
// The text here is the translation key: emptySite translates it per request.
const DAILY = [{ id: "durum", ad: "SEO status check and today's analysis", nasil: "Check Search Console (last 7 days / previous 7 days; pages and queries rising, falling, or at positions 8–20 without clicks), review the open tasks; pick what can be done today and do it." }];
const WEEKLY = [
  "sitemap.xml ↔ actual pages (missing, extra, 404, redirects)",
  "Titles and descriptions (missing, duplicate, length)",
  "Structured data (schema.org validator)",
  "Search Console: pages not indexed and errors",
].map((ad, i) => ({ no: i + 1, ad, son: null }));

export default function create({ dataDir, settings, t, language }) {
  const emptySite = () => ({
    gunluk: DAILY.map((d) => ({ ...d, ad: t(d.ad), nasil: t(d.nasil) })),
    kayit: {}, firsatlar: [], kontroller: WEEKLY.map((k) => ({ ...k, ad: t(k.ad) })), analiz: {},
  });
  const sites = () => (settings().sites || []).map((x) => ({
    ...x, list: expand(x.list), blog: expand(x.blogFolder), reports: expand(x.reportsFolder),
    file: expand(x.file) || join(dataDir, `${x.id}.json`),
  }));
  const siteOf = (id) => {
    const all = sites();
    return all.find((x) => x.id === id) || all[0];
  };
  const load = (site) => ({ ...emptySite(), ...(existsSync(site.file) ? readJson(site.file) : {}) });
  const sitemaps = new Map();
  const previews = new Map();

  /** The site's sitemap: page count per section. Without a network, the last known one. */
  async function sitemap(force, domain) {
    if (!domain) return { toplam: null, bolumler: [] };
    const cached = sitemaps.get(domain);
    if (!force && cached && Date.now() / 1000 - cached.zaman < 6 * 3600) return cached;
    try {
      const r = await fetch(`https://${domain}/sitemap.xml`, { headers: { "User-Agent": "speys-local" }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const urls = [...(await r.text()).matchAll(/<loc>\s*https?:\/\/[^/<]+(\/[^<]*)?\s*<\/loc>/g)].map((m) => m[1] || "");
      const sections = new Map();
      for (const a of urls) {
        const first = "/" + (a || "/").replace(/^\/+|\/+$/g, "").split("/")[0];
        sections.set(first, (sections.get(first) || 0) + 1);
      }
      const data = { toplam: urls.length, bolumler: [...sections].sort((x, y) => y[1] - x[1]), zaman: Date.now() / 1000 };
      sitemaps.set(domain, data);
      return data;
    } catch (e) {
      return cached || { toplam: null, bolumler: [], error: String(e.message || e) };
    }
  }

  async function overview(force, id) {
    const site = siteOf(id);
    if (!site) return { not_configured: true };
    const { blog, reports } = site;
    const posts = blog && existsSync(blog)
      ? readdirSync(blog).sort().filter((n) => statSync(join(blog, n)).isDirectory()).map((n) => checkPost(join(blog, n), n, site.domain, t)).filter(Boolean)
      : [];
    posts.sort((a, b) => a.puan / a.toplam - b.puan / b.toplam || (a.slug < b.slug ? -1 : 1));
    const names = reports && existsSync(reports) ? readdirSync(reports).filter((f) => /^kontrol-.*\.md$/.test(f)).sort().reverse() : [];
    const lastReport = names.length
      ? { dosya: names[0], baslik: readFileSync(join(reports, names[0]), "utf8").split(/\r\n|\r|\n/)[0].replace(/^[# ]+/, "") }
      : null;
    return {
      ...load(site), site: site.id, sitemap: await sitemap(force, site.domain), yazilar: posts, son_rapor: lastReport, bugun: isoDay(),
      surum: existsSync(site.file) ? version(site.file) : null, search_console: await searchConsole.data(force),
      siteler: sites().map((x) => ({ id: x.id, ad: x.name, alan: x.domain, proje: x.project ?? null })),
      liste_ad: site.list ? site.list.split(sep).slice(-2).join("/") : null,
      liste: site.list && existsSync(site.list) ? readFileSync(site.list, "utf8") : "",
    };
  }

  function apply(q) {
    const site = siteOf(q.site);
    if (!site) throw new Error(t("No such site"));
    if (q.surum && existsSync(site.file) && String(q.surum) !== version(site.file)) return false;
    const d = load(site);
    const today = isoDay();
    if (q.op === "gunluk") {
      if (!d.gunluk.some((g) => g.id === q.id)) throw new Error(t("No such task"));
      const day = new Set(d.kayit[today] || []);
      q.deger ? day.add(q.id) : day.delete(q.id);
      if (day.size) d.kayit[today] = [...day].sort();
      else delete d.kayit[today];
    } else if (q.op === "firsat") {
      if (!STATES.includes(q.durum)) throw new Error(t("Invalid status"));
      const f = d.firsatlar.find((x) => x.id === q.id);
      if (!f) throw new Error(t("No such opportunity"));
      f.durum = q.durum;
    } else if (q.op === "firsat_ekle") {
      const title = String(q.baslik || "").trim();
      if (!title) throw new Error(t("Title required"));
      const id = fold(title).replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "") || `f${Math.trunc(Date.now() / 1000)}`;
      d.firsatlar.unshift({ id, baslik: title, neden: String(q.neden || "").trim(), durum: "fikir" });
    } else if (q.op === "kontrol") {
      const k = d.kontroller.find((x) => x.no === Number(q.no));
      if (!k) throw new Error(t("No such check"));
      k.son = q.geri ? null : today;
    } else {
      throw new Error(t("Unknown operation"));
    }
    mkdirSync(dirname(site.file), { recursive: true });
    writeJson(site.file, d);
    return true;
  }

  async function preview(url, force, askSchema) {
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
    const known = sites().find((x) => host === x.domain || host.endsWith(`.${x.domain}`));
    const property = known ? known.property || `sc-domain:${known.domain}` : null;
    if (!url.startsWith("https://") || !property) return null;
    // Google answers in the requested language, so a cached answer belongs to that language
    const languageCode = language();
    const key = `${languageCode} ${url}`;
    const cached = previews.get(key);
    const safe = (p) => p.catch((e) => ({ error: String(e.message || e).slice(0, 200) })); // if one fails, the others still come through
    // validator.schema.org is a third party: the address only goes there when the user presses the button
    if (cached && !force && Date.now() / 1000 - cached.at < PREVIEW_S) {
      if (askSchema && !cached.data.schema) cached.data.schema = await safe(schemaOrg(url));
      return cached.data;
    }
    const [sayfa, google, schema] = await Promise.all([safe(readPage(url)), safe(googleView(url, property, languageCode)), askSchema ? safe(schemaOrg(url)) : null]);
    const data = { url, sayfa, google, schema, alindi: isoMinute() };
    previews.set(key, { at: Date.now() / 1000, data });
    return data;
  }

  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET") {
      if (url.pathname === "/") return page(res, import.meta.dirname);
      if (url.pathname === "/api/seo") return send(res, 200, await overview(url.searchParams.get("yenile") === "1", url.searchParams.get("site")));
      if (url.pathname === "/api/seo/onizleme") {
        const data = await preview(url.searchParams.get("url") || "", url.searchParams.get("yenile") === "1", url.searchParams.get("schema") === "1");
        return data ? send(res, 200, data) : send(res, 400, { error: t("Invalid address") });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/seo") return handleWrite(req, res, apply);
    send(res, 404, { error: t("Not found") });
  };
}
