// The SQL module: everything ownlearn knows about SQL in one place. A new subject (TypeScript,
// React, Git…) is a folder like this one that exports the same names.
export const id = "sql";
export const name = "SQL";
export const files = /\.sql$/i;
export { topics } from "./topics.js";
export { schema } from "./lessons.js";
export { packages, lessons } from "./packages.js";
export { writing, stepsOf, annotate } from "./steps.js";
export { mistakes, findMistakes } from "./mistakes.js";
export { check, checkLimited, tableInfo, wants } from "./sandbox.js";
export { split, context, describe, fileNote, schemaSummary } from "./analyze.js";
