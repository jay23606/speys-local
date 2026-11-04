// SQL lessons, from the very first SELECT: the general layer, the same for everyone. You write
// every query yourself; it runs on a small practice database and is checked against the expected
// result. The data below is a neutral default (made-up names). On a user's machine Claude can
// replace it with a practice copy of their own tables and rewrite tasks, examples and visuals on
// them (see ../../course.js and docs/course.md); explanations and the order stay as they are here. The sandbox is SQLite in memory: the basics are the same SQL as
// Postgres, and nothing touches a real database.
//
// `visual` (every lesson has one): a before → after picture of what the concept does, drawn from
// the sandbox rows: filter, sort, group, aggregate, join (outer for LEFT JOIN), transform, select.
// `topic` links a lesson to a topic in ../topics/sql.js, so the lesson can show where your own
// code uses it. `ordered`: row order must match too (lessons about ORDER BY). `focus`: the writing
// steps (./steps.js) this lesson is about, lit on the page.

export const schema = `
CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, city TEXT, created_at TEXT NOT NULL);
CREATE TABLE films (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL,
  rating INTEGER, watched_on TEXT NOT NULL);
CREATE TABLE places (id INTEGER PRIMARY KEY, name TEXT NOT NULL, district TEXT, category TEXT);
CREATE TABLE deals (id INTEGER PRIMARY KEY, place_id INTEGER REFERENCES places(id), title TEXT NOT NULL,
  stage TEXT NOT NULL, next_action_at TEXT);
CREATE TABLE activities (id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL REFERENCES deals(id), kind TEXT NOT NULL,
  occurred_on TEXT NOT NULL, note TEXT);

INSERT INTO users VALUES
 (1,'ali','Bursa','2026-01-12'),(2,'ayse','İstanbul','2026-02-03'),(3,'mert','Bursa','2026-03-21'),
 (4,'zeynep','Ankara','2026-05-09'),(5,'can','İstanbul','2026-06-30'),(6,'elif',NULL,'2026-08-14'),
 (7,'burak','Bursa','2026-09-02'),(8,'deniz','İzmir','2026-10-01');
INSERT INTO films VALUES
 (1,1,'Past Lives',9,'2026-09-01'),(2,1,'Aftersun',8,'2026-09-04'),(3,1,'Perfect Days',9,'2026-09-10'),
 (4,2,'Dune: Part Two',7,'2026-08-20'),(5,2,'Past Lives',8,'2026-09-15'),(6,3,'Kış Uykusu',10,'2026-07-01'),
 (7,3,'Aftersun',6,'2026-07-12'),(8,4,'Anatomy of a Fall',8,'2026-09-22'),(9,5,'Dune: Part Two',9,'2026-10-02'),
 (10,1,'Kuru Otlar Üstüne',8,'2026-10-05'),(11,3,'Perfect Days',7,'2026-10-07'),(12,8,'Past Lives',NULL,'2026-10-09');
INSERT INTO places VALUES
 (1,'Mavi Kahve','Kadıköy','kafe'),(2,'Kahve Durağı','Beşiktaş','kafe'),(3,'Köşe Döner','Kadıköy','restoran'),
 (4,'Tezgah Burger','Kadıköy','restoran'),(5,'Kitap Kahve','Beşiktaş','kafe'),(6,'Sahil Balık','Kadıköy','restoran'),
 (7,'Okey Salonu','Üsküdar','oyun');
INSERT INTO deals VALUES
 (1,1,'Mavi Kahve QR menü','contacted','2026-10-24'),(2,2,'Kahve Durağı QR menü','won',NULL),
 (3,3,'Köşe Döner QR menü','new','2026-10-22'),(4,4,'Tezgah Burger QR menü','won',NULL),
 (5,5,'Kitap Kahve QR menü','lost',NULL),(6,6,'Sahil Balık QR menü','contacted',NULL),(7,NULL,'Okul sitesi','won',NULL),
 (8,NULL,'Oyun stüdyosu sitesi','proposal','2026-10-24');
INSERT INTO activities VALUES
 (1,1,'visit','2026-09-11','Menüyü gösterdim, ilgilendi'),(2,1,'call','2026-10-03',NULL),(3,2,'visit','2026-09-08','Anlaştık'),
 (4,4,'visit','2026-09-09',NULL),(5,7,'meeting','2026-10-19','Arama sonuçlarını konuştuk'),(6,8,'email','2026-10-17','Teklif gitti');
`;

