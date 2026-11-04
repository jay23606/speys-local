// Advanced SQL: the lessons after the basics, on the same neutral practice database (lessons.js).
// Same rules as the basics: one concept per lesson, a visual, an example for everything the lesson
// mentions, a task you write yourself. A course Claude writes for a repo can rewrite these too.

const L = (o) => o;

export const advanced = [
  L({
    id: "subquery",
    focus: ["where"],
    title: { en: "Subquery: IN (SELECT …)", tr: "Alt sorgu: IN (SELECT …)" },
    explain: {
      en: "A query can hold another query. In `WHERE x IN (SELECT …)` the inner query makes a list and the outer one checks against it. Read it from the inside out: run the inner query in your head first. An inner query that returns one value can stand where a value goes: `rating > (SELECT AVG(rating) FROM films)`.",
      tr: "Bir sorgunun içine başka bir sorgu yazılabilir. `WHERE x IN (SELECT …)` içindeki sorgu bir liste üretir, dıştaki o listeye bakar. İçeriden dışarı oku: önce iç sorguyu kafanda çalıştır. Tek değer döndüren bir iç sorgu, değer yazılan her yere gelebilir: `rating > (SELECT AVG(rating) FROM films)`.",
    },
    examples: [
      { sql: `SELECT id
FROM places
WHERE district = 'Kadıköy';`, note: { en: "The inner query alone: a one-column list of ids.", tr: "İç sorgu tek başına: tek sütunluk bir id listesi." } },
      { sql: `SELECT title
FROM deals
WHERE place_id IN (
  SELECT id
  FROM places
  WHERE district = 'Kadıköy'
);`, note: { en: "The outer query keeps the deals whose place_id is in that list.", tr: "Dıştaki sorgu place_id'si o listede olan kayıtları bırakır." } },
      { sql: `SELECT title, rating
FROM films
WHERE rating > (
  SELECT AVG(rating)
  FROM films
);`, note: { en: "An inner query with one value: films rated above the average.", tr: "Tek değer döndüren iç sorgu: puanı ortalamanın üstündeki filmler." } },
    ],
    visual: { kind: "filter", source: "SELECT title, place_id, place_id IN (SELECT id FROM places WHERE category = 'kafe') AS _keep FROM deals", note: { en: "place_id IN (SELECT id FROM places WHERE category = 'kafe')", tr: "place_id IN (SELECT id FROM places WHERE category = 'kafe')" } },
    task: { en: "Titles of the deals opened for cafés ('kafe').", tr: "Kafeler ('kafe') için açılmış kayıtların başlıkları." },
    hint: { en: "Inner query: the ids of the cafés in places.", tr: "İç sorgu: places tablosundaki kafelerin id'leri." },
    solution: `SELECT title
FROM deals
WHERE place_id IN (
  SELECT id
  FROM places
  WHERE category = 'kafe'
);`,
  }),
  L({
    id: "exists",
    topic: "exists",
    focus: ["where"],
    title: { en: "EXISTS: is there one?", tr: "EXISTS: var mı?" },
    explain: {
      en: "`EXISTS (subquery)` is true when the subquery finds at least one row. The inner query looks at the outer row (`f.user_id = u.id`): for every user it asks \"does this one have a film?\". `NOT EXISTS` finds the ones that have none. What the inner query selects does not matter; people write `SELECT 1`.",
      tr: "`EXISTS (alt sorgu)` alt sorgu en az bir satır bulursa doğrudur. İç sorgu dıştaki satıra bakar (`f.user_id = u.id`): her kullanıcı için \"bunun filmi var mı?\" diye sorar. `NOT EXISTS` hiç olmayanları bulur. İç sorguda ne seçtiğin önemsiz; genelde `SELECT 1` yazılır.",
    },
    examples: [
      { sql: `SELECT username
FROM users u
WHERE EXISTS (
  SELECT 1
  FROM films f
  WHERE f.user_id = u.id
);`, note: { en: "Users who watched at least one film.", tr: "En az bir film izlemiş kullanıcılar." } },
      { sql: `SELECT username
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM films f
  WHERE f.user_id = u.id
);`, note: { en: "NOT EXISTS: users with no film at all. The same question LEFT JOIN … IS NULL answers.", tr: "NOT EXISTS: hiç filmi olmayanlar. LEFT JOIN … IS NULL'un cevapladığı sorunun aynısı." } },
    ],
    visual: { kind: "filter", source: "SELECT u.username, EXISTS (SELECT 1 FROM films f WHERE f.user_id = u.id) AS _keep FROM users u", note: { en: "EXISTS (SELECT 1 FROM films f WHERE f.user_id = u.id)", tr: "EXISTS (SELECT 1 FROM films f WHERE f.user_id = u.id)" } },
    task: { en: "Titles of the deals that have at least one activity.", tr: "En az bir görüşmesi olan kayıtların başlıkları." },
    hint: { en: "EXISTS (SELECT 1 FROM activities a WHERE a.deal_id = d.id)", tr: "EXISTS (SELECT 1 FROM activities a WHERE a.deal_id = d.id)" },
    solution: `SELECT d.title
FROM deals d
WHERE EXISTS (
  SELECT 1
  FROM activities a
  WHERE a.deal_id = d.id
);`,
  }),
  L({
    id: "cte",
    topic: "cte",
    focus: [],
    title: { en: "WITH: name a step", tr: "WITH: ara sonuca ad ver" },
    explain: {
      en: "`WITH name AS (query)` gives a step its own name; after it you use that name like a table. A long query becomes a list of steps you can read top to bottom: first build the in-between result, then select from it. More steps are added with a comma.",
      tr: "`WITH ad AS (sorgu)` bir ara sonuca ad verir; sonra o adı tablo gibi kullanırsın. Uzun bir sorgu yukarıdan aşağı okunan adımlara döner: önce ara sonucu kur, sonra ondan seç. Başka adımlar virgülle eklenir.",
    },
    examples: [
      { sql: `WITH counts AS (
  SELECT user_id, COUNT(*) AS n
  FROM films
  GROUP BY user_id
)
SELECT *
FROM counts;`, note: { en: "The step on its own: films per user.", tr: "Ara sonucun kendisi: kullanıcı başına film sayısı." } },
      { sql: `WITH counts AS (
  SELECT user_id, COUNT(*) AS n
  FROM films
  GROUP BY user_id
)
SELECT u.username, c.n
FROM counts c
JOIN users u ON u.id = c.user_id
WHERE c.n >= 2;`, note: { en: "Then join it to users like any table.", tr: "Sonra onu her tablo gibi users ile birleştir." } },
    ],
    visual: { kind: "group", source: "SELECT user_id, title FROM films ORDER BY user_id", key: "user_id", result: "SELECT user_id, COUNT(*) AS n FROM films GROUP BY user_id", note: { en: "WITH counts AS (…)", tr: "WITH counts AS (…)" } },
    task: { en: "Users whose average rating is above 8: their name and that average.", tr: "Ortalama puanı 8'in üstünde olan kullanıcıların adı ve ortalama puanı." },
    hint: { en: "First a step with AVG(rating) per user_id, then join it to users.", tr: "Önce user_id başına AVG(rating) veren bir adım, sonra onu users ile birleştir." },
    solution: `WITH scores AS (
  SELECT user_id, AVG(rating) AS avg_rating
  FROM films
  GROUP BY user_id
)
SELECT u.username, s.avg_rating
FROM scores s
JOIN users u ON u.id = s.user_id
WHERE s.avg_rating > 8;`,
  }),
  L({
    id: "window",
    topic: "window",
    focus: [],
    title: { en: "Window functions: OVER", tr: "Pencere fonksiyonları: OVER" },
    explain: {
      en: "`OVER (…)` runs a count or a numbering without merging rows: every row stays, a value comes next to it. `PARTITION BY` splits the rows into groups (like GROUP BY, but nothing disappears) and the `ORDER BY` inside sets the order. `ROW_NUMBER()` counts 1, 2, 3… within each group.",
      tr: "`OVER (…)` sayma ya da numaralamayı satırları birleştirmeden yapar: her satır yerinde kalır, yanına bir değer gelir. `PARTITION BY` satırları gruplara ayırır (GROUP BY gibi ama hiçbir satır kaybolmaz), içerideki `ORDER BY` sırayı verir. `ROW_NUMBER()` her grubun içinde 1, 2, 3… diye sayar.",
    },
    examples: [
      { sql: `SELECT user_id, title,
  COUNT(*) OVER (PARTITION BY user_id) AS films_of_user
FROM films;`, note: { en: "Unlike GROUP BY all 12 rows stay, each with its user's film count.", tr: "GROUP BY'dan farkı: 12 satırın hepsi kalır, her birinin yanında kullanıcısının film sayısı." } },
      { sql: `SELECT user_id, title, watched_on,
  ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY watched_on
  ) AS nth
FROM films;`, note: { en: "Each user's films numbered by the date they were watched.", tr: "Her kullanıcının filmleri izlendiği tarihe göre 1, 2, 3…" } },
      { sql: `SELECT title, rating,
  RANK() OVER (ORDER BY rating DESC) AS place
FROM films
WHERE rating IS NOT NULL;`, note: { en: "Without PARTITION BY the whole table is one group. RANK gives ties the same place.", tr: "PARTITION BY yoksa bütün tablo tek grup. RANK eşit olanlara aynı sırayı verir." } },
    ],
    visual: {
      kind: "transform", column: 3, key: "user_id",
      source: "SELECT user_id, title, watched_on, NULL AS nth FROM films ORDER BY user_id, watched_on",
      result: "SELECT user_id, title, watched_on, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY watched_on) AS nth FROM films ORDER BY user_id, watched_on",
    },
    task: { en: "For every film: the user_id, the title and which film of that user it was, by watch date.", tr: "Her film için: izleyenin id'si, başlığı ve izleme tarihine göre o kullanıcının kaçıncı filmi olduğu." },
    hint: { en: "ROW_NUMBER() OVER (PARTITION BY … ORDER BY …)", tr: "ROW_NUMBER() OVER (PARTITION BY … ORDER BY …)" },
    solution: `SELECT user_id, title,
  ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY watched_on
  ) AS nth
FROM films;`,
  }),
  L({
    id: "filter-agg",
    focus: ["group"],
    title: { en: "Counting with a condition: FILTER", tr: "Koşullu sayma: FILTER" },
    explain: {
      en: "To count only some rows of a group, not all: `COUNT(*) FILTER (WHERE condition)`. The older way that works everywhere is `SUM(CASE WHEN condition THEN 1 ELSE 0 END)`: a matching row adds 1, the others 0. One query can then give several counts side by side.",
      tr: "Bir grupta hepsini değil yalnızca koşulu tutanları saymak için: `COUNT(*) FILTER (WHERE koşul)`. Her veritabanında çalışan eski yolu `SUM(CASE WHEN koşul THEN 1 ELSE 0 END)`: tutan satır 1 ekler, tutmayan 0. Böylece tek sorguda birkaç sayı yan yana çıkar.",
    },
    examples: [
      { sql: `SELECT deal_id,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE kind = 'visit') AS visits
FROM activities
GROUP BY deal_id;`, note: { en: "For each deal: all activities, and how many of them were visits.", tr: "Her kayıt için: bütün görüşmeler ve kaçının ziyaret olduğu." } },
      { sql: `SELECT deal_id,
  COUNT(*) AS total,
  SUM(CASE WHEN kind = 'visit' THEN 1 ELSE 0 END) AS visits
FROM activities
GROUP BY deal_id;`, note: { en: "The same answer with CASE.", tr: "Aynı cevap, CASE ile." } },
    ],
    visual: { kind: "group", source: "SELECT deal_id, kind FROM activities ORDER BY deal_id", key: "deal_id", result: "SELECT deal_id, COUNT(*) AS total, COUNT(*) FILTER (WHERE kind = 'visit') AS visits FROM activities GROUP BY deal_id", note: { en: "FILTER (WHERE kind = 'visit')", tr: "FILTER (WHERE kind = 'visit')" } },
    task: { en: "For each district: how many places, and how many of them are cafés ('kafe').", tr: "Her ilçe için: kaç mekan var ve kaçı kafe ('kafe')." },
    hint: { en: "GROUP BY district, then COUNT(*) and COUNT(*) FILTER (WHERE …)", tr: "GROUP BY district, sonra COUNT(*) ve COUNT(*) FILTER (WHERE …)" },
    solution: `SELECT district,
  COUNT(*) AS places,
  COUNT(*) FILTER (WHERE category = 'kafe') AS cafes
FROM places
GROUP BY district;`,
  }),
];
