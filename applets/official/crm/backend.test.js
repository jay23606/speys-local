import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import create from "./backend.js";

const dataDir = mkdtempSync(join(tmpdir(), "speys-crm-"));
const server = createServer(create({ dataDir, settings: () => ({}), t: (s) => s }));
let base;
before(() => new Promise((done) => server.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}`; done(); })));
after(() => { server.close(); rmSync(dataDir, { recursive: true, force: true }); });

const read = () => fetch(`${base}/api/crm`).then((r) => r.json());
const write = (body) => fetch(`${base}/api/crm`, { method: "POST", headers: { "X-Panel": "1" }, body: JSON.stringify(body) });

test("a record goes on and off the agenda without touching its other fields", async () => {
  const pipeline_id = (await read()).hatlar[0].id;
  assert.equal((await write({ op: "ekle", pipeline_id, title: "Cafe" })).status, 200);
  const { id } = (await read()).kayitlar[0];
  await write({ op: "guncelle", id, alanlar: { next_action: "Call", next_action_at: "2026-11-03" } });

  assert.equal((await write({ op: "guncelle", id, alanlar: { gundem: true } })).status, 200);
  let deal = (await read()).kayitlar[0];
  assert.equal(deal.gundem, true);
  assert.equal(deal.next_action, "Call");

  await write({ op: "guncelle", id, alanlar: { gundem: false } });
  deal = (await read()).kayitlar[0];
  assert.equal(deal.gundem, false);
  assert.equal(deal.next_action_at, "2026-11-03");
});

test("the agenda flag is always stored as a boolean", async () => {
  const { id } = (await read()).kayitlar[0];
  await write({ op: "guncelle", id, alanlar: { gundem: "yes" } });
  assert.equal((await read()).kayitlar[0].gundem, true);
});
