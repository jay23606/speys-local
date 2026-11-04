import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { analyze, fullYorForm, isKeyboardSlip } from "./analyze.js";

const dir = mkdtempSync(join(tmpdir(), "speys-yazim-"));
after(() => rmSync(dir, { recursive: true, force: true }));

async function errorsIn(name, text) {
  const project = join(dir, name, "projects", "p");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "s.jsonl"), JSON.stringify({ type: "user", sessionId: "s", timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: text } }) + "\n");
  const { kelimeler } = await analyze(join(dir, name, "out"), [join(dir, name)]);
  return new Map(kelimeler.flatMap(([right, , forms]) => forms.map(([wrong]) => [wrong, right])));
}

test("the spoken -yo forms map to -yor", () => {
  assert.equal(fullYorForm("kalıyo"), "kalıyor");
  assert.equal(fullYorForm("geliyom"), "geliyorum");
  assert.equal(fullYorForm("bitiyodu"), "bitiyordu");
  assert.equal(fullYorForm("düşünüyodum"), "düşünüyordum");
  assert.equal(fullYorForm("oyun"), null);
});

test("a neighbour counts only if fingers could have produced it", () => {
  assert.equal(isKeyboardSlip("widget", "şiddet"), false);
  assert.equal(isKeyboardSlip("kaydıralım", "kaldıralım"), false);
  assert.equal(isKeyboardSlip("soliter", "oliver"), false);
  assert.equal(isKeyboardSlip("sınucu", "sonucu"), true);
  assert.equal(isKeyboardSlip("kaldırlaım", "kaldıralım"), true);
  assert.equal(isKeyboardSlip("ekleyeim", "ekleyelim"), true);
  assert.equal(isKeyboardSlip("okyu", "koyu"), true);
  assert.equal(isKeyboardSlip("widget", "wide"), false);
});

test("spoken forms, words with endings and far-away neighbours aren't errors", async () => {
  const errors = await errorsIn("clean", "kalıyo yüklenmiyo bitiyo düşünüyodum iconları iconlar fotoda fotodaki görseli telde kaydıralım widget hosttan apk capcutta bakımcı ekliyoduk soliter takılıyo okun");
  assert.deepEqual([...errors], []);
});

test("a possessive isn't a question without its space", async () => {
  const errors = await errorsIn("possessive", "projemi sayfamı videomu listemi müşterimi kedimi notumu kaldımı geliyomu gelmişmi");
  for (const word of ["projemi", "sayfamı", "videomu", "listemi", "müşterimi", "kedimi", "notumu"]) assert.ok(!(errors.get(word) ?? "").includes(" "), word);
  assert.equal(errors.get("kaldımı"), "kaldı mı");
  assert.equal(errors.get("geliyomu"), "geliyor mu");
  assert.equal(errors.get("gelmişmi"), "gelmiş mi");
});

test("the same letters in another order are a typo, even with two changes", async () => {
  const errors = await errorsIn("same-letters", "oalrka ypalaım faklrı bkalaım eşkidle soliter");
  for (const [wrong, right] of [["oalrka", "olarak"], ["ypalaım", "yapalım"], ["faklrı", "farklı"], ["bkalaım", "bakalım"], ["eşkidle", "şekilde"]]) assert.equal(errors.get(wrong), right, wrong);
  assert.ok(!errors.has("soliter"));
});

test("real typos are still found", async () => {
  const errors = await errorsIn("typos", "ekleyeim ayarllarız sınucu kaldırlaım gridin açlışıyo uygulamyı oyunlarada girişde kulla içn takib olnn panleden deniyelim kaldımı geliyomu kısmınıa okyu");
  for (const [wrong, right] of [["ekleyeim", "ekleyelim"], ["ayarllarız", "ayarlarız"], ["sınucu", "sonucu"], ["kaldırlaım", "kaldıralım"], ["gridin", "girdin"], ["açlışıyo", "çalışıyor"], ["uygulamyı", "uygulamayı"], ["oyunlarada", "oyunlarda"], ["kulla", "kullan"], ["içn", "için"], ["takib", "takip"], ["olnn", "olan"], ["panleden", "panelden"], ["deniyelim", "deneyelim"], ["kaldımı", "kaldı mı"], ["geliyomu", "geliyor mu"]]) {
    assert.equal(errors.get(wrong), right, wrong);
  }
  assert.ok(errors.has("girişde"));
  for (const wrong of ["kısmınıa", "okyu"]) assert.ok(errors.has(wrong), wrong);
});
