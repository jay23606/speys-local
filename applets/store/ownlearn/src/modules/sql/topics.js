// SQL (PostgreSQL) topics. Each topic is found in your code with `pattern`; a quiz question shows
// one real place where you used it. A question may carry `when`: it is only asked about a snippet
// that matches, so the right answer holds for that exact code (DO NOTHING vs DO UPDATE, …).
//
// Levels: 1 everyday, 2 intermediate, 3 advanced. `why` is shown for topics your code never uses.


export const topics = [
  {
    id: "left-join",
    level: 1,
    name: { en: "LEFT JOIN", tr: "LEFT JOIN" },
    pattern: /\bLEFT\s+(OUTER\s+)?JOIN\b/i,
    explain: {
      en: "Keeps every row of the left table; columns from the right table are NULL when there is no match.",
      tr: "Soldaki tablonun bütün satırlarını tutar; sağda eşleşme yoksa sağın sütunları NULL gelir.",
    },
    questions: [
      {
        q: { en: "A row on the left has no match on the right. What happens to it?", tr: "Soldaki bir satırın sağda eşi yok. O satıra ne olur?" },
        options: [
          { en: "It stays in the result; the right side's columns are NULL", tr: "Sonuçta kalır; sağ tarafın sütunları NULL olur" },
          { en: "It is dropped from the result", tr: "Sonuçtan düşer" },
          { en: "The query fails", tr: "Sorgu hata verir" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "group-by",
    level: 1,
    name: { en: "GROUP BY and aggregates", tr: "GROUP BY ve toplama fonksiyonları" },
    pattern: /\bGROUP\s+BY\b/i,
    explain: {
      en: "Collapses rows with the same values into one row per group; COUNT, SUM, MAX… run per group.",
      tr: "Aynı değerli satırları tek satıra toplar; COUNT, SUM, MAX gibi fonksiyonlar her grup için ayrı çalışır.",
    },
    questions: [
      {
        q: { en: "Which columns can appear in SELECT next to GROUP BY?", tr: "GROUP BY varken SELECT'te hangi sütunlar yer alabilir?" },
        options: [
          { en: "Grouped columns and aggregates (COUNT, SUM, …) only", tr: "Yalnızca gruplanan sütunlar ve toplama fonksiyonları (COUNT, SUM, …)" },
          { en: "Any column of the table", tr: "Tablonun herhangi bir sütunu" },
          { en: "Only aggregates", tr: "Yalnızca toplama fonksiyonları" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "having",
    level: 2,
    name: { en: "HAVING", tr: "HAVING" },
    pattern: /\bHAVING\b/i,
    explain: {
      en: "Filters groups after aggregation; WHERE filters rows before grouping.",
      tr: "Gruplamadan sonra grupları süzer; WHERE ise gruplamadan önce satırları süzer.",
    },
    questions: [
      {
        q: { en: "Why HAVING here instead of WHERE?", tr: "Burada neden WHERE değil de HAVING?" },
        options: [
          { en: "The condition uses an aggregate, which only exists after grouping", tr: "Koşul bir toplama sonucuna bakıyor; o değer ancak gruplamadan sonra var" },
          { en: "HAVING is faster than WHERE", tr: "HAVING, WHERE'den hızlıdır" },
          { en: "WHERE cannot be used with JOIN", tr: "WHERE, JOIN ile kullanılamaz" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "coalesce",
    level: 1,
    name: { en: "COALESCE", tr: "COALESCE" },
    pattern: /\bCOALESCE\s*\(/i,
    explain: {
      en: "Returns the first argument that is not NULL; a common way to give a default.",
      tr: "NULL olmayan ilk argümanı döndürür; varsayılan değer vermenin yaygın yolu.",
    },
    questions: [
      {
        q: { en: "COALESCE(NULL, NULL, 'x', 'y') returns…", tr: "COALESCE(NULL, NULL, 'x', 'y') ne döndürür?" },
        options: [{ en: "'x'", tr: "'x'" }, { en: "NULL", tr: "NULL" }, { en: "'y'", tr: "'y'" }],
        answer: 0,
      },
    ],
  },
  {
    id: "case-when",
    level: 1,
    name: { en: "CASE WHEN", tr: "CASE WHEN" },
    pattern: /\bCASE\b[\s\S]*?\bWHEN\b/i,
    explain: {
      en: "SQL's if/else: the first matching WHEN wins; without ELSE an unmatched case gives NULL.",
      tr: "SQL'in if/else'i: ilk tutan WHEN kazanır; ELSE yoksa hiçbiri tutmadığında sonuç NULL olur.",
    },
    questions: [
      {
        q: { en: "No WHEN matches and there is no ELSE. The result is…", tr: "Hiçbir WHEN tutmuyor ve ELSE yok. Sonuç ne olur?" },
        options: [{ en: "NULL", tr: "NULL" }, { en: "An error", tr: "Hata" }, { en: "The first WHEN's value", tr: "İlk WHEN'in değeri" }],
        answer: 0,
      },
    ],
  },
  {
    id: "exists",
    level: 2,
    name: { en: "EXISTS subquery", tr: "EXISTS alt sorgusu" },
    pattern: /\bEXISTS\s*\(/i,
    explain: {
      en: "True if the subquery returns at least one row; Postgres stops at the first row it finds.",
      tr: "Alt sorgu en az bir satır döndürürse doğrudur; Postgres ilk satırı bulunca durur.",
    },
    questions: [
      {
        q: { en: "What does EXISTS (SELECT 1 FROM …) care about?", tr: "EXISTS (SELECT 1 FROM …) neye bakar?" },
        options: [
          { en: "Only whether any row exists, not what is selected", tr: "Yalnızca satır olup olmadığına; seçilen değere değil" },
          { en: "Whether the selected value is 1", tr: "Seçilen değerin 1 olup olmadığına" },
          { en: "How many rows there are", tr: "Kaç satır olduğuna" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "cte",
    level: 2,
    name: { en: "CTE (WITH)", tr: "CTE (WITH)" },
    pattern: /(^|[\s(])WITH\s+(?!RECURSIVE\b)(?!TIME\b)(?!ORDINALITY\b)("?\w+"?)\s+(\([^)]*\)\s+)?AS\s*(NOT\s+)?(MATERIALIZED\s*)?\(/i,
    explain: {
      en: "Names a subquery so the main query can read it like a table; makes long queries readable step by step.",
      tr: "Bir alt sorguya ad verir, ana sorgu onu tablo gibi okur; uzun sorguyu adım adım okunur yapar.",
    },
    questions: [
      {
        q: { en: "What does the name after WITH refer to in the rest of the query?", tr: "WITH'ten sonraki ad sorgunun geri kalanında neyi temsil eder?" },
        options: [
          { en: "The result of the subquery, readable like a table", tr: "Alt sorgunun sonucu; tablo gibi okunabilir" },
          { en: "A new permanent table", tr: "Kalıcı yeni bir tablo" },
          { en: "A variable holding one value", tr: "Tek bir değer tutan değişken" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "recursive-cte",
    level: 3,
    name: { en: "Recursive CTE", tr: "Özyinelemeli CTE" },
    pattern: /\bWITH\s+RECURSIVE\b/i,
    why: { en: "Walks trees and graphs (comment threads, categories) in one query.", tr: "Ağaçları ve ağları (yorum zincirleri, kategoriler) tek sorguda dolaşır." },
    explain: {
      en: "A CTE that refers to itself: a starting part UNION ALL a part that adds the next level until nothing new comes.",
      tr: "Kendine başvuran CTE: bir başlangıç kısmı, UNION ALL ile her turda bir sonraki seviyeyi ekleyen kısım; yeni satır gelmeyince durur.",
    },
    questions: [
      {
        q: { en: "When does a recursive CTE stop?", tr: "Özyinelemeli CTE ne zaman durur?" },
        options: [
          { en: "When the recursive part returns no new rows", tr: "Özyinelemeli kısım yeni satır döndürmeyince" },
          { en: "After exactly 100 rounds", tr: "Tam 100 turdan sonra" },
          { en: "When it reaches the first row again", tr: "İlk satıra geri dönünce" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "window",
    level: 3,
    name: { en: "Window functions (OVER)", tr: "Pencere fonksiyonları (OVER)" },
    pattern: /\bOVER\s*\(/i,
    explain: {
      en: "Computes over a set of related rows (PARTITION BY) without collapsing them like GROUP BY does.",
      tr: "İlişkili satırlar üzerinde (PARTITION BY) hesap yapar ama GROUP BY gibi satırları tek satıra indirmez.",
    },
    questions: [
      {
        q: { en: "How is ROW_NUMBER() OVER (PARTITION BY x …) different from GROUP BY x?", tr: "ROW_NUMBER() OVER (PARTITION BY x …), GROUP BY x'ten nasıl farklı?" },
        options: [
          { en: "Every row stays; each one gets its number within its x group", tr: "Bütün satırlar kalır; her biri kendi x grubu içinde sıra numarası alır" },
          { en: "It returns one row per x", tr: "Her x için tek satır döndürür" },
          { en: "There is no difference", tr: "Fark yok" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "distinct-on",
    level: 3,
    name: { en: "DISTINCT ON", tr: "DISTINCT ON" },
    pattern: /\bDISTINCT\s+ON\s*\(/i,
    explain: {
      en: "Postgres-only: keeps the first row of each group; which row is first is decided by ORDER BY.",
      tr: "Postgres'e özgü: her grubun ilk satırını tutar; hangisinin ilk olduğuna ORDER BY karar verir.",
    },
    questions: [
      {
        q: { en: "In DISTINCT ON (a) … ORDER BY a, b DESC, which row is kept per a?", tr: "DISTINCT ON (a) … ORDER BY a, b DESC sorgusunda her a için hangi satır kalır?" },
        options: [
          { en: "The one with the largest b", tr: "b'si en büyük olan" },
          { en: "The one with the smallest b", tr: "b'si en küçük olan" },
          { en: "A random one", tr: "Rastgele biri" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "lateral",
    level: 3,
    name: { en: "LATERAL join", tr: "LATERAL join" },
    pattern: /\bLATERAL\b/i,
    explain: {
      en: "Lets a subquery in FROM use columns of the tables before it; it runs once per row, like a for-each.",
      tr: "FROM'daki alt sorgunun kendinden önceki tabloların sütunlarını kullanmasını sağlar; her satır için bir kez çalışır, for-each gibi.",
    },
    questions: [
      {
        q: { en: "Why LATERAL here?", tr: "Burada neden LATERAL?" },
        options: [
          { en: "The subquery needs a column from the row before it (e.g. top 3 per user)", tr: "Alt sorgunun önceki satırın bir sütununa ihtiyacı var (ör. kullanıcı başına ilk 3)" },
          { en: "To make the join a LEFT JOIN", tr: "Join'i LEFT JOIN yapmak için" },
          { en: "To sort the result", tr: "Sonucu sıralamak için" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "on-conflict",
    level: 2,
    name: { en: "Upsert (ON CONFLICT)", tr: "Upsert (ON CONFLICT)" },
    pattern: /\bON\s+CONFLICT\b/i,
    explain: {
      en: "What INSERT does when a unique key already exists: skip (DO NOTHING) or update the existing row (DO UPDATE, new values in EXCLUDED).",
      tr: "Benzersiz anahtar zaten varsa INSERT'in ne yapacağı: atla (DO NOTHING) ya da var olan satırı güncelle (DO UPDATE, yeni değerler EXCLUDED'da).",
    },
    questions: [
      {
        when: /DO\s+NOTHING/i,
        q: { en: "The row already exists. What does this INSERT do?", tr: "Satır zaten var. Bu INSERT ne yapar?" },
        options: [
          { en: "Nothing, and no error", tr: "Hiçbir şey; hata da vermez" },
          { en: "Updates the existing row", tr: "Var olan satırı günceller" },
          { en: "Fails with a unique violation", tr: "Benzersizlik hatası verir" },
        ],
        answer: 0,
      },
      {
        when: /DO\s+UPDATE/i,
        q: { en: "In DO UPDATE SET x = EXCLUDED.x, what is EXCLUDED?", tr: "DO UPDATE SET x = EXCLUDED.x ifadesinde EXCLUDED nedir?" },
        options: [
          { en: "The row this INSERT tried to add", tr: "Bu INSERT'in eklemeye çalıştığı satır" },
          { en: "The row already in the table", tr: "Tabloda zaten olan satır" },
          { en: "Rows deleted earlier", tr: "Daha önce silinmiş satırlar" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "returning",
    level: 2,
    name: { en: "RETURNING", tr: "RETURNING" },
    pattern: /\bRETURNING\b/i,
    explain: {
      en: "INSERT/UPDATE/DELETE give back the affected rows (e.g. the new id) without a second query.",
      tr: "INSERT/UPDATE/DELETE etkilenen satırları (ör. yeni id) ikinci bir sorgu olmadan geri verir.",
    },
    questions: [
      {
        q: { en: "What does RETURNING id give after an INSERT?", tr: "INSERT'ten sonra RETURNING id ne verir?" },
        options: [
          { en: "The id of each inserted row", tr: "Eklenen her satırın id'si" },
          { en: "The largest id in the table", tr: "Tablodaki en büyük id" },
          { en: "The number of rows inserted", tr: "Eklenen satır sayısı" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "jsonb",
    level: 2,
    name: { en: "JSONB operators", tr: "JSONB operatörleri" },
    pattern: /->>|\bjsonb_build_object\b|\bjsonb_agg\b|@>|::jsonb/i,
    explain: {
      en: "-> returns JSON, ->> returns text; @> checks containment; jsonb_build_object / jsonb_agg build JSON in SQL.",
      tr: "-> JSON döndürür, ->> metin döndürür; @> içeriyor mu diye bakar; jsonb_build_object / jsonb_agg SQL içinde JSON kurar.",
    },
    questions: [
      {
        when: /->>/,
        q: { en: "data->>'name' versus data->'name'?", tr: "data->>'name' ile data->'name' farkı?" },
        options: [
          { en: "->> gives text, -> gives JSON", tr: "->> metin verir, -> JSON verir" },
          { en: "They are the same", tr: "Aynılar" },
          { en: "->> searches nested keys", tr: "->> iç içe anahtarlarda arar" },
        ],
        answer: 0,
      },
      {
        when: /jsonb_agg/i,
        q: { en: "What does jsonb_agg(...) produce?", tr: "jsonb_agg(...) ne üretir?" },
        options: [
          { en: "One JSON array from many rows", tr: "Birçok satırdan tek bir JSON dizisi" },
          { en: "One JSON object per row", tr: "Her satır için ayrı JSON nesnesi" },
          { en: "The count of JSON values", tr: "JSON değerlerinin sayısı" },
        ],
        answer: 0,
      },
      {
        when: /@>/,
        q: { en: "What does a @> b check?", tr: "a @> b neye bakar?" },
        options: [
          { en: "Whether a contains b", tr: "a'nın b'yi içerip içermediğine" },
          { en: "Whether a is greater than b", tr: "a'nın b'den büyük olup olmadığına" },
          { en: "Whether a and b are equal", tr: "a ile b eşit mi" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "any-array",
    level: 2,
    name: { en: "Arrays and ANY()", tr: "Diziler ve ANY()" },
    pattern: /=\s*ANY\s*\(|\bTEXT\[\]|\bUUID\[\]|\bARRAY\[/i,
    explain: {
      en: "x = ANY(array) is true if x equals any element; Postgres columns can hold arrays (TEXT[]).",
      tr: "x = ANY(dizi), x dizideki herhangi bir öğeye eşitse doğrudur; Postgres sütunları dizi tutabilir (TEXT[]).",
    },
    questions: [
      {
        q: { en: "WHERE id = ANY($1) with $1 = '{1,2,3}' matches…", tr: "$1 = '{1,2,3}' iken WHERE id = ANY($1) hangi satırları tutar?" },
        options: [
          { en: "Rows whose id is 1, 2 or 3", tr: "id'si 1, 2 ya da 3 olanlar" },
          { en: "Rows whose id is the whole array", tr: "id'si dizinin tamamına eşit olanlar" },
          { en: "Only id 1", tr: "Yalnızca id 1" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "index",
    level: 2,
    name: { en: "Indexes", tr: "İndeksler" },
    pattern: /\bCREATE\s+(UNIQUE\s+)?INDEX\b/i,
    explain: {
      en: "Speeds up lookups and sorts on the indexed columns; costs disk space and a bit of write time.",
      tr: "İndekslenen sütunlarda arama ve sıralamayı hızlandırır; karşılığında disk alanı ve biraz yazma süresi harcar.",
    },
    questions: [
      {
        when: /CREATE\s+UNIQUE\s+INDEX/i,
        q: { en: "Besides speed, what does a UNIQUE index do?", tr: "Hızın yanında UNIQUE indeks ne yapar?" },
        options: [
          { en: "Rejects a second row with the same values", tr: "Aynı değerlerle ikinci bir satırı reddeder" },
          { en: "Sorts the table on disk", tr: "Tabloyu diskte sıralar" },
          { en: "Nothing else", tr: "Başka bir şey yapmaz" },
        ],
        answer: 0,
      },
      {
        when: /INDEX[^;]*\)\s*WHERE\b/i,
        q: { en: "This index ends with WHERE. What is it?", tr: "Bu indeks WHERE ile bitiyor. Bu ne demek?" },
        options: [
          { en: "A partial index: only rows matching the condition are indexed", tr: "Kısmi indeks: yalnızca koşula uyan satırlar indekslenir" },
          { en: "The index is used only in queries with this exact WHERE text", tr: "İndeks yalnızca aynı WHERE metniyle yazılan sorgularda kullanılır" },
          { en: "The index is created only if the condition is true now", tr: "Koşul şu an doğruysa indeks oluşturulur" },
        ],
        answer: 0,
      },
      {
        q: { en: "Index on (a, b). Which filter can use it best?", tr: "(a, b) üzerinde indeks var. Hangi süzme onu en iyi kullanır?" },
        options: [
          { en: "WHERE a = … (and optionally b)", tr: "WHERE a = … (istersen b de)" },
          { en: "WHERE b = … alone", tr: "Yalnızca WHERE b = …" },
          { en: "Any filter on any column", tr: "Herhangi bir sütunda herhangi bir süzme" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "foreign-key",
    level: 1,
    name: { en: "Foreign keys", tr: "Yabancı anahtarlar" },
    pattern: /\bREFERENCES\s+[\w."]+/i,
    explain: {
      en: "A column that must point to an existing row elsewhere; ON DELETE decides what happens when that row goes.",
      tr: "Başka bir tablodaki var olan satırı göstermek zorunda olan sütun; o satır silinince ne olacağına ON DELETE karar verir.",
    },
    questions: [
      {
        when: /ON\s+DELETE\s+CASCADE/i,
        q: { en: "The referenced row is deleted. With ON DELETE CASCADE…", tr: "Gösterilen satır silindi. ON DELETE CASCADE ile ne olur?" },
        options: [
          { en: "Rows pointing to it are deleted too", tr: "Onu gösteren satırlar da silinir" },
          { en: "The delete is refused", tr: "Silme reddedilir" },
          { en: "The column becomes NULL", tr: "Sütun NULL olur" },
        ],
        answer: 0,
      },
      {
        when: /ON\s+DELETE\s+SET\s+NULL/i,
        q: { en: "The referenced row is deleted. With ON DELETE SET NULL…", tr: "Gösterilen satır silindi. ON DELETE SET NULL ile ne olur?" },
        options: [
          { en: "This row stays, its column becomes NULL", tr: "Bu satır kalır, sütunu NULL olur" },
          { en: "This row is deleted too", tr: "Bu satır da silinir" },
          { en: "The delete is refused", tr: "Silme reddedilir" },
        ],
        answer: 0,
      },
      {
        q: { en: "Without an ON DELETE clause, deleting a referenced row…", tr: "ON DELETE yazılmamışken, gösterilen satırı silmeye çalışınca…" },
        options: [
          { en: "Fails while rows still point to it", tr: "Onu gösteren satır varken hata verir" },
          { en: "Deletes the pointing rows", tr: "Gösteren satırları siler" },
          { en: "Sets the pointing columns to NULL", tr: "Gösteren sütunları NULL yapar" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "check",
    level: 2,
    name: { en: "CHECK constraints", tr: "CHECK kısıtları" },
    pattern: /\bCHECK\s*\(/i,
    explain: {
      en: "A rule every row must satisfy; the database rejects writes that break it, whatever the app does.",
      tr: "Her satırın uyması gereken kural; uygulama ne yaparsa yapsın veritabanı onu bozan yazmayı reddeder.",
    },
    questions: [
      {
        q: { en: "A CHECK condition evaluates to NULL for a row. Is the row accepted?", tr: "Bir satır için CHECK koşulu NULL çıkıyor. Satır kabul edilir mi?" },
        options: [
          { en: "Yes: only FALSE is rejected", tr: "Evet: yalnızca FALSE reddedilir" },
          { en: "No: NULL counts as false", tr: "Hayır: NULL yanlış sayılır" },
          { en: "Depends on the column type", tr: "Sütun türüne bağlı" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "plpgsql",
    level: 2,
    name: { en: "PL/pgSQL functions", tr: "PL/pgSQL fonksiyonları" },
    pattern: /\bLANGUAGE\s+'?plpgsql'?/i,
    explain: {
      en: "Code that runs inside the database: variables, IF, loops, RAISE. Business rules here hold for every caller.",
      tr: "Veritabanının içinde çalışan kod: değişkenler, IF, döngüler, RAISE. Buradaki iş kuralı her çağıran için geçerli olur.",
    },
    questions: [
      {
        when: /\bRAISE\s+EXCEPTION\b/i,
        q: { en: "RAISE EXCEPTION runs inside the function. What happens to its earlier writes?", tr: "Fonksiyonun içinde RAISE EXCEPTION çalıştı. Daha önce yaptığı yazmalara ne olur?" },
        options: [
          { en: "They are rolled back with the rest of the transaction", tr: "İşlemin geri kalanıyla birlikte geri alınır" },
          { en: "They stay; only later lines are skipped", tr: "Kalır; yalnızca sonraki satırlar atlanır" },
          { en: "They are saved as a draft", tr: "Taslak olarak saklanır" },
        ],
        answer: 0,
      },
      {
        q: { en: "Why put this logic in a database function rather than the app?", tr: "Bu mantık neden uygulamada değil de veritabanı fonksiyonunda?" },
        options: [
          { en: "It runs atomically in one round trip and holds for every caller", tr: "Tek gidiş-dönüşte, bölünmeden çalışır ve her çağıran için aynı kural geçerli olur" },
          { en: "Database functions cannot have bugs", tr: "Veritabanı fonksiyonlarında hata olmaz" },
          { en: "Apps cannot run SQL", tr: "Uygulamalar SQL çalıştıramaz" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "security-definer",
    level: 3,
    name: { en: "SECURITY DEFINER", tr: "SECURITY DEFINER" },
    pattern: /\bSECURITY\s+DEFINER\b/i,
    explain: {
      en: "The function runs with its owner's rights, not the caller's; pin search_path so callers can't swap in their own objects.",
      tr: "Fonksiyon çağıranın değil sahibinin yetkileriyle çalışır; çağıranın kendi nesnelerini araya sokamaması için search_path sabitlenmeli.",
    },
    questions: [
      {
        q: { en: "Whose permissions does a SECURITY DEFINER function use?", tr: "SECURITY DEFINER bir fonksiyon kimin yetkileriyle çalışır?" },
        options: [
          { en: "Its owner's", tr: "Sahibinin" },
          { en: "The caller's", tr: "Çağıranın" },
          { en: "Superuser's, always", tr: "Her zaman süper kullanıcının" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "trigger",
    level: 3,
    name: { en: "Triggers", tr: "Tetikleyiciler (trigger)" },
    pattern: /\bCREATE\s+(OR\s+REPLACE\s+)?(CONSTRAINT\s+)?TRIGGER\b/i,
    explain: {
      en: "A function the database runs by itself before/after INSERT, UPDATE or DELETE (e.g. keep updated_at fresh).",
      tr: "INSERT, UPDATE ya da DELETE'ten önce/sonra veritabanının kendiliğinden çalıştırdığı fonksiyon (ör. updated_at'i güncel tutmak).",
    },
    questions: [
      {
        when: /\bBEFORE\b/i,
        q: { en: "A BEFORE UPDATE trigger changes NEW.updated_at. What gets saved?", tr: "BEFORE UPDATE tetikleyicisi NEW.updated_at'i değiştiriyor. Ne kaydedilir?" },
        options: [
          { en: "The row with the trigger's change", tr: "Tetikleyicinin değiştirdiği hâliyle satır" },
          { en: "The row as the app sent it", tr: "Uygulamanın gönderdiği hâliyle satır" },
          { en: "Nothing until COMMIT runs the trigger again", tr: "COMMIT tetikleyiciyi yeniden çalıştırana kadar hiçbir şey" },
        ],
        answer: 0,
      },
      {
        q: { en: "What is the risk of triggers?", tr: "Tetikleyicilerin riski ne?" },
        options: [
          { en: "Side effects are invisible from the query that causes them", tr: "Yan etkileri, onları tetikleyen sorgudan bakınca görünmez" },
          { en: "They only run once per day", tr: "Günde yalnızca bir kez çalışırlar" },
          { en: "They cannot read the changed row", tr: "Değişen satırı okuyamazlar" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "for-update",
    level: 3,
    name: { en: "Row locks (FOR UPDATE)", tr: "Satır kilidi (FOR UPDATE)" },
    pattern: /\bFOR\s+(NO\s+KEY\s+)?UPDATE\b(?!\s+(ON|OF\s+\w+\s+ON))/i,
    explain: {
      en: "Locks the selected rows until the transaction ends, so two requests can't change the same row at once.",
      tr: "Seçilen satırları işlem bitene kadar kilitler; iki istek aynı satırı aynı anda değiştiremez.",
    },
    questions: [
      {
        q: { en: "Another transaction tries to update a row locked with FOR UPDATE. It…", tr: "Başka bir işlem FOR UPDATE ile kilitlenmiş satırı güncellemeye çalışıyor. Ne olur?" },
        options: [
          { en: "Waits until the first transaction ends", tr: "İlk işlem bitene kadar bekler" },
          { en: "Overwrites it immediately", tr: "Hemen üstüne yazar" },
          { en: "Reads a copy and continues", tr: "Bir kopyayı okuyup devam eder" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "rls",
    level: 3,
    name: { en: "Row-level security", tr: "Satır düzeyi güvenlik (RLS)" },
    pattern: /\bCREATE\s+POLICY\b|\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i,
    why: {
      en: "Without it, anyone with database access reads every row; with it, the database itself enforces who sees what.",
      tr: "Olmazsa veritabanına erişen herkes her satırı okur; olursa kimin neyi göreceğini veritabanının kendisi uygular.",
    },
    explain: {
      en: "Policies decide per row which users may read or write it; enforced by Postgres even if the app forgets.",
      tr: "Politikalar her satır için hangi kullanıcının okuyup yazabileceğine karar verir; uygulama unutsa bile Postgres uygular.",
    },
    questions: [
      {
        q: { en: "RLS is enabled on a table but no policy exists. A normal user selects from it and gets…", tr: "Tabloda RLS açık ama hiç politika yok. Normal bir kullanıcı SELECT yapınca ne alır?" },
        options: [
          { en: "No rows", tr: "Hiç satır" },
          { en: "Every row", tr: "Bütün satırları" },
          { en: "An error", tr: "Hata" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "view",
    level: 2,
    name: { en: "Views", tr: "Görünümler (VIEW)" },
    pattern: /\bCREATE\s+(OR\s+REPLACE\s+)?(MATERIALIZED\s+)?VIEW\b/i,
    explain: {
      en: "A saved query you read like a table; a MATERIALIZED view stores the result and must be refreshed.",
      tr: "Tablo gibi okunan kayıtlı sorgu; MATERIALIZED görünüm sonucu saklar ve yenilenmesi gerekir.",
    },
    questions: [
      {
        q: { en: "Underlying data changes. A normal (non-materialized) view shows…", tr: "Alttaki veri değişti. Normal (materialized olmayan) görünüm ne gösterir?" },
        options: [
          { en: "The new data right away", tr: "Yeni veriyi hemen" },
          { en: "The old data until REFRESH", tr: "REFRESH'e kadar eski veriyi" },
          { en: "Nothing until recreated", tr: "Yeniden oluşturulana kadar hiçbir şey" },
        ],
        answer: 0,
      },
    ],
  },
  {
    id: "generated",
    level: 3,
    name: { en: "Generated columns", tr: "Hesaplanan sütunlar" },
    pattern: /\bGENERATED\s+ALWAYS\s+AS\s*\(/i,
    explain: {
      en: "A column computed from others on every write (e.g. a search vector); you can't write it directly.",
      tr: "Her yazmada başka sütunlardan hesaplanan sütun (ör. arama vektörü); doğrudan yazılamaz.",
    },
    questions: [
      {
        q: { en: "Can an INSERT set a GENERATED ALWAYS … STORED column's value?", tr: "Bir INSERT, GENERATED ALWAYS … STORED sütuna değer yazabilir mi?" },
        options: [
          { en: "No, the database computes it", tr: "Hayır, değeri veritabanı hesaplar" },
          { en: "Yes, it overrides the formula", tr: "Evet, formülün yerine geçer" },
          { en: "Only for the first row", tr: "Yalnızca ilk satır için" },
        ],
        answer: 0,
      },
    ],
  },
];
