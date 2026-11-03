import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import create from "./backend.js";

const dataDir = mkdtempSync(join(tmpdir(), "speys-social-"));
const server = createServer(create({ dataDir, settings: () => ({}), t: (s) => s }));
let base;
before(() => new Promise((done) => server.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}`; done(); })));
after(() => { server.close(); rmSync(dataDir, { recursive: true, force: true }); });

const read = () => fetch(`${base}/api/sosyal`).then((r) => r.json());
const write = (body) => fetch(`${base}/api/sosyal`, { method: "POST", headers: { "X-Panel": "1" }, body: JSON.stringify(body) });
const onDisk = () => JSON.parse(readFileSync(join(dataDir, "takvim.json"), "utf8"));

test("opens with nothing set up, and a change writes the calendar", async () => {
  assert.deepEqual((await read()).hesaplar, []);
  assert.equal((await write({ op: "hesap_ekle", ad: "Me", kullanici: "@me" })).status, 200);
  assert.equal(onDisk().hesaplar[0].ad, "Me");
});

test("a tweet keeps its text, day and time, and has a short title", async () => {
  const hesap = (await read()).hesaplar[0].id;
  const metin = `First line that goes on for quite a long time, longer than a title should be\nSecond line`;
  assert.equal((await write({ op: "tweet_ekle", hesap, metin, tarih: "2030-01-02", saat: "18:30", not: "attach card" })).status, 200);
  const tweet = (await read()).videolar[0];
  assert.deepEqual([tweet.tur, tweet.metin, tweet.tarih, tweet.saat, tweet.not], ["tweet", metin, "2030-01-02", "18:30", "attach card"]);
  assert.ok(tweet.baslik.length <= 60 && !tweet.baslik.includes("\n"));
  assert.equal((await write({ op: "tweet_duzenle", id: tweet.id, metin: "New", tarih: "", saat: "", not: "" })).status, 200);
  assert.deepEqual((({ metin: m, baslik, tarih, saat }) => [m, baslik, tarih, saat])(onDisk().videolar[0]), ["New", "New", null, ""]);
});

test("sharing on X marks a tweet shared, and bad input is refused", async () => {
  const hesap = (await read()).hesaplar[0].id;
  const id = (await read()).videolar[0].id;
  assert.equal((await write({ op: "platform", id, platform: "x", deger: true })).status, 200);
  const tweet = onDisk().videolar[0];
  assert.ok(tweet.adimlar.paylasildi && tweet.platformlar.x);
  for (const body of [{ op: "tweet_ekle", hesap, metin: "  " }, { op: "tweet_ekle", hesap: "nobody", metin: "x" }, { op: "tweet_ekle", hesap, metin: "x", saat: "25:00" }, { op: "tweet_ekle", hesap, metin: "x", tarih: "soon" }]) {
    assert.equal((await write(body)).status, 400, JSON.stringify(body));
  }
});

test("a video keeps its planned time, and a bad time is refused", async () => {
  const hesap = (await read()).hesaplar[0].id;
  assert.equal((await write({ op: "video_ekle", hesap, baslik: "Clip", tarih: "2030-01-02", saat: "18:00" })).status, 200);
  const video = onDisk().videolar.at(-1);
  assert.equal(video.saat, "18:00");
  assert.equal((await write({ op: "video_duzenle", id: video.id, baslik: "Clip", saat: "21:15" })).status, 200);
  assert.equal(onDisk().videolar.at(-1).saat, "21:15");
  assert.equal((await write({ op: "video_duzenle", id: video.id, baslik: "Clip", saat: "25:00" })).status, 400);
  assert.equal((await write({ op: "video_ekle", hesap, baslik: "Clip", saat: "soon" })).status, 400);
  assert.equal((await write({ op: "video_sil", id: video.id })).status, 200);
});

test("a full-size cover is not found without a video", async () => {
  assert.equal((await fetch(`${base}/sosyal/kapak-tam/nobody`)).status, 404);
});

test("a cover made for a video is served in both sizes, and can't point outside the calendar's folder", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg==", "base64");
  writeFileSync(join(dataDir, "made.png"), png);
  const calendar = onDisk();
  calendar.videolar.push({ id: "made", hesap: calendar.hesaplar[0].id, baslik: "Made", tarih: null, adimlar: {}, kapak_gorsel: "made.png" }, { id: "escaping", hesap: calendar.hesaplar[0].id, baslik: "Out", tarih: null, adimlar: {}, kapak_gorsel: "../made.png" });
  writeFileSync(join(dataDir, "takvim.json"), JSON.stringify(calendar));
  for (const route of ["kapak", "kapak-tam"]) {
    const r = await fetch(`${base}/sosyal/${route}/made`);
    assert.equal(r.status, 200);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
    assert.equal((await fetch(`${base}/sosyal/${route}/escaping`)).status, 404);
  }
  writeFileSync(join(dataDir, "takvim.json"), JSON.stringify({ ...calendar, videolar: calendar.videolar.slice(0, -2) }));
});

test("a shared calendar shows next to your own, and changes go back to the file they came from", async () => {
  const own = mkdtempSync(join(tmpdir(), "speys-social-own-"));
  const shared = mkdtempSync(join(tmpdir(), "speys-social-shared-"));
  const sharedFile = join(shared, "takvim.json");
  writeFileSync(join(own, "takvim.json"), JSON.stringify({ hesaplar: [{ id: "me", ad: "Me" }], videolar: [{ id: "mine", hesap: "me", baslik: "Mine" }] }));
  writeFileSync(sharedFile, JSON.stringify({ hesaplar: [{ id: "games", ad: "Games", avatar: "logo/games.png" }], videolar: [{ id: "theirs", hesap: "games", baslik: "Theirs", proje: "first" }] }));
  mkdirSync(join(shared, "first", "renders"), { recursive: true });
  writeFileSync(join(shared, "first", "renders", "cut.mp4"), "video");
  mkdirSync(join(shared, "logo"));
  writeFileSync(join(shared, "logo", "games.png"), "logo");

  const app = createServer(create({ dataDir: own, settings: () => ({ shared }), t: (s) => s }));
  await new Promise((done) => app.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${app.address().port}`;
  const get = () => fetch(`${url}/api/sosyal`).then((r) => r.json());
  const post = async (body) => fetch(`${url}/api/sosyal`, { method: "POST", headers: { "X-Panel": "1" }, body: JSON.stringify({ ...body, surum: (await get()).surum }) });
  try {
    const all = await get();
    assert.deepEqual(all.hesaplar.map((a) => a.id), ["me", "games"]);
    const games = all.hesaplar.find((a) => a.id === "games");
    assert.equal(await fetch(`${url}/sosyal/dosya/${encodeURIComponent(games.avatar)}`).then((r) => r.text()), "logo");
    const theirs = all.videolar.find((v) => v.id === "theirs");
    assert.equal(theirs.video, "@shared/first/renders/cut.mp4");
    assert.equal(await fetch(`${url}/sosyal/dosya/${encodeURIComponent(theirs.video)}`).then((r) => r.text()), "video");
    assert.equal((await fetch(`${url}/sosyal/dosya/${encodeURIComponent("@shared/../takvim.json")}`)).status, 404);

    assert.equal((await post({ op: "tarih", id: "theirs", deger: "2030-01-02" })).status, 200);
    assert.equal((await post({ op: "video_ekle", hesap: "games", baslik: "Next" })).status, 200);
    assert.equal((await post({ op: "tarih", id: "mine", deger: "2030-01-03" })).status, 200);
    const onShared = JSON.parse(readFileSync(sharedFile, "utf8"));
    const onOwn = JSON.parse(readFileSync(join(own, "takvim.json"), "utf8"));
    assert.equal(onShared.videolar[0].tarih, "2030-01-02");
    assert.equal(onShared.videolar.length, 2);
    assert.equal(onShared.hesaplar.length, 1);
    assert.equal(onOwn.videolar[0].tarih, "2030-01-03");
    assert.equal(onOwn.videolar.length, 1);

    const before = readFileSync(sharedFile, "utf8");
    writeFileSync(sharedFile, `<<<<<<< HEAD\n${before}`);
    const broken = await get();
    assert.equal(broken.shared_error, true);
    assert.deepEqual(broken.hesaplar.map((a) => a.id), ["me"]);
  } finally {
    app.close();
    rmSync(own, { recursive: true, force: true });
    rmSync(shared, { recursive: true, force: true });
  }
});
