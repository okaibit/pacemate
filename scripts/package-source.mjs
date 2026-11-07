// Runs after `vite build`: zips the project source into dist/download so the
// full codebase can be downloaded from the live site. Never fails the build.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "dist/download/pacemate-source.zip");
try {
  mkdirSync(resolve(root, "dist/download"), { recursive: true });
  rmSync(out, { force: true });
  execFileSync("zip", ["-r", "-q", "-X", out,
    "src", "public", "supabase/functions", "supabase/migrations", "supabase/config.toml", "supabase/README.md", "supabase/COMMUNITY_SETUP.md", "supabase/schedule-notifications.sql",
    "supabase/TESTING_REPORT.md", "supabase/review", "supabase/DIRECT_CHAT.md", "supabase/PUSH_NOTIFICATIONS.md", "scripts/setup-push-secrets.mjs", "tests", "scripts/package-source.mjs", "scripts/bundle-backend.mjs", "package.json", "package-lock.json", "index.html", "vite.config.js", "netlify.toml", "wrangler.jsonc", "AGENTS.md", ".env.example", ".gitignore",
    "-x", "*/.env", "*/.env.*", "*.log", "*.pem", "*.key", ".DS_Store", "*/.DS_Store"], { cwd: root, stdio: "inherit" });
  console.log(`Source zip: /download/pacemate-source.zip (${Math.round(statSync(out).size / 1024)} KB)`);
} catch (e) {
  console.warn("Skipping source zip:", e.message);
}
