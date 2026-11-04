// The SQL lessons come in packages, each its own page (#/lessons/<id>):
//   sql-basics    from the very first SELECT; general, the same for everyone
//   sql-advanced  subqueries, EXISTS, WITH, window functions, FILTER; general
//   sql-yours     long queries from your own repo: what they do part by part, then you write them.
//                 Only the repo layer has these lessons (Claude writes them, docs/course.md).
import { lessons as basics } from "./lessons.js";
import { advanced } from "./advanced.js";

export const packages = [
  {
    id: "sql-basics",
    title: { en: "SQL basics", tr: "SQL Temelleri" },
    about: {
      en: "From the first SELECT to CASE WHEN: how a query is written, one idea per lesson.",
      tr: "İlk SELECT'ten CASE WHEN'e: bir sorgu nasıl yazılır, her derste tek konu.",
    },
    lessons: basics,
  },
  {
    id: "sql-advanced",
    title: { en: "Advanced SQL", tr: "İleri SQL" },
    about: {
      en: "Queries inside queries, EXISTS, WITH steps, window functions and counting with a condition.",
      tr: "Sorgu içinde sorgu, EXISTS, WITH adımları, pencere fonksiyonları ve koşullu sayma.",
    },
    lessons: advanced,
  },
  {
    id: "sql-yours",
    repo: true,
    title: { en: "The SQL in your project", tr: "Projendeki SQL'ler" },
    about: {
      en: "Long queries from your own code: what each part does and why, then you write it yourself.",
      tr: "Kendi kodundaki uzun sorgular: her parçası ne yapıyor ve neden orada; sonra kendin yazıyorsun.",
    },
    lessons: [],
  },
];

/** Every general lesson, each knowing its package. */
export const lessons = packages.flatMap((p) => p.lessons.map((l) => ({ ...l, pkg: p.id })));
