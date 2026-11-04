import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { chosenSounds, listSounds, soundPath, soundsFolder } from "./sounds.js";

const dir = mkdtempSync(join(tmpdir(), "speys-sounds-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const home = (name, files = []) => {
  const h = join(dir, name);
  mkdirSync(soundsFolder(h), { recursive: true });
  for (const f of files) writeFileSync(join(soundsFolder(h), f), "own");
  return h;
};

test("a fresh install has the Speys sounds and uses them", () => {
  const h = home("fresh");
  const speys = listSounds(h).filter((s) => s.speys);
  assert.equal(speys.length, 13);
  const chosen = chosenSounds(h);
  assert.ok(speys.some((s) => s.id === chosen.done) && speys.some((s) => s.id === chosen.approval));
  for (const s of speys) assert.ok(existsSync(soundPath(h, s.id)), s.name);
});

test("your own files are listed next to them, and a saved choice stays", () => {
  const h = home("own", ["mine.mp3"]);
  const mine = listSounds(h).find((s) => s.own);
  assert.equal(mine.id, "file:mine.mp3");
  assert.equal(soundPath(h, mine.id), join(soundsFolder(h), "mine.mp3"));
  assert.equal(chosenSounds(h, { done: mine.id }).done, mine.id);
});

test("an own copy of a Speys sound doesn't show twice, and older installs keep their file", () => {
  const h = home("copy", ["Speys Done 1 Soft Bell.wav", "bitti.m4a"]);
  assert.equal(listSounds(h).filter((s) => s.name === "Speys Done 1 Soft Bell").length, 1);
  assert.equal(chosenSounds(h).done, "file:bitti.m4a");
});

test("an id that isn't on the list reaches no file", () => {
  const h = home("safe");
  assert.equal(soundPath(h, "file:../../settings.json"), null);
  assert.equal(soundPath(h, "file:bitti.m4a"), null);
});
