// Common SQL slips, found in what you wrote before (or instead of) the database's own error.
// Each one becomes a note in your notebook: what you wrote, how it's written, and why.
// `find(sql)` returns the offending line and its corrected form, or null.

const lineOf = (sql, index) => sql.slice(0, index).split("\n").length - 1;

function lineRule(re, fix) {
  return (sql) => {
    const lines = sql.split("\n");
    for (let i = 0; i < lines.length; i++) {
      // ignore the part of a line after a -- comment
      const code = lines[i].replace(/--.*$/, "");
      if (re.test(code)) return { line: i, wrote: lines[i].trim(), fixed: fix(lines[i]).trim() };
    }
    return null;
  };
}

export const mistakes = [
  {
    id: "double-quote-text",
    title: { en: "Text goes in single quotes", tr: "Metin tek tırnakla yazılır" },
    explain: {
      en: "'Ankara' is text; \"Ankara\" is the name of a column or table. Postgres looks for a column called Ankara and fails.",
      tr: "'Ankara' bir metin; \"Ankara\" ise bir sütunun ya da tablonun adı. Postgres Ankara adında bir sütun arar ve hata verir.",
    },
    find: lineRule(/(=|<>|!=|\bIN\s*\(|,|\bLIKE)\s*"[^"]*"/i, (l) => l.replace(/(=|<>|!=|\bIN\s*\(|,|\bLIKE)(\s*)"([^"]*)"/gi, "$1$2'$3'")),
  },
  {
    id: "equals-null",
    title: { en: "NULL is checked with IS NULL", tr: "NULL, IS NULL ile sorulur" },
    explain: {
      en: "NULL means unknown, so `= NULL` is never true: the query runs but returns nothing. Write `IS NULL` / `IS NOT NULL`.",
      tr: "NULL bilinmiyor demek; `= NULL` hiçbir zaman doğru olmaz: sorgu çalışır ama hiçbir şey getirmez. `IS NULL` / `IS NOT NULL` yazılır.",
    },
    find: lineRule(/(!=|<>|=)\s*NULL\b/i, (l) => l.replace(/(!=|<>)\s*NULL\b/gi, "IS NOT NULL").replace(/=\s*NULL\b/gi, "IS NULL")),
  },
  {
    id: "aggregate-in-where",
    title: { en: "Conditions on COUNT/SUM go in HAVING", tr: "COUNT/SUM üzerindeki koşul HAVING'e yazılır" },
    explain: {
      en: "WHERE runs before grouping, when there is no count yet. Group with GROUP BY, then filter the groups with HAVING.",
      tr: "WHERE gruplamadan önce çalışır; o anda henüz sayı yok. GROUP BY ile grupla, grupları HAVING ile süz.",
    },
    find: (sql) => {
      const m = /\bWHERE\b(?:(?!\bSELECT\b)[\s\S])*?\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.exec(sql);
      if (!m) return null;
      const i = lineOf(sql, m.index + m[0].length - 1);
      const line = sql.split("\n")[i];
      return { line: i, wrote: line.trim(), fixed: line.replace(/\bWHERE\b/i, "HAVING").trim() };
    },
  },
  {
    id: "limit-before-order",
    title: { en: "ORDER BY comes before LIMIT", tr: "ORDER BY, LIMIT'ten önce gelir" },
    explain: {
      en: "The order of parts is fixed: SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT. Sort first, then cut.",
      tr: "Bölümlerin sırası sabit: SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT. Önce sıralanır, sonra kesilir.",
    },
    find: (sql) => {
      const m = /\bLIMIT\s+\d+\s*\n?\s*ORDER\s+BY\b/i.exec(sql);
      return m ? { line: lineOf(sql, m.index), wrote: m[0].replace(/\s+/g, " ").trim(), fixed: "ORDER BY … LIMIT …" } : null;
    },
  },
  {
    id: "comma-before-from",
    title: { en: "No comma after the last column", tr: "Son sütundan sonra virgül olmaz" },
    explain: {
      en: "Commas go between columns. A comma right before FROM makes the database expect one more column.",
      tr: "Virgül sütunların arasına konur. FROM'dan hemen önceki virgül veritabanını bir sütun daha beklemeye iter.",
    },
    find: (sql) => {
      const m = /,\s*\n?\s*FROM\b/i.exec(sql);
      if (!m) return null;
      const i = lineOf(sql, m.index);
      const line = sql.split("\n")[i];
      return { line: i, wrote: line.trim(), fixed: line.replace(/,\s*$/, "").replace(/,\s*FROM/i, " FROM").trim() };
    },
  },
  {
    id: "double-equals",
    title: { en: "Equality is a single =", tr: "Eşitlik tek = ile yazılır" },
    explain: {
      en: "SQL compares with one `=`; `==` is from programming languages and Postgres rejects it.",
      tr: "SQL tek `=` ile karşılaştırır; `==` programlama dillerinden gelir ve Postgres kabul etmez.",
    },
    find: lineRule(/==/, (l) => l.replace(/==/g, "=")),
  },
];

/** Every slip in `sql`, in the order above. */
export function findMistakes(sql) {
  return mistakes.map((m) => ({ id: m.id, hit: m.find(sql) })).filter((x) => x.hit);
}
