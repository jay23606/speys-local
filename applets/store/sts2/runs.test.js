import assert from "node:assert/strict";
import { test } from "node:test";
import { filterRuns, listRow, ownPlayer, parseCurrent, parseRun, parseRunDetail, summarize } from "./runs.js";

const ME = "76561199000000001", FRIEND = "76561199000000002";

const raw = (over = {}) => JSON.stringify({
  start_time: 1790000000, run_time: 1800, seed: "ABC", ascension: 3, win: false, was_abandoned: false, build_id: "v0.1", game_mode: "standard",
  killed_by_encounter: "ENCOUNTER.THE_OBSCURA_NORMAL", killed_by_event: "NONE.NONE",
  map_point_history: [[{}, {}], [{}]],
  players: [{ id: 1, character: "CHARACTER.SILENT", deck: [{ id: "CARD.STRIKE_SILENT", current_upgrade_level: 1 }], relics: [{ id: "RELIC.AKABEKO" }] }],
  ...over,
});
const run = (over, owner = ME) => ({ ...parseRun(raw(over)), owner });
const coop = (character = "CHARACTER.DEFECT") => ({
  players: [{ id: "@ME", character }, { id: "@FRIEND", character: "CHARACTER.REGENT" }],
});
const coopRaw = (over) => raw({ ...coop(), ...over }).replace('"@ME"', ME).replace('"@FRIEND"', FRIEND);

test("reads a solo run", () => {
  const r = parseRun(raw());
  assert.equal(r.sourceKey, "sts2:1790000000:ABC");
  assert.equal(r.duration, 30);
  assert.equal(r.floors, 3);
  assert.equal(r.killedBy, "The Obscura");
  assert.deepEqual(r.players[0], { steamId: null, character: "Silent", deck: [{ id: "STRIKE_SILENT", up: 1 }], relics: ["AKABEKO"] });
});

test("a Steam id keeps all its digits", () => {
  assert.deepEqual(parseRun(coopRaw()).players.map((p) => p.steamId), [ME, FRIEND]);
});

test("a broken or foreign file is not a run", () => {
  for (const text of ["{", "null", "{}", JSON.stringify({ start_time: 5, players: [] })]) assert.equal(parseRun(text), null);
});

test("a won run has no killer and missing fields fall back", () => {
  assert.equal(parseRun(raw({ win: true })).killedBy, "");
  const bare = parseRun(JSON.stringify({ start_time: 5, players: [{}] }));
  assert.equal(bare.players[0].character, "?");
  assert.equal(bare.floors, 0);
});

test("the owner is found in co-op wherever they sit", () => {
  const swapped = { ...parseRun(coopRaw()), owner: FRIEND };
  assert.equal(ownPlayer(swapped).character, "Regent");
  assert.equal(ownPlayer(run()).character, "Silent");
});

test("summary separates solo and co-op, and leaves the owner out of people", () => {
  const runs = [
    run({ win: true, ascension: 5 }),
    run({ was_abandoned: true, seed: "B" }),
    { ...parseRun(coopRaw({ win: true, ascension: 8, seed: "C" })), owner: ME },
    { ...parseRun(coopRaw({ seed: "D" })), owner: ME },
  ];
  const s = summarize(runs);
  assert.deepEqual(s.totals, { games: 4, wins: 2, abandoned: 1, minutes: 120, best: 8 });
  assert.deepEqual(s.characters.find((c) => c.character === "Silent"), { character: "Silent", games: 2, wins: 1, bestSolo: 5, bestCoop: -1 });
  assert.deepEqual(s.characters.find((c) => c.character === "Defect"), { character: "Defect", games: 2, wins: 1, bestSolo: -1, bestCoop: 8 });
  assert.deepEqual(s.people, [{ steamId: FRIEND, games: 2, wins: 1, best: 8 }]);
});

test("killers count lost runs only, most deadly first", () => {
  const runs = [
    run({ killed_by_encounter: "ENCOUNTER.QUEEN_BOSS", seed: "A" }),
    run({ killed_by_encounter: "ENCOUNTER.THE_OBSCURA_NORMAL", seed: "B" }),
    run({ killed_by_encounter: "ENCOUNTER.THE_OBSCURA_NORMAL", seed: "C" }),
    run({ killed_by_encounter: "ENCOUNTER.QUEEN_BOSS", was_abandoned: true, seed: "D" }),
    run({ win: true, seed: "E" }),
  ];
  assert.deepEqual(summarize(runs).killers, [{ name: "The Obscura", games: 2 }, { name: "Queen", games: 1 }]);
});

test("filters by mode, character and person", () => {
  const solo = run();
  const together = { ...parseRun(coopRaw({ seed: "C" })), owner: ME };
  assert.deepEqual(filterRuns([solo, together], { mode: "solo" }), [solo]);
  assert.deepEqual(filterRuns([solo, together], { mode: "coop" }), [together]);
  assert.deepEqual(filterRuns([solo, together], { character: "Silent" }), [solo]);
  assert.deepEqual(filterRuns([solo, together], { person: FRIEND }), [together]);
  assert.equal(filterRuns([solo, together], { mode: null, character: null, person: null }).length, 2);
});

