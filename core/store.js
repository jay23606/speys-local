// Store: every applet in applets/store/ is in git and listed in the Store. Installing one only adds its id to the
// workspace's installed list: nothing is downloaded, and an applet that isn't installed has no page and runs no code.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SHOT = /^[\w-]+\.png$/;
const PLATFORMS = ["macos", "windows", "linux"];

/** What came with Speys Local before the Store held every applet: a workspace already in use keeps them installed. */
export const LEGACY = ["claude", "crm", "kasa", "ownlearn", "seo", "sosyal", "tasks", "today", "yazim"];

/** The problem with a Store applet's applet.json, or null. */
export function manifestProblem(a) {
  for (const field of ["name", "description"]) {
    if (typeof a[field] !== "string" || !a[field].trim()) return `${field}: required`;
  }
  for (const field of ["author", "category", "reads"]) {
    if (a[field] !== undefined && (typeof a[field] !== "string" || !a[field].trim())) return `${field}: text, or leave it out`;
  }
  if (a.platforms !== undefined && (!Array.isArray(a.platforms) || !a.platforms.length || a.platforms.some((p) => !PLATFORMS.includes(p)))) {
    return `platforms: some of ${PLATFORMS.join(", ")}`;
  }
  if (a.preinstalled !== undefined && typeof a.preinstalled !== "boolean") return "preinstalled: true or false";
  if (a.url !== undefined) return "url: not allowed in the Store";
  return null;
}

/** applets/store/<id>/screenshots/*.png, in name order. */
export function screenshots(folder) {
  const dir = join(folder, "screenshots");
  return existsSync(dir) ? readdirSync(dir).filter((f) => SHOT.test(f)).sort() : [];
}

/** The file behind /store-media/<id>/<name>, or null. */
export function screenshotFile(folder, name) {
  if (!SHOT.test(name ?? "")) return null;
  const file = join(folder, "screenshots", name);
  return existsSync(file) ? file : null;
}

/** The installed list a workspace starts with: what it had before the Store if it was in use, else the preinstalled ones. */
export function startingInstalled(storeApplets, { inUse, disabled = [] }) {
  if (inUse) return LEGACY.filter((id) => storeApplets.some((a) => a.id === id) && !disabled.includes(id));
  return storeApplets.filter((a) => a.preinstalled === true).map((a) => a.id);
}
