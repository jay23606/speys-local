// The ledger itself: pure operations, backend.js writes the file. The sums follow the same rules as Speys's Ledger.
//
// So that sync can be attached later:
// every record has a permanent `id` and an `updatedAt`, a deleted record stays with `deletedAt`. No line numbers.
// Validation messages are English and double as translation keys: backend.js translates them.
import { randomUUID } from "node:crypto";

export const emptyLedger = () => ({ version: 1, entries: [], rules: [], plans: [] });

const NON_OPERATING = new Set(["sermaye", "ortak_cekis", "vergi_odeme"]); // not part of profit
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const stamp = (now) => now.toISOString();
const alive = (x) => !x.deletedAt;

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function validDate(value) {
  if (!DATE.test(value ?? "") || addDays(value, 0) !== value) throw new Error("Invalid date");
  return value;
}

function validCore(input) {
  const title = String(input.title ?? "").trim();
  const amount = Number(input.amount);
  if (!title) throw new Error("Title is required");
  if (!(amount > 0) || !Number.isFinite(amount)) throw new Error("Amount must be greater than zero");
  if (input.direction !== "in" && input.direction !== "out") throw new Error("Invalid direction");
  return {
    direction: input.direction,
    title: title.slice(0, 200),
    amount: Math.round(amount * 100) / 100,
    category: String(input.category || "other"),
    counterparty: String(input.counterparty ?? "").trim() || null,
  };
}

function upsert(list, id, fields, now) {
  const found = id ? list.find((x) => x.id === id && alive(x)) : null;
  if (id && !found) throw new Error("Record not found");
  if (found) return Object.assign(found, fields, { updatedAt: stamp(now) });
  const created = { id: randomUUID(), ...fields, createdAt: stamp(now), updatedAt: stamp(now) };
  list.push(created);
  return created;
}

function remove(list, id, now) {
  const found = list.find((x) => x.id === id && alive(x));
  if (!found) throw new Error("Record not found");
  found.deletedAt = stamp(now);
  found.updatedAt = stamp(now);
}

export function saveEntry(ledger, input, now = new Date()) {
  return upsert(ledger.entries, input.id, {
    ...validCore(input),
    entryDate: validDate(input.entryDate),
    status: input.status === "pending" ? "pending" : "paid",
    note: String(input.note ?? "").trim() || null,
  }, now);
}

export const deleteEntry = (ledger, id, now = new Date()) => remove(ledger.entries, id, now);

export function saveRule(ledger, input, today, now = new Date()) {
  const cycle = input.cycle;
  if (!["monthly", "quarterly", "yearly"].includes(cycle)) throw new Error("Invalid cycle");
  const dayOfMonth = Number(input.dayOfMonth);
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) throw new Error("Day must be between 1 and 31");
  const monthOfYear = cycle === "monthly" ? null : Number(input.monthOfYear);
  if (cycle !== "monthly" && !(Number.isInteger(monthOfYear) && monthOfYear >= 1 && monthOfYear <= 12)) throw new Error("Invalid month");
  const existing = input.id ? ledger.rules.find((r) => r.id === input.id && alive(r)) : null;
  return upsert(ledger.rules, input.id, {
    ...validCore(input),
    cycle,
    dayOfMonth,
    monthOfYear,
    autoPaid: input.autoPaid !== false,
    isActive: input.isActive !== false,
    startDate: existing?.startDate ?? today,
    lastGenerated: existing?.lastGenerated ?? null,
  }, now);
}

/** When a paused rule is resumed, the months it was paused are not written to the ledger retroactively. */
export function setRuleActive(ledger, id, active, today, now = new Date()) {
  const rule = ledger.rules.find((r) => r.id === id && alive(r));
  if (!rule) throw new Error("Rule not found");
  if (active && !rule.isActive) rule.lastGenerated = today;
  rule.isActive = active;
  rule.updatedAt = stamp(now);
}

export const deleteRule = (ledger, id, now = new Date()) => remove(ledger.rules, id, now);

