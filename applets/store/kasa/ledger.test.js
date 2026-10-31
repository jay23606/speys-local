import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteEntry, deletePlan, emptyLedger, forecast, materialize, monthExpected, overview, saveEntry, savePlan, saveRule, setRuleActive } from "./ledger.js";

const OCT = { from: "2026-10-01", to: "2026-10-31", year: 2026 };
const entry = (extra = {}) => ({ direction: "out", title: "Figma", amount: 100, category: "yazilim", entryDate: "2026-10-10", ...extra });
const rule = (extra = {}) => ({ direction: "out", title: "Claude", amount: 1000, category: "yazilim", cycle: "monthly", dayOfMonth: 5, ...extra });

test("an invalid entry is not written", () => {
  const l = emptyLedger();
  assert.throws(() => saveEntry(l, entry({ title: "  " })), /Title/);
  assert.throws(() => saveEntry(l, entry({ amount: 0 })), /Amount/);
  assert.throws(() => saveEntry(l, entry({ amount: "abc" })), /Amount/);
  assert.throws(() => saveEntry(l, entry({ entryDate: "2026-02-31" })), /date/);
  assert.throws(() => saveEntry(l, entry({ direction: "x" })), /direction/);
  assert.equal(l.entries.length, 0);
});

test("entry amounts retain sub-cent precision", () => {
  const l = emptyLedger();
  saveEntry(l, entry({ amount: 0.001 }));
  assert.equal(l.entries[0].amount, 0.001);
});

test("editing keeps the id, a missing entry cannot be edited", () => {
  const l = emptyLedger();
  const { id } = saveEntry(l, entry());
  saveEntry(l, entry({ id, amount: 250 }));
  assert.equal(l.entries.length, 1);
  assert.equal(l.entries[0].amount, 250);
  assert.throws(() => saveEntry(l, entry({ id: "missing" })), /not found/);
});

test("the summary skips pending entries and non-operating categories", () => {
  const l = emptyLedger();
  saveEntry(l, entry());
  saveEntry(l, entry({ amount: 50, status: "pending" }));
  saveEntry(l, entry({ amount: 900, category: "ortak_cekis" }));
  saveEntry(l, entry({ direction: "in", category: "hizmet", amount: 500 }));
  saveEntry(l, entry({ entryDate: "2026-09-10", amount: 70 }));
  const o = overview(l, OCT, "2026-10-31");
  assert.deepEqual(o.summary, { income: 500, expense: 100, profit: 400 });
  assert.equal(o.pending.length, 1);
  assert.equal(o.monthly[8].expense, 70);
  assert.equal(o.monthly[9].expense, 100);
});

test("the sync status is honest: not connected, and the time of an import if there was one", () => {
  const l = emptyLedger();
  assert.deepEqual(overview(l, OCT, "2026-10-31").sync, { connected: false, lastImport: null });
  l.importedFrom = { source: "speys", at: "2026-10-31T00:30:00.000Z" };
  assert.equal(overview(l, OCT, "2026-10-31").sync.lastImport.source, "speys");
});

test("an imported entry keeps its currency fields when edited", () => {
  const l = emptyLedger();
  const { id } = saveEntry(l, entry());
  Object.assign(l.entries[0], { currency: "USD", originalAmount: 100 });
  saveEntry(l, entry({ id, status: "pending" }));
  assert.equal(l.entries[0].currency, "USD");
  assert.equal(l.entries[0].originalAmount, 100);
});

test("a deleted entry stays for sync but is not listed", () => {
  const l = emptyLedger();
  const { id } = saveEntry(l, entry());
  deleteEntry(l, id);
  assert.ok(l.entries[0].deletedAt);
  assert.equal(overview(l, OCT, "2026-10-31").entries.length, 0);
});

test("a repeat is written once when due, a deleted one is not recreated", () => {
  const l = emptyLedger();
  saveRule(l, rule({ dayOfMonth: 5 }), "2026-08-20");
  materialize(l, "2026-10-06");
  assert.deepEqual(l.entries.map((e) => e.entryDate), ["2026-09-05", "2026-10-05"]);
  materialize(l, "2026-10-06");
  assert.equal(l.entries.length, 2);
  deleteEntry(l, l.entries[1].id);
  l.rules[0].lastGenerated = "2026-10-01";
  materialize(l, "2026-10-06");
  assert.equal(l.entries.length, 2);
});

