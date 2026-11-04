#!/usr/bin/env node
// Google Search Console, read-only (webmasters.readonly). Identity: a desktop OAuth client.
//   node lib/search-console.js giris   once: approve in the browser → refresh token
// Data is cached and refreshed every 6 hours. The last days that are not final yet are included (`dataState: all`).
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes, createHash as hash } from "node:crypto";
import { dirname, join } from "node:path";
import { daysAgo, expand, isoDay, isoMinute } from "./common.js";

const HOME = () => process.env.SPEYS_LOCAL_HOME || join(import.meta.dirname, "..", "data");
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API = "https://searchconsole.googleapis.com";
const CACHE_S = 6 * 3600;

function paths() {
  let s = {};
  try {
    s = JSON.parse(readFileSync(join(HOME(), "settings.json"), "utf8")).searchConsole || {};
  } catch {
    // no settings: counts as not connected
  }
  const folder = expand(s.folder) || join(HOME(), "apps", "seo");
  return {
    client: join(folder, "search-console-istemci.json"),
    token: join(folder, "search-console-belirtec.json"),
    cache: expand(s.cacheFile) || join(HOME(), "apps", "seo", "search-console.json"),
  };
}

const access = { token: null, until: 0 };
const client = () => JSON.parse(readFileSync(paths().client, "utf8")).installed;

