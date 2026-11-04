// One query in its own process: sandbox.js kills it when the time is up, because native SQLite can't be interrupted.
import { readFileSync } from "node:fs";
import { check } from "./sandbox.js";

const { schema, sql, lesson } = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(check(schema, sql, lesson)));