test("in a short month the day moves to the last day; yearly and quarterly only in their own month", () => {
  const l = emptyLedger();
  saveRule(l, rule({ dayOfMonth: 31 }), "2027-02-01");
  saveRule(l, rule({ title: "Domain", cycle: "yearly", monthOfYear: 3, dayOfMonth: 1 }), "2027-01-01");
  saveRule(l, rule({ title: "Quarterly", cycle: "quarterly", monthOfYear: 1, dayOfMonth: 2 }), "2027-01-01");
  materialize(l, "2027-04-03");
  const of = (title) => l.entries.filter((e) => e.title === title).map((e) => e.entryDate);
  assert.deepEqual(of("Claude"), ["2027-02-28", "2027-03-31"]);
  assert.deepEqual(of("Domain"), ["2027-03-01"]);
  assert.deepEqual(of("Quarterly"), ["2027-01-02", "2027-04-02"]);
});

test("a resumed rule does not write the months in between", () => {
  const l = emptyLedger();
  const { id } = saveRule(l, rule(), "2026-08-01");
  materialize(l, "2026-08-10");
  setRuleActive(l, id, false, "2026-08-10");
  materialize(l, "2026-10-20");
  assert.equal(l.entries.length, 1);
  setRuleActive(l, id, true, "2026-10-20");
  materialize(l, "2026-11-06");
  assert.deepEqual(l.entries.map((e) => e.entryDate), ["2026-08-05", "2026-11-05"]);
});

test("the next 30 days show only active rules, across a year change too", () => {
  const l = emptyLedger();
  saveRule(l, rule({ dayOfMonth: 5 }), "2026-12-20");
  const { id } = saveRule(l, rule({ title: "Stopped" }), "2026-12-20");
  setRuleActive(l, id, false, "2026-12-20");
  const o = overview(l, OCT, "2026-12-20");
  assert.deepEqual(o.upcoming.map((u) => [u.title, u.dueDate]), [["Claude", "2027-01-05"]]);
});

const plan = (extra = {}) => ({ direction: "out", title: "Lawyer", amount: 25000, category: "other", cycle: "monthly", startMonth: "2026-11", ...extra });

test("plan cycles land in their own months, across a year change too", () => {
  const l = emptyLedger();
  savePlan(l, plan({ title: "Monthly", amount: 1, endMonth: "2026-12" }));
  savePlan(l, plan({ title: "Once", amount: 10, cycle: "once" }));
  savePlan(l, plan({ title: "Each quarter", amount: 100, cycle: "quarterly", startMonth: "2026-11" }));
  savePlan(l, plan({ title: "Yearly", amount: 1000, cycle: "yearly", startMonth: "2027-03" }));
  const of = (ym) => monthExpected(l, ym, "2026-10-31").expense;
  assert.equal(of("2026-11"), 111);
  assert.equal(of("2026-12"), 1);
  assert.equal(of("2027-01"), 0);
  assert.equal(of("2027-02"), 100);
  assert.equal(of("2027-03"), 1000);
  assert.equal(of("2028-03"), 1000);
});

test("a rule's future dates are expected, a future start and a paused rule are not", () => {
  const l = emptyLedger();
  saveRule(l, rule({ dayOfMonth: 24 }), "2026-10-24");
  const stopped = saveRule(l, rule({ title: "Stopped", dayOfMonth: 25 }), "2026-10-24");
  setRuleActive(l, stopped.id, false, "2026-10-24");
  const yearly = saveRule(l, rule({ title: "Domain", cycle: "yearly", monthOfYear: 9, dayOfMonth: 25 }), "2027-09-25");
  assert.ok(yearly);
  assert.equal(monthExpected(l, "2026-10", "2026-10-24").expense, 0, "today's payment is no longer expected");
  assert.equal(monthExpected(l, "2026-11", "2026-10-31").expense, 1000);
  assert.equal(monthExpected(l, "2027-09", "2026-10-31").expense, 2000);
  assert.equal(monthExpected(l, "2026-09", "2026-10-31").expense, 0, "a past month expects nothing");
});