const L = (o) => o;

export const lessons = [
  // `read`: a lesson to read, without a task. It shows one query line by line, each line with why it
  // is there (`anatomy`), and the order to write a query in (./steps.js).
  L({
    id: "how",
    read: true,
    focus: [],
    title: { en: "How a query is written", tr: "Sorgu nasıl yazılır" },
    explain: {
      en: "The answer to a query is always rows: a small table. So you start from the answer: what should one row of it show? Then you say where that comes from, which rows you need, and in what order. Every line of a query answers one of these questions, always in the same order.",
      tr: "Bir sorgunun cevabı her zaman satırlardır: küçük bir tablo. Bu yüzden cevaptan başlarsın: cevabın bir satırında ne olsun? Sonra bunun nereden geleceğini, hangi satırların lazım olduğunu ve hangi sırayla görmek istediğini söylersin. Sorgunun her satırı bu sorulardan birine cevaptır, sıra hep aynıdır.",
    },
    anatomy: {
      goal: { en: "Cafés in Kadıköy or Beşiktaş: their name and district, sorted by district.", tr: "Kadıköy ya da Beşiktaş'taki kafeler: adı ve ilçesi, ilçeye göre sıralı." },
      lines: [
        { sql: "SELECT name, district", why: { en: "We want to see a place's name and district in each row: the `name` and `district` columns.", tr: "Cevabın her satırında mekanın adını ve ilçesini görmek istiyoruz: `name` ve `district` sütunları." } },
        { sql: "FROM places", why: { en: "`name` and `district` are in the `places` table.", tr: "`name` ve `district` sütunları `places` tablosunda." } },
        { sql: "WHERE category = 'kafe'", why: { en: "Not every place, only the cafés: rows whose `category` is 'kafe'.", tr: "Bütün mekanlar değil, yalnızca kafeler: `category` değeri 'kafe' olan satırlar." } },
        { sql: "  AND district IN ('Kadıköy', 'Beşiktaş')", why: { en: "And of those, only the ones in Kadıköy or Beşiktaş.", tr: "Onlardan da yalnızca Kadıköy ya da Beşiktaş'takiler." } },
        { sql: "ORDER BY district;", why: { en: "Sorted by `district`, A to Z.", tr: "`district` sütununa göre A'dan Z'ye." } },
      ],
    },
  }),
  L({
    id: "select",
    focus: ["select", "from"],
    title: { en: "SELECT: pick columns", tr: "SELECT: sütun seç" },
    explain: {
      en: "Every query starts here. `SELECT` lists the columns you want, `FROM` names the table. `SELECT *` means every column. Put each part on its own line: it reads like a sentence and grows without getting messy.",
      tr: "Her sorgu buradan başlar. `SELECT` istediğin sütunları sayar, `FROM` tabloyu söyler. `SELECT *` bütün sütunlar demek. Her bölümü ayrı satıra yaz: cümle gibi okunur, büyüdükçe karışmaz.",
    },
    example: `SELECT title, rating
FROM films;`,
    visual: { kind: "select", source: "SELECT * FROM users", pick: ["username", "city"] },
    task: { en: "Every user's name and city.", tr: "Her kullanıcının adı ve şehri." },
    hint: { en: "Two columns from the users table.", tr: "users tablosundan iki sütun." },
    solution: `SELECT username, city
FROM users;`,
  }),
  L({
    id: "where",
    focus: ["where"],
    title: { en: "WHERE: filter rows", tr: "WHERE: satırları süz" },
    explain: {
      en: "`WHERE` keeps only rows where the condition is true. Text goes in single quotes: `city = 'Ankara'`. Double quotes mean a column or table name in Postgres, not text.",
      tr: "`WHERE` yalnızca koşulun doğru olduğu satırları bırakır. Metin tek tırnak içinde yazılır: `city = 'Ankara'`. Çift tırnak (\"…\") Postgres'te metin değil, sütun ya da tablo adı demek.",
    },
    example: `SELECT title
FROM films
WHERE rating = 9;`,
    visual: { kind: "filter", source: "SELECT username, city, city = 'Bursa' AS _keep FROM users", note: { en: "WHERE city = 'Bursa'", tr: "WHERE city = 'Bursa'" } },
    task: { en: "Names of the users in Bursa.", tr: "Bursa'daki kullanıcıların adları." },
    hint: { en: "WHERE city = '…'", tr: "WHERE city = '…'" },
    solution: `SELECT username
FROM users
WHERE city = 'Bursa';`,
  }),
  L({
    id: "order-limit",
    focus: ["order", "limit"],
    ordered: true,
    title: { en: "ORDER BY and LIMIT", tr: "ORDER BY ve LIMIT" },
    explain: {
      en: "`ORDER BY column` sorts (add `DESC` for largest first). `LIMIT n` keeps the first n rows. Without ORDER BY the order is not guaranteed.",
      tr: "`ORDER BY sütun` sıralar (büyükten küçüğe için `DESC`). `LIMIT n` ilk n satırı bırakır. ORDER BY yoksa sıra garanti değildir.",
    },
    examples: [
      { sql: `SELECT title, rating
FROM films
ORDER BY rating;`, note: { en: "Smallest first (ASC is the default).", tr: "Küçükten büyüğe (ASC varsayılan)." } },
      { sql: `SELECT title, rating
FROM films
ORDER BY rating DESC
LIMIT 2;`, note: { en: "DESC: largest first. LIMIT 2: keep the top two.", tr: "DESC: büyükten küçüğe. LIMIT 2: ilk ikisini bırak." } },
    ],
    visual: { kind: "sort", source: "SELECT title, rating FROM films WHERE rating IS NOT NULL", result: "SELECT title, rating FROM films WHERE rating IS NOT NULL ORDER BY rating DESC", limit: 2 },
    task: { en: "The 3 users who joined last, with the date they joined, newest first.", tr: "En son katılan 3 kullanıcı ve katıldıkları tarih, en yeniden eskiye." },
    hint: { en: "ORDER BY created_at DESC, then LIMIT.", tr: "ORDER BY created_at DESC, sonra LIMIT." },
    solution: `SELECT username, created_at
FROM users
ORDER BY created_at DESC
LIMIT 3;`,
  }),
  L({
    id: "in-and-or",
    focus: ["where"],
    title: { en: "AND, OR, IN", tr: "AND, OR, IN" },
    explain: {
      en: "Combine conditions with `AND` (both true) and `OR` (either). `x IN ('a', 'b')` is a short way to write `x = 'a' OR x = 'b'`.",
      tr: "Koşulları `AND` (ikisi de doğru) ve `OR` (biri doğru) ile birleştir. `x IN ('a', 'b')`, `x = 'a' OR x = 'b'` demenin kısa yolu.",
    },
    examples: [
      { sql: `SELECT title
FROM films
WHERE rating >= 8
  AND user_id = 1;`, note: { en: "AND: both must hold.", tr: "AND: ikisi de doğru olmalı." } },
      { sql: `SELECT username
FROM users
WHERE city = 'Ankara'
   OR city = 'İzmir';`, note: { en: "OR: either one is enough.", tr: "OR: biri yeterli." } },
      { sql: `SELECT username
FROM users
WHERE city IN ('Ankara', 'İzmir');`, note: { en: "IN: the same as the OR above, shorter.", tr: "IN: üstteki OR ile aynı, daha kısa." } },
    ],
    visual: { kind: "filter", source: "SELECT username, city, city IN ('Ankara', 'İzmir') AS _keep FROM users", note: { en: "WHERE city IN ('Ankara', 'İzmir')", tr: "WHERE city IN ('Ankara', 'İzmir')" } },
    task: { en: "Names of the cafés ('kafe') in Kadıköy or Beşiktaş.", tr: "Kadıköy ya da Beşiktaş'taki kafelerin ('kafe') adları." },
    hint: { en: "district IN (…) AND category = 'kafe'", tr: "district IN (…) AND category = 'kafe'" },
    solution: `SELECT name
FROM places
WHERE district IN ('Kadıköy', 'Beşiktaş')
  AND category = 'kafe';`,
  }),
  L({
    id: "null",
    focus: ["where"],
    title: { en: "NULL: the missing value", tr: "NULL: olmayan değer" },
    explain: {
      en: "NULL means unknown. `= NULL` never matches; use `IS NULL` / `IS NOT NULL`.",
      tr: "NULL bilinmiyor demek. `= NULL` hiçbir zaman tutmaz; `IS NULL` / `IS NOT NULL` kullanılır.",
    },
    examples: [
      { sql: `SELECT title
FROM films
WHERE rating IS NULL;`, note: { en: "Films without a rating.", tr: "Puanı olmayan filmler." } },
      { sql: `SELECT title
FROM films
WHERE rating = NULL;`, note: { en: "Runs, but returns nothing: = NULL is never true.", tr: "Çalışır ama hiçbir şey getirmez: = NULL hiçbir zaman doğru değildir." } },
    ],
    visual: { kind: "filter", source: "SELECT title, rating, rating IS NULL AS _keep FROM films", note: { en: "WHERE rating IS NULL", tr: "WHERE rating IS NULL" } },
    task: { en: "Names of the users whose city is unknown.", tr: "Şehri bilinmeyen kullanıcıların adları." },
    hint: { en: "city IS NULL", tr: "city IS NULL" },
    solution: `SELECT username
FROM users
WHERE city IS NULL;`,
  }),
  L({
    id: "count",
    focus: ["select"],
    title: { en: "COUNT and other aggregates", tr: "COUNT ve toplama fonksiyonları" },
    explain: {
      en: "Aggregates turn many rows into one value. `COUNT(*)` counts rows (the `*` means the whole row, not a column); `COUNT(column)` counts only the rows where that column is not NULL. `AVG`, `SUM`, `MIN`, `MAX` work on a column. Without GROUP BY you get one row for the whole table.",
      tr: "Toplama fonksiyonları birçok satırı tek değere indirir. `COUNT(*)` satır sayar (`*` burada sütun değil, satırın tamamı demek); `COUNT(sütun)` yalnızca o sütunu NULL olmayan satırları sayar. `AVG`, `SUM`, `MIN`, `MAX` bir sütun üzerinde çalışır. GROUP BY yoksa bütün tablo için tek satır döner.",
    },
    examples: [
      { sql: `SELECT COUNT(*)
FROM films;`, note: { en: "* here means \"the whole row\": how many rows are there? 12.", tr: "Buradaki * \"satırın tamamı\" demek: kaç satır var? 12." } },
      { sql: `SELECT COUNT(rating)
FROM films;`, note: { en: "A column inside: only rows where rating is not NULL. 11, one film has no rating.", tr: "İçine sütun yazınca yalnızca rating'i NULL olmayan satırlar sayılır. 11, bir filmin puanı yok." } },
      { sql: `SELECT AVG(rating), MIN(rating), MAX(rating)
FROM films;`, note: { en: "Average, smallest, largest. They skip NULLs too.", tr: "Ortalama, en küçük, en büyük. Bunlar da NULL'ları atlar." } },
      { sql: `SELECT SUM(rating)
FROM films
WHERE user_id = 1;`, note: { en: "SUM adds up; WHERE first narrows the rows.", tr: "SUM toplar; WHERE önce satırları daraltır." } },
    ],
    visual: { kind: "aggregate", source: "SELECT title, rating FROM films", column: "rating", result: "SELECT COUNT(*), COUNT(rating), MAX(rating) FROM films" },
    task: { en: "How many films did user 1 watch?", tr: "1 numaralı kullanıcı kaç film izlemiş?" },
    hint: { en: "COUNT(*) with WHERE user_id = 1", tr: "WHERE user_id = 1 ile COUNT(*)" },
    solution: `SELECT COUNT(*)
FROM films
WHERE user_id = 1;`,
  }),
  L({
    id: "group-by",
    focus: ["group"],
    topic: "group-by",
    title: { en: "GROUP BY", tr: "GROUP BY" },
    explain: {
      en: "`GROUP BY col` makes one row per value of col; aggregates then run per group.",
      tr: "`GROUP BY sütun` sütunun her değeri için bir satır yapar; toplama fonksiyonları her grup için ayrı çalışır.",
    },
    example: `SELECT title, COUNT(*)
FROM films
GROUP BY title;`,
    visual: { kind: "group", source: "SELECT title, rating FROM films ORDER BY title", key: "title", result: "SELECT title, COUNT(*) FROM films GROUP BY title" },
    task: { en: "How many users in each city?", tr: "Her şehirde kaç kullanıcı var?" },
    hint: { en: "GROUP BY city", tr: "GROUP BY city" },
    solution: `SELECT city, COUNT(*)
FROM users
GROUP BY city;`,
  }),
  L({
    id: "having",
    focus: ["having"],
    topic: "having",
    title: { en: "HAVING: filter groups", tr: "HAVING: grupları süz" },
    explain: {
      en: "`WHERE` filters rows before grouping, `HAVING` filters groups after. Conditions on COUNT/AVG go in HAVING.",
      tr: "`WHERE` gruplamadan önce satırları, `HAVING` gruplamadan sonra grupları süzer. COUNT/AVG üzerindeki koşul HAVING'e yazılır.",
    },
    example: `SELECT title, AVG(rating)
FROM films
GROUP BY title
HAVING COUNT(*) > 1;`,
    visual: { kind: "group", source: "SELECT title, rating FROM films ORDER BY title", key: "title", result: "SELECT title, COUNT(*), COUNT(*) > 1 AS _keep FROM films GROUP BY title", note: { en: "HAVING COUNT(*) > 1", tr: "HAVING COUNT(*) > 1" } },
    task: { en: "Users who watched more than 2 films, with how many they watched.", tr: "2'den fazla film izleyen kullanıcılar ve izledikleri film sayısı." },
    hint: { en: "GROUP BY user_id HAVING COUNT(*) > 2", tr: "GROUP BY user_id HAVING COUNT(*) > 2" },
    solution: `SELECT user_id, COUNT(*)
FROM films
GROUP BY user_id
HAVING COUNT(*) > 2;`,
  }),
  L({
    id: "join",
    focus: ["join"],
    topic: "left-join",
    title: { en: "JOIN: combine tables", tr: "JOIN: tabloları birleştir" },
    explain: {
      en: "`JOIN other ON a.x = b.y` puts matching rows side by side. Short names after the table (`films f`) keep it readable.",
      tr: "`JOIN tablo ON a.x = b.y` eşleşen satırları yan yana koyar. Tablonun yanındaki kısa ad (`films f`) okumayı kolaylaştırır.",
    },
    example: `SELECT d.title, p.district
FROM deals d
JOIN places p ON p.id = d.place_id;`,
    visual: { kind: "join", left: "SELECT id, title, place_id FROM deals", right: "SELECT id, name, district FROM places", leftKey: "place_id", rightKey: "id", result: "SELECT d.title, p.name, p.district FROM deals d JOIN places p ON p.id = d.place_id" },
    task: { en: "Every watched film with the name of the user who watched it.", tr: "İzlenen her film ve onu izleyen kullanıcının adı." },
    hint: { en: "films f JOIN users u ON u.id = f.user_id", tr: "films f JOIN users u ON u.id = f.user_id" },
    solution: `SELECT u.username, f.title
FROM films f
JOIN users u ON u.id = f.user_id;`,
  }),
  L({
    id: "left-join",
    focus: ["join"],
    topic: "left-join",
    title: { en: "LEFT JOIN: keep the unmatched", tr: "LEFT JOIN: eşi olmayanı da tut" },
    explain: {
      en: "`LEFT JOIN` keeps every row on the left even without a match; the right side is NULL then. `WHERE right.id IS NULL` finds the ones with no match.",
      tr: "`LEFT JOIN` soldaki her satırı eşi olmasa da tutar; o zaman sağ taraf NULL olur. `WHERE sag.id IS NULL` eşi olmayanları bulur.",
    },
    example: `SELECT u.username, f.title
FROM users u
LEFT JOIN films f ON f.user_id = u.id;`,
    visual: { kind: "join", left: "SELECT id, title FROM deals", right: "SELECT deal_id, kind, occurred_on FROM activities", leftKey: "id", rightKey: "deal_id", result: "SELECT d.title, a.kind, a.occurred_on FROM deals d LEFT JOIN activities a ON a.deal_id = d.id", outer: true },
    task: { en: "Titles of the deals that have no activity at all.", tr: "Hiç görüşmesi olmayan kayıtların başlıkları." },
    hint: { en: "deals d LEFT JOIN activities a ON a.deal_id = d.id WHERE a.id IS NULL", tr: "deals d LEFT JOIN activities a ON a.deal_id = d.id WHERE a.id IS NULL" },
    solution: `SELECT d.title
FROM deals d
LEFT JOIN activities a ON a.deal_id = d.id
WHERE a.id IS NULL;`,
  }),
  L({
    id: "coalesce",
    focus: ["select"],
    topic: "coalesce",
    title: { en: "COALESCE: a default for NULL", tr: "COALESCE: NULL'a varsayılan" },
    explain: {
      en: "`COALESCE(a, b)` returns a, or b when a is NULL.",
      tr: "`COALESCE(a, b)` a'yı döndürür; a NULL ise b'yi.",
    },
    example: `SELECT username, COALESCE(city, 'bilinmiyor')
FROM users;`,
    visual: { kind: "transform", source: "SELECT title, next_action_at FROM deals", result: "SELECT title, COALESCE(next_action_at, 'yok') FROM deals", column: 1 },
    task: { en: "Every deal's title and next action date, or 'yok' when there is none.", tr: "Her kaydın başlığı ve sonraki iş tarihi; tarih yoksa 'yok'." },
    hint: { en: "COALESCE(next_action_at, 'yok')", tr: "COALESCE(next_action_at, 'yok')" },
    solution: `SELECT title, COALESCE(next_action_at, 'yok')
FROM deals;`,
  }),
  L({
    id: "case-when",
    focus: ["select"],
    topic: "case-when",
    title: { en: "CASE WHEN: if/else", tr: "CASE WHEN: eğer/değilse" },
    explain: {
      en: "`CASE WHEN condition THEN value ... ELSE value END` picks a value per row.",
      tr: "`CASE WHEN koşul THEN değer ... ELSE değer END` her satır için bir değer seçer.",
    },
    example: `SELECT title,
  CASE WHEN rating >= 9 THEN 'çok iyi'
       ELSE 'iyi'
  END
FROM films;`,
    visual: { kind: "transform", source: "SELECT title, stage FROM deals", result: "SELECT title, CASE WHEN stage IN ('won', 'lost') THEN 'kapalı' ELSE 'açık' END FROM deals", column: 1 },
    task: { en: "Every deal's title and 'kapalı' if it is won or lost ('won', 'lost'), otherwise 'açık'.", tr: "Her kaydın başlığı; kazanılmış ya da kaybedilmişse ('won', 'lost') 'kapalı', değilse 'açık'." },
    hint: { en: "CASE WHEN stage IN ('won', 'lost') THEN 'kapalı' ELSE 'açık' END", tr: "CASE WHEN stage IN ('won', 'lost') THEN 'kapalı' ELSE 'açık' END" },
    solution: `SELECT title,
  CASE WHEN stage IN ('won', 'lost') THEN 'kapalı'
       ELSE 'açık'
  END
FROM deals;`,
  }),
];
