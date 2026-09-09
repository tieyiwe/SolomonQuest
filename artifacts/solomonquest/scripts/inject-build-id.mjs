// Runs after `vite build`. Stamps a fresh build id into the emitted
// service worker so the browser actually notices a new deploy — an
// unchanged sw.js is never re-fetched, so without this the whole update
// flow in src/lib/pwa.ts would never fire.
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const swPath = path.resolve(dir, "..", "dist", "public", "sw.js");

const buildId = process.env.SOURCE_VERSION || process.env.GIT_COMMIT || String(Date.now());

const contents = readFileSync(swPath, "utf8");
writeFileSync(swPath, contents.replace("__BUILD_ID__", buildId));

console.log(`[inject-build-id] sw.js stamped with build id: ${buildId}`);
