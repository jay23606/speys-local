// Notification sounds: the ones that come with this applet, your own files in <home>/apps/claude/sounds, then the sounds
// macOS ships with. Used by the page and the hook.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SYSTEM_FOLDER = "/System/Library/Sounds";
const SPEYS_FOLDER = join(import.meta.dirname, "sounds");
const DEFAULTS = { done: "Speys Approval 4 Soft Knock.wav", approval: "Speys Approval 2 Question.wav" };
const AUDIO = /\.(m4a|mp3|wav|aiff?|caf)$/i;
export const NONE = "none";
const stem = (file) => file.replace(/\.[^.]+$/, "");
const filesIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => AUDIO.test(f)).sort() : []);

export const soundsFolder = (home) => join(home, "apps", "claude", "sounds");

export function listSounds(home) {
  const speys = filesIn(SPEYS_FOLDER);
  return [
    ...speys.map((f) => ({ id: `file:${f}`, name: stem(f), own: false, speys: true })),
    ...filesIn(soundsFolder(home)).filter((f) => !speys.includes(f)).map((f) => ({ id: `file:${f}`, name: stem(f), own: true })),
    ...filesIn(SYSTEM_FOLDER).map((f) => ({ id: `system:${stem(f)}`, name: stem(f), own: false })),
  ];
}

/** Own file with this name if there is one (older installs), else the sound that comes with the applet. */
function defaultSound(home, ownFile, speysFile) {
  if (existsSync(join(soundsFolder(home), ownFile))) return `file:${ownFile}`;
  return existsSync(join(SPEYS_FOLDER, speysFile)) ? `file:${speysFile}` : NONE;
}

export const chosenSounds = (home, saved = {}) => ({
  done: saved.done || defaultSound(home, "bitti.m4a", DEFAULTS.done),
  approval: saved.approval || defaultSound(home, "onay.m4a", DEFAULTS.approval),
});

/** The file of a sound id; ids are checked against the list, so a request cannot reach other files. */
export function soundPath(home, id) {
  const found = listSounds(home).find((s) => s.id === id);
  if (!found) return null;
  const [kind, name] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
  if (kind !== "file") return join(SYSTEM_FOLDER, `${name}.aiff`);
  return join(found.speys ? SPEYS_FOLDER : soundsFolder(home), name);
}
