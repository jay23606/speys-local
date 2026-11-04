import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLog, playsFor } from "./plays.js";

const ME = "76561199000000001", FRIEND = "76561199000000002";
const log = (lines) => lines.map((l) => `[INFO] ${l}`).join("\n");
const fight = (name) => `Creating NCombatRoom with mode=ActiveCombat encounter=${name}.`;
const play = (player, card) => `Player ${player} playing card ${card} (no target)`;
const enemy = "Monster CULTIST performing move INCANTATION";

test("a turn ends when the enemies move, and the biggest one is kept card by card", () => {
  const [run] = parseLog(log([
    "Embarking on a singleplayer DEFECT run. Ascension: 0 Seed: ABC",
    fight("CULTISTS_NORMAL"), play(1, "ZAP"), play(1, "DUALCAST"), enemy, enemy,
    play(1, "ZAP"), play(1, "ZAP"), play(1, "COOLHEADED"), enemy,
    "Wrote 9 bytes to path=user://steam/1/profile1/saves/history/1790000000.run save_dir=user://steam/1",
  ]));
  assert.deepEqual([run.seed, run.start], ["ABC", 1790000000]);
  assert.deepEqual(run.players["1"], { played: 5, top: [["ZAP", 3], ["DUALCAST", 1], ["COOLHEADED", 1]], best: { n: 3, cards: ["ZAP", "ZAP", "COOLHEADED"], fight: "CULTISTS_NORMAL" } });
});

test("a history file copied from the cloud does not end a run, and a run cut off by a restart keeps its seed", () => {
  const runs = parseLog(log([
    "Copying profile1/saves/history/1780000000.run from cloud to local.",
    "Wrote 9 bytes to path=user://steam/1/profile1/saves/history/1780000000.run save_dir=user://steam/1",
    `Embarking on a multiplayer run. Players: Player ${ME}, DEFECT,Player ${FRIEND}, REGENT. Ascension: 10 Seed: 02_11_2026_2P`,
    fight("SLIMES_WEAK"), play(ME, "ZAP"), play(FRIEND, "STRIKE_REGENT"),
  ]));
  assert.equal(runs.length, 1);
  assert.deepEqual([runs[0].seed, runs[0].start], ["02_11_2026_2P", null]);
  assert.deepEqual(Object.keys(runs[0].players), [ME, FRIEND]);
});

test("parts of a run from two logs add up, each player by their Steam id", () => {
  const part = (zaps, best) => ({ players: { [ME]: { played: zaps, top: [["ZAP", zaps]], best: { n: best, cards: [], fight: "" } } } });
  const run = { players: [{ steamId: FRIEND }, { steamId: ME }] };
  const [friend, me] = playsFor(run, [part(4, 2), part(6, 5)]);
  assert.equal(friend, null);
  assert.deepEqual([me.played, me.top, me.best.n], [10, [["ZAP", 10]], 5]);
  assert.equal(playsFor(run, []), null);
});

test("in solo the log's player 1 is the only player", () => {
  const [me] = playsFor({ players: [{ steamId: null }] }, [{ players: { 1: { played: 3, top: [["ZAP", 3]], best: { n: 3, cards: [], fight: "" } } } }]);
  assert.equal(me.played, 3);
});