test("a plan item written to the ledger is not counted twice; expected again once deleted", () => {
  const l = emptyLedger();
  savePlan(l, plan());
  const { id } = saveEntry(l, entry({ title: "lawyer", amount: 25000, entryDate: "2026-11-03" }));
  assert.equal(monthExpected(l, "2026-11", "2026-11-05").expense, 0);
  deleteEntry(l, id);
  assert.equal(monthExpected(l, "2026-11", "2026-11-05").expense, 25000);
});

test("a non-operating plan item is listed but not summed; income is separate", () => {
  const l = emptyLedger();
  savePlan(l, plan({ title: "Withdrawal", category: "ortak_cekis" }));
  savePlan(l, plan({ title: "Service", direction: "in", category: "hizmet", amount: 15000 }));
  const m = monthExpected(l, "2026-11", "2026-10-31");
  assert.equal(m.items.length, 2);
  assert.equal(m.expense, 0);
  assert.equal(m.income, 15000);
});

test("the chart covers 12 months from the start of this quarter", () => {
  const l = emptyLedger();
  assert.deepEqual([forecast(l, "2026-10-31")[0].ym, forecast(l, "2026-10-31")[11].ym], ["2026-10", "2027-09"]);
  assert.equal(forecast(l, "2027-01-01")[0].ym, "2027-01");
  assert.equal(forecast(l, "2027-03-31")[0].ym, "2027-01");
  assert.equal(forecast(l, "2027-06-30")[0].ym, "2027-04");
  assert.deepEqual([forecast(l, "2026-12-31")[2].ym, forecast(l, "2026-12-31")[3].ym], ["2026-12", "2027-01"]);
});

test("actual and expected are separate, an old ledger opens too", () => {
  const l = emptyLedger();
  delete l.plans;
  saveEntry(l, entry({ entryDate: "2026-10-05" }));
  assert.equal(forecast(l, "2026-10-31")[0].expense, 100);
  savePlan(l, plan());
  const f = forecast(l, "2026-10-31");
  assert.equal(f[1].expense, 0);
  assert.equal(f[1].expectedExpense, 25000);
  deletePlan(l, l.plans[0].id);
  assert.equal(forecast(l, "2026-10-31")[1].expectedExpense, 0);
});

test("finance lines: an unpaid entry is expected, actual is separate, no non-operating", () => {
  const l = emptyLedger();
  saveEntry(l, entry({ direction: "in", category: "hizmet", title: "Study", amount: 15000, entryDate: "2026-10-05", status: "pending" }));
  saveEntry(l, entry({ amount: 100, entryDate: "2026-10-06" }));
  saveEntry(l, entry({ amount: 900, category: "ortak_cekis", entryDate: "2026-10-07" }));
  savePlan(l, plan({ startMonth: "2026-10", cycle: "once", category: "muhasebe", amount: 50, title: "Advisor" }));
  const [oct] = forecast(l, "2026-10-31");
  assert.equal(oct.income, 0);
  assert.equal(oct.expectedIncome, 15000);
  assert.equal(oct.expense, 100);
  assert.equal(oct.expectedExpense, 50);
  assert.deepEqual(oct.lines.find((x) => x.category === "yazilim"), { direction: "out", category: "yazilim", actual: 100, expected: 0 });
  assert.equal(oct.lines.some((x) => x.category === "ortak_cekis"), false);
});

test("an invalid plan is not written", () => {
  const l = emptyLedger();
  assert.throws(() => savePlan(l, plan({ startMonth: "2026-13" })), /start month/);
  assert.throws(() => savePlan(l, plan({ endMonth: "2026-10" })), /end month/);
  assert.throws(() => savePlan(l, plan({ cycle: "weekly" })), /cycle/);
  assert.equal(l.plans.length, 0);
});

test("a wrong month or day does not make a rule", () => {
  const l = emptyLedger();
  assert.throws(() => saveRule(l, rule({ dayOfMonth: 32 }), "2026-10-01"), /Day/);
  assert.throws(() => saveRule(l, rule({ cycle: "yearly" }), "2026-10-01"), /month/);
  assert.throws(() => saveRule(l, rule({ cycle: "weekly" }), "2026-10-01"), /cycle/);
});
