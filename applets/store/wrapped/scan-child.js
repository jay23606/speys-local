// The scan, in a process of its own: a month of transcripts takes seconds to read and the dashboard must keep answering.
// A file that hasn't changed is taken from the cache; a file Claude Code has deleted stays there, so older months remain.
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileReader } from "./stats.js";

const [cacheFile, foldersJson] = process.argv.slice(2);
const folders = JSON.parse(foldersJson);
let cache = {};
try {
  if (existsSync(cacheFile)) cache = JSON.parse(readFileSync(cacheFile, "utf8"));
} catch {
  cache = {}; // a broken cache is read again from the transcripts
}

const transcripts = [];
for (const folder of folders) {
  const root = join(folder, "projects");
  if (!existsSync(root)) continue;
  for (const project of readdirSync(root)) {
    const dir = join(root, project);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir)) if (name.endsWith(".jsonl")) transcripts.push(join(dir, name));
  }
}

async function readTranscript(file) {
  const reader = fileReader();
  for await (const line of createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity })) {
    try {
      reader.add(JSON.parse(line));
    } catch {
      // a line still being written
    }
  }
  return reader.finish();
}

let done = 0;
for (const file of transcripts) {
  const { size, mtimeMs } = statSync(file);
  if (cache[file]?.size !== size || cache[file]?.modified !== mtimeMs) cache[file] = { size, modified: mtimeMs, ...(await readTranscript(file)) };
  process.stdout.write(`${++done} ${transcripts.length}\n`);
}

mkdirSync(dirname(cacheFile), { recursive: true });
writeFileSync(`${cacheFile}.yeni`, JSON.stringify(cache));
renameSync(`${cacheFile}.yeni`, cacheFile);
