// Claude Files: what has piled up in the Claude folders. Reads only; nothing here writes, moves or deletes a file.
// The scan runs when the page asks, never at startup, and its answer is kept for a minute.
import { page, send } from "../../../lib/common.js";
import { overview } from "./scan.js";

const MAX_AGE_MS = 60_000;

export default function create({ settings }) {
  let last = null, at = 0, pending = null;

  async function read(force) {
    if (!force && last && Date.now() - at < MAX_AGE_MS) return last;
    pending ??= overview(settings().folders).then((data) => {
      last = data;
      at = Date.now();
      return data;
    }).finally(() => { pending = null; });
    return pending;
  }

  return async (req, res) => {
    const url = new URL(req.url, "http://local");
    if (req.method === "GET" && url.pathname === "/") return page(res, import.meta.dirname);
    if (req.method === "GET" && url.pathname === "/api/overview") {
      try {
        return send(res, 200, await read(url.searchParams.get("refresh") === "1"));
      } catch (e) {
        return send(res, 500, { error: String(e.message || e) });
      }
    }
    send(res, 404, { error: "not found" });
  };
}