test("a detail gives each player their own floors", () => {
  const floor = (type, room, mine, theirs) => ({
    map_point_type: type,
    rooms: [room],
    player_stats: [{ player_id: "@ME", ...mine }, { player_id: "@FRIEND", ...theirs }],
  });
  const text = coopRaw({
    map_point_history: [[
      floor("monster", { model_id: "ENCOUNTER.CORPSE_SLUGS_WEAK", turns_taken: 5 }, { current_hp: 60, max_hp: 80, damage_taken: 20, upgraded_cards: ["CARD.X"] }, { current_hp: 70, max_hp: 75 }),
    ], [
      floor("unknown", { room_type: "event", model_id: "EVENT.NEST" }, { current_hp: 65, max_hp: 80, hp_healed: 5, gold_gained: 30 }, { current_hp: 70, max_hp: 75 }),
    ]],
  }).replaceAll('"@ME"', ME).replaceAll('"@FRIEND"', FRIEND);
  const [me, friend] = parseRunDetail(text).players;
  assert.deepEqual(me.floors[0], { floor: 1, act: 1, type: "monster", name: "Corpse Slugs", turns: 5, hp: 60, maxHp: 80, damage: 20 });
  assert.equal(me.floors[1].type, "event");
  assert.equal(me.floors[1].act, 2);
  assert.equal(friend.floors[0].hp, 70);
  assert.deepEqual(me.totals, { damage: 20, healed: 5, goldGained: 30, goldSpent: 0, upgrades: 1, removed: 0, potions: 0 });
});

test("a solo detail still finds its floors and a card keeps where it was taken", () => {
  const text = raw({
    map_point_history: [[{ map_point_type: "boss", rooms: [{ model_id: "ENCOUNTER.QUEEN_BOSS" }], player_stats: [{ player_id: 1, current_hp: 9, max_hp: 70 }] }]],
    players: [{ id: 1, character: "CHARACTER.SILENT", deck: [{ id: "CARD.X", floor_added_to_deck: 4 }], relics: [{ id: "RELIC.Y", floor_added_to_deck: 7 }], badges: [{ id: "ELITE", rarity: "silver" }, { id: "CCCCOMBO" }] }],
  });
  const [me] = parseRunDetail(text).players;
  assert.equal(me.floors[0].hp, 9);
  assert.deepEqual(me.deck, [{ id: "X", up: 0, floor: 4 }]);
  assert.deepEqual(me.relics, [{ id: "Y", floor: 7 }]);
  assert.deepEqual(me.badges, ["ELITE.silver", "CCCCOMBO"]);
});

test("a list row carries no deck", () => {
  assert.deepEqual(listRow(run()).players, [{ steamId: null, character: "Silent" }]);
});

/** current_run_mp.save: net_id and character_id instead of id and character, the seed under rng, HP and gold on the player. */
const currentRaw = () => JSON.stringify({
  start_time: 1790000000, run_time: 600, ascension: 10, game_mode: "standard", save_time: 1790000700,
  current_act_index: 1, rng: { seed: "SEED1" },
  acts: [{ rooms: { boss_id: "ENCOUNTER.THE_KIN_BOSS" } }, { rooms: { boss_id: "ENCOUNTER.KNOWLEDGE_DEMON_BOSS" } }],
  map_point_history: [[{ map_point_type: "monster", rooms: [{}], player_stats: [{ player_id: "@ME", current_hp: 60, max_hp: 80 }] }], [{ map_point_type: "elite", rooms: [{}], player_stats: [{ player_id: "@ME", current_hp: 0, max_hp: 0 }] }]],
  players: [
    { net_id: "@ME", character_id: "CHARACTER.DEFECT", current_hp: 55, max_hp: 80, gold: 120, deck: [{ id: "CARD.ZAP" }], relics: [], extra_fields: { damage_dealt: 668 } },
    { net_id: "@FRIEND", character_id: "CHARACTER.NECROBINDER", current_hp: 40, max_hp: 70, gold: 90, deck: [], relics: [] },
  ],
}).replaceAll('"@ME"', ME).replace('"@FRIEND"', FRIEND);

test("reads the run being played", () => {
  const r = parseCurrent(currentRaw());
  assert.equal(r.inProgress, true);
  assert.equal(r.sourceKey, "sts2:1790000000:SEED1"); // the same key the finished run will have
  assert.deepEqual([r.act, r.boss, r.floors, r.ascension, r.savedAt], [2, "Knowledge Demon", 2, 10, 1790000700]);
  assert.deepEqual(r.players.map((p) => [p.steamId, p.character, p.hp, p.maxHp, p.gold]), [[ME, "Defect", 55, 80, 120], [FRIEND, "Necrobinder", 40, 70, 90]]);
  const [me] = r.players;
  assert.deepEqual(me.floors.map((f) => f.hp), [60, 55]); // the unfinished room shows the HP now
  assert.deepEqual(r.players.map((p) => p.totals.dealt), [668, null]);
  assert.deepEqual(listRow(r).players[1], { steamId: FRIEND, character: "Necrobinder", hp: 40, maxHp: 70, gold: 90 });
});

test("an unreadable current run is skipped", () => {
  for (const text of ["", "{", "null", JSON.stringify({ start_time: 5, players: [] })]) assert.equal(parseCurrent(text), null);
});
