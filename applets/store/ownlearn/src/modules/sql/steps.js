// How to write a query: the order to think in, the same for every lesson. The answer of a query is
// always rows, so you start from the row you want to see and work towards where it comes from.
// Shown on the right of every lesson (this lesson's steps lit), and the hint walks through the
// steps the task needs, as questions, before it gives anything away.
//
// `clause` finds the step in a solution, so a course Claude writes gets its hint steps for free.

export const writing = {
  intro: {
    en: "The answer to a query is always rows: a small table. Before you write, picture one row of the answer, then follow these steps in order.",
    tr: "Bir sorgunun cevabı her zaman satırlardır: küçük bir tablo. Yazmadan önce cevabın tek bir satırını gözünün önüne getir, sonra bu adımları sırayla izle.",
  },
  steps: [
    {
      id: "select", clause: /\bSELECT\b/i, kw: "SELECT",
      q: { en: "What do you want to see in a row of the answer?", tr: "Cevabın bir satırında ne görmek istiyorsun?" },
      how: { en: "The columns the task names, or a calculation (COUNT, a CASE…), go after SELECT.", tr: "Görevin saydığı sütunlar ya da bir hesap (COUNT, CASE…) SELECT'ten sonra yazılır." },
    },
    {
      id: "from", clause: /\bFROM\b/i, kw: "FROM",
      q: { en: "Which table holds that?", tr: "Bu bilgiler hangi tabloda?" },
      how: { en: "Find the columns in the tables below and write that table after FROM.", tr: "Sütunları aşağıdaki tablolarda bul, o tabloyu FROM'dan sonra yaz." },
    },
    {
      id: "join", clause: /\bJOIN\b/i, kw: "JOIN … ON",
      q: { en: "Is it spread over two tables?", tr: "Bilgiler iki tabloya mı dağılmış?" },
      how: { en: "Bring in the second table with JOIN; ON says which columns match (an id and the column that points to it).", tr: "İkinci tabloyu JOIN ile ekle; ON hangi sütunların eşleştiğini söyler (bir id ve ona işaret eden sütun)." },
    },
    {
      id: "where", clause: /\bWHERE\b/i, kw: "WHERE",
      q: { en: "Every row, or only some?", tr: "Bütün satırlar mı lazım, yalnızca bazıları mı?" },
      how: { en: "The condition a row must meet goes after WHERE.", tr: "Bir satırın kalması için gereken koşul WHERE'den sonra yazılır." },
    },
    {
      id: "group", clause: /\bGROUP\s+BY\b/i, kw: "GROUP BY",
      q: { en: "Is a row of the answer one record, or a group of them?", tr: "Cevabın bir satırı tek bir kaydı mı anlatıyor, bir grubu mu?" },
      how: { en: "If it is a group (per city, per stage…), the column it is grouped by goes after GROUP BY.", tr: "Grupsa (şehir başına, aşama başına…), gruplandığı sütun GROUP BY'dan sonra yazılır." },
    },
    {
      id: "having", clause: /\bHAVING\b/i, kw: "HAVING",
      q: { en: "Should only some groups stay?", tr: "Gruplardan yalnızca bazıları mı kalsın?" },
      how: { en: "A condition on the group (its COUNT, its AVG…) goes after HAVING.", tr: "Grubun kendisi üzerindeki koşul (COUNT'u, AVG'si…) HAVING'den sonra yazılır." },
    },
    {
      id: "order", clause: /\bORDER\s+BY\b/i, kw: "ORDER BY",
      q: { en: "In what order?", tr: "Hangi sırayla?" },
      how: { en: "The column to sort by after ORDER BY; DESC for largest or newest first.", tr: "Sıralanacak sütun ORDER BY'dan sonra; büyükten ya da yeniden başlamak için DESC." },
    },
    {
      id: "limit", clause: /\bLIMIT\b/i, kw: "LIMIT",
      q: { en: "How many rows?", tr: "Kaç satır?" },
      how: { en: "The number goes after LIMIT, at the very end.", tr: "Sayı LIMIT'ten sonra, en sonda." },
    },
  ],
};

/** The steps a query uses, in writing order (ids). */
export const stepsOf = (sql) => writing.steps.filter((s) => s.clause.test(String(sql || ""))).map((s) => s.id);

/** A query split into its lines, each with the step it answers (a continuation line keeps the step above). */
export function annotate(sql) {
  let step = null;
  return String(sql || "").split("\n").map((text) => {
    const hit = writing.steps.find((s) => new RegExp("^\\s*(?:LEFT\\s+|INNER\\s+)?" + s.clause.source.replace(/\\b/g, ""), "i").test(text));
    if (hit) step = hit.id;
    return { text, step: hit ? step : null, cont: !hit };
  });
}
