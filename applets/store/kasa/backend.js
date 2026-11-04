// Ledger: an income and expense book, on this computer. Never goes to the network, needs no account.
// Setting: settings.json → "kasa" (file: the ledger file; if empty, dataDir/defter.json).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expand, handleWrite, isoDay, page, readJson, send, writeJson } from "../../../lib/common.js";
import { deleteEntry, deletePlan, deleteRule, emptyLedger, materialize, overview, saveEntry, savePlan, saveRule, setRuleActive } from "./ledger.js";

export default function create({ dataDir, settings, t, language }) {
  const currency = () => String(settings().currency ?? "").replace(/[<>&"']/g, "").trim().slice(0, 8) || (language() === "tr" ? "TL" : "USD");
  const file = () => expand(settings().file) || join(dataDir, "defter.json");
  const load = () => (existsSync(file()) ? readJson(file()) : emptyLedger());

  /** A broken file must not be silently overwritten with an empty ledger: `load` throws, so nothing is written. */
  const write = (req, res, apply) =>
    handleWrite(req, res, (body) => {
      const ledger = load();
      try {
        apply(ledger, body, isoDay());
      } catch (e) {
        // ledger.js has no language: its validation messages are English keys, translated here
        throw new Error(t(e.message));
      }
      writeJson(file(), ledger);
      return true;
    });

  function read(query) {
    const ledger = load();
    const today = isoDay();
    if (materialize(ledger, today)) writeJson(file(), ledger);
    const year = Number(query.get("year")) || +today.slice(0, 4);
    return overview(ledger, {
      from: query.get("from") || `${year}-01-01`,
      to: query.get("to") || `${year}-12-31`,
      year,
    }, today);
  }

  return (req, res) => {
    const url = new URL(req.url, "http://local");
    const path = url.pathname;
    if (req.method === "GET" && path === "/") return page(res, import.meta.dirname);
    if (req.method === "GET" && path === "/api/kasa") {
      try {
        return send(res, 200, { ...read(url.searchParams), currency: currency() });
      } catch (e) {
        return send(res, 500, { error: t("Could not read the ledger file ({file}): {message}", { file: file(), message: e.message }) });
      }
    }
    if (req.method === "POST" && path === "/api/kayit") return write(req, res, (l, b) => saveEntry(l, b));
    if (req.method === "POST" && path === "/api/kayit/sil") return write(req, res, (l, b) => deleteEntry(l, b.id));
    if (req.method === "POST" && path === "/api/kural") return write(req, res, (l, b, today) => saveRule(l, b, today));
    if (req.method === "POST" && path === "/api/kural/durum") return write(req, res, (l, b, today) => setRuleActive(l, b.id, !!b.active, today));
    if (req.method === "POST" && path === "/api/kural/sil") return write(req, res, (l, b) => deleteRule(l, b.id));
    if (req.method === "POST" && path === "/api/plan") return write(req, res, (l, b) => savePlan(l, b));
    if (req.method === "POST" && path === "/api/plan/sil") return write(req, res, (l, b) => deletePlan(l, b.id));
    send(res, 404, { error: "not found" });
  };
}