async function postForm(url, data) {
  const r = await fetch(url, { method: "POST", body: new URLSearchParams(data), signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function accessToken() {
  if (access.token && Date.now() / 1000 < access.until - 60) return access.token;
  const c = client();
  const y = await postForm(c.token_uri, {
    client_id: c.client_id, client_secret: c.client_secret,
    refresh_token: JSON.parse(readFileSync(paths().token, "utf8")).refresh_token, grant_type: "refresh_token",
  });
  access.token = y.access_token;
  access.until = Date.now() / 1000 + (y.expires_in ?? 3600);
  return access.token;
}

export async function api(path, body) {
  const r = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : {};
}

const site = (s) => encodeURIComponent(s);
const round1 = (n) => Math.round(n * 10) / 10;

async function query(s, start, end, dimensions, rowLimit = 25, meta) {
  const y = await api(`/webmasters/v3/sites/${site(s)}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions, rowLimit, dataState: "all" });
  if (meta) Object.assign(meta, y.metadata || {});
  return y.rows || [];
}

const shape = (r) => ({ tiklama: r.clicks ?? 0, gosterim: r.impressions ?? 0, oran: round1((r.ctr ?? 0) * 100), sira: round1(r.position ?? 0) });

/** Total of the last `days` days, daily series, top queries / pages, sitemaps. The window ends on the last day available. */
async function summary(s, days = 28) {
  const meta = {};
  const daily = await query(s, daysAgo(days + 2), isoDay(), ["date"], days + 3, meta);
  const endDate = daily.length ? new Date(`${daily.at(-1).keys[0]}T00:00`) : new Date(Date.now() - 2 * 864e5);
  const end = isoDay(endDate);
  const start = daysAgo(days - 1, endDate);
  const total = (await query(s, start, end, [], 1))[0] || {};
  const top = (rows) => [...rows].sort((a, b) => b.impressions - a.impressions || a.position - b.position).slice(0, 25);
  const [queries, pages, sitemaps] = await Promise.all([
    query(s, start, end, ["query"], 250), query(s, start, end, ["page"], 250), api(`/webmasters/v3/sites/${site(s)}/sitemaps`),
  ]);
  return {
    site: s, bas: start, bit: end, eksik: meta.firstIncompleteDate ?? null, toplam: shape(total),
    gunluk: daily.filter((r) => r.keys[0] >= start).map((r) => ({ gun: r.keys[0], ...shape(r) })),
    sorgular: top(queries).map((r) => ({ sorgu: r.keys[0], ...shape(r) })),
    sayfalar: top(pages).map((r) => ({ sayfa: r.keys[0], ...shape(r) })),
    sitemaps: (sitemaps.sitemap || []).map((m) => ({
      yol: m.path ?? null, son_gonderim: m.lastSubmitted ?? null, son_okuma: m.lastDownloaded ?? null,
      hata: Number(m.errors ?? 0), uyari: Number(m.warnings ?? 0),
      sayfa: (m.contents || []).reduce((t, c) => t + Number(c.submitted ?? 0), 0), bekliyor: !!m.isPending,
    })),
  };
}

const domainOf = (u) => u.replace(/^sc-domain:/, "").replace(/^https:\/\//, "").replace(/^http:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");

/** Summary of every property, by domain. If not connected { bagli: false }; a network error does not take the panel down. */
export async function data(force = false) {
  const p = paths();
  if (!existsSync(p.client) || !existsSync(p.token)) return { bagli: false };
  let cached = {};
  try {
    cached = JSON.parse(readFileSync(p.cache, "utf8"));
  } catch {
    // first run
  }
  if (!force && Date.now() / 1000 - (cached.zaman ?? 0) < CACHE_S) return cached.veri;
  try {
    const sites = ((await api("/webmasters/v3/sites")).siteEntry || []).map((s) => ({ site: s.siteUrl, izin: s.permissionLevel }));
    const summaries = {};
    const ordered = [...sites].sort((a, b) => Number(!a.site.startsWith("sc-domain:")) - Number(!b.site.startsWith("sc-domain:")));
    for (const s of ordered) { // domain property first
      const name = domainOf(s.site);
      if (!summaries[name]) summaries[name] = await summary(s.site);
    }
    const v = { bagli: true, siteler: sites, ozetler: summaries, alindi: isoMinute() };
    mkdirSync(dirname(p.cache), { recursive: true });
    const temp = `${p.cache}.yeni`;
    writeFileSync(temp, JSON.stringify({ zaman: Date.now() / 1000, veri: v }));
    renameSync(temp, p.cache);
    return v;
  } catch (e) {
    return { ...(cached.veri || { bagli: true }), hata: String(e.message || e).slice(0, 200) };
  }
}

/** OAuth with a local redirect (PKCE): the browser opens and after approval the code comes back here. */
const SETUP = (file) => `Search Console needs a Google OAuth client of your own, once:
  1. In Google Cloud Console, create a project and enable the "Google Search Console API".
  2. Under APIs & Services → Credentials, create an OAuth client ID of type "Desktop app" and download its JSON.
  3. Save that file as:
     ${file}
  4. Run this command again and approve in the browser.`;

async function login() {
  const { client: clientFile } = paths();
  mkdirSync(dirname(clientFile), { recursive: true });
  if (!existsSync(clientFile)) {
    console.log(SETUP(clientFile));
    process.exitCode = 1;
    return;
  }
  const c = client();
  const verifier = randomBytes(64).toString("base64url");
  const challenge = hash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const code = await new Promise((done, fail) => {
    const server = createServer((req, res) => {
      const q = new URL(req.url, "http://127.0.0.1").searchParams;
      if (q.get("state") !== state) return res.end();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(q.get("code") ? "Connected, you can close this tab." : `Failed: ${q.get("error")}`);
      server.close();
      q.get("code") ? done({ code: q.get("code"), redirect: `http://127.0.0.1:${port}` }) : fail(new Error(q.get("error")));
    });
    let port;
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      const url = `${c.auth_uri}?${new URLSearchParams({
        client_id: c.client_id, redirect_uri: `http://127.0.0.1:${port}`, response_type: "code", scope: SCOPE,
        access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256",
      })}`;
      execFile(process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open", [url]);
      console.log(`Waiting for approval in the browser. If it did not open:\n${url}`);
    });
  });
  const y = await postForm(c.token_uri, {
    code: code.code, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: code.redirect,
    grant_type: "authorization_code", code_verifier: verifier,
  });
  if (!y.refresh_token) throw new Error("No refresh token received.");
  const file = paths().token;
  writeFileSync(`${file}.tmp`, JSON.stringify({ refresh_token: y.refresh_token, kapsam: y.scope, alindi: isoMinute() }, null, 1) + "\n", { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
  console.log(`Connected. Token: ${file}`);
}

if (process.argv[1] === import.meta.filename && process.argv[2] === "giris") await login();