/** The rule's dates within [from, to]; in a short month the day moves to the last day. */
function occurrences(rule, from, to) {
  const out = [];
  let year = +from.slice(0, 4), month = +from.slice(5, 7);
  while (`${year}-${String(month).padStart(2, "0")}-01` <= to) {
    const due = rule.cycle === "monthly"
      || (rule.cycle === "yearly" && month === rule.monthOfYear)
      || (rule.cycle === "quarterly" && (month - rule.monthOfYear + 12) % 3 === 0);
    if (due) {
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const date = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(rule.dayOfMonth, last)).padStart(2, "0")}`;
      if (date >= from && date <= to) out.push(date);
    }
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return out;
}

/** Writes the repeats that have come due to the ledger; a deleted record does not come back. True if anything changed. */
export function materialize(ledger, today, now = new Date()) {
  let changed = false;
  for (const rule of ledger.rules) {
    if (!alive(rule) || !rule.isActive) continue;
    const from = rule.lastGenerated ? addDays(rule.lastGenerated, 1) : rule.startDate;
    if (from > today) continue;
    for (const date of occurrences(rule, from, today)) {
      if (ledger.entries.some((e) => e.recurringId === rule.id && e.entryDate === date)) continue;
      ledger.entries.push({
        id: randomUUID(), direction: rule.direction, title: rule.title, amount: rule.amount, category: rule.category,
        counterparty: rule.counterparty, entryDate: date, status: rule.autoPaid ? "paid" : "pending", note: null,
        recurringId: rule.id, createdAt: stamp(now), updatedAt: stamp(now),
      });
    }
    rule.lastGenerated = today;
    changed = true;
  }
  return changed;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A plan item: not written to the ledger, counted only in expected expenses and income. Month is `YYYY-MM`. */
export function savePlan(ledger, input, now = new Date()) {
  if (!["once", "monthly", "quarterly", "yearly"].includes(input.cycle)) throw new Error("Invalid cycle");
  if (!MONTH.test(input.startMonth ?? "")) throw new Error("Invalid start month");
  const endMonth = input.endMonth || null;
  if (endMonth && (!MONTH.test(endMonth) || endMonth < input.startMonth)) throw new Error("Invalid end month");
  ledger.plans ??= [];
  return upsert(ledger.plans, input.id, {
    ...validCore(input),
    cycle: input.cycle,
    startMonth: input.startMonth,
    endMonth: input.cycle === "once" ? null : endMonth,
    note: String(input.note ?? "").trim() || null,
  }, now);
}

export const deletePlan = (ledger, id, now = new Date()) => remove(ledger.plans ?? [], id, now);

function planDue(plan, ym) {
  if (ym < plan.startMonth || (plan.endMonth && ym > plan.endMonth)) return false;
  const gap = (+ym.slice(5, 7) - +plan.startMonth.slice(5, 7) + 12) % 12;
  if (plan.cycle === "once") return ym === plan.startMonth;
  if (plan.cycle === "quarterly") return gap % 3 === 0;
  if (plan.cycle === "yearly") return gap === 0;
  return true;
}

/**
 * What a month expects: the rules' dates still to come + plan items. A past month expects nothing.
 * A plan item written to the ledger under the same title counts as done that month, not twice.
 */
export function monthExpected(ledger, ym, today) {
  const empty = { items: [], expense: 0, income: 0 };
  const current = today.slice(0, 7);
  if (ym < current) return empty;
  const [year, month] = ym.split("-").map(Number);
  const last = `${ym}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
  const from = ym === current ? addDays(today, 1) : `${ym}-01`;
  const recorded = new Set(ledger.entries.filter((e) => alive(e) && e.entryDate.startsWith(ym)).map((e) => e.title.toLocaleLowerCase("tr")));
  const pick = ({ id, title, amount, direction, category }, source, date) => ({ id, source, title, amount, direction, category, date });
  const items = [
    ...ledger.rules.filter((r) => alive(r) && r.isActive).flatMap((r) =>
      occurrences(r, r.startDate > from ? r.startDate : from, last).map((date) => pick(r, "kural", date))),
    ...(ledger.plans ?? []).filter((p) => alive(p) && planDue(p, ym) && !recorded.has(p.title.toLocaleLowerCase("tr")))
      .map((p) => pick(p, "plan", null)),
  ];
  const total = (direction) => items.filter((i) => i.direction === direction && !NON_OPERATING.has(i.category)).reduce((t, i) => t + i.amount, 0);
  return { items, expense: total("out"), income: total("in") };
}

