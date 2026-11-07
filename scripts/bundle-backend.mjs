import { rolldown } from "rolldown";
import { mkdirSync } from "node:fs";

// Tree-shake the ORM locally instead of making the Edge worker initialize its
// complete npm module graph. Push encryption is loaded only by the delivery job.
mkdirSync("supabase/functions/pacemate/_bundle", { recursive: true });
const bundle = await rolldown({
  input: "supabase/functions/pacemate/index.ts",
  external: id => id === "postgres" || id === "web-push",
});
try {
  await bundle.write({
    file: "supabase/functions/pacemate/_bundle/index.js",
    format: "esm", codeSplitting: false, minify: true,
  });
} finally { await bundle.close(); }
console.log("Supabase backend bundled.");