/**
 * 12 months (four quarters) from the start of this quarter, the data of the financial table and the chart. `lines` is per category.
 * Actual: paid entries. Expected: unpaid entries + the rules' future dates + plan. Non-operating categories stay out.
 */
export function forecast(ledger, today) {
  const year = +today.slice(0, 4), quarterMonth = Math.floor((+today.slice(5, 7) - 1) / 3) * 3;
  const counted = ledger.entries.filter((e) => alive(e) && !NON_OPERATING.has(e.category));
  return Array.from({ length: 12 }, (_, i) => {
    const y = year + Math.floor((quarterMonth + i) / 12), m = (quarterMonth + i) % 12 + 1;
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    const lines = new Map();
    const add = ({ direction, category }, field, amount) => {
      const key = `${direction}|${category}`;
      if (!lines.has(key)) lines.set(key, { direction, category, actual: 0, expected: 0 });
      lines.get(key)[field] += amount;
    };
    for (const e of counted) if (e.entryDate.startsWith(ym)) add(e, e.status === "paid" ? "actual" : "expected", e.amount);
    for (const item of monthExpected(ledger, ym, today).items) if (!NON_OPERATING.has(item.category)) add(item, "expected", item.amount);
    const list = [...lines.values()];
    const total = (direction, field) => list.filter((l) => l.direction === direction).reduce((t, l) => t + l[field], 0);
    return {
      ym,
      lines: list,
      expense: total("out", "actual"),
      income: total("in", "actual"),
      expectedExpense: total("out", "expected"),
      expectedIncome: total("in", "expected"),
    };
  });
}

const newestFirst = (a, b) => b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt);

export function overview(ledger, { from, to, year }, today) {
  const entries = ledger.entries.filter(alive);
  const counted = (e) => e.status === "paid" && !NON_OPERATING.has(e.category);
  const sum = (list, direction) => list.filter((e) => e.direction === direction).reduce((t, e) => t + e.amount, 0);
  const period = entries.filter((e) => e.entryDate >= from && e.entryDate <= to);
  const income = sum(period.filter(counted), "in");
  const expense = sum(period.filter(counted), "out");
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const prefix = `${year}-${String(i + 1).padStart(2, "0")}`;
    const list = entries.filter((e) => e.entryDate.startsWith(prefix) && counted(e));
    return { month: i + 1, income: sum(list, "in"), expense: sum(list, "out") };
  });
  const rules = ledger.rules.filter(alive);
  const upcomingFrom = addDays(today, 1), upcomingTo = addDays(today, 30);
  const upcoming = rules.filter((r) => r.isActive)
    .flatMap((r) => occurrences(r, upcomingFrom, upcomingTo).map((dueDate) => ({ ruleId: r.id, dueDate, title: r.title, amount: r.amount, direction: r.direction })))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    sync: { connected: false, lastImport: ledger.importedFrom ?? null },
    summary: { income, expense, profit: income - expense },
    entries: period.sort(newestFirst),
    pending: entries.filter((e) => e.status === "pending").sort(newestFirst),
    monthly,
    rules,
    upcoming,
    plans: (ledger.plans ?? []).filter(alive).sort((a, b) => a.startMonth.localeCompare(b.startMonth) || b.amount - a.amount),
    forecast: forecast(ledger, today),
    expected: monthExpected(ledger, from.slice(0, 7), today),
  };
}
