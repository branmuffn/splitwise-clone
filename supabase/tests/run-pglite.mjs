// Runs supabase/tests/permissions.sql in a throwaway in-memory Postgres (PGlite, Postgres compiled
// to WebAssembly). No Supabase project, Docker, or Postgres install needed, and nothing is saved.
//
//   npm install --no-save @electric-sql/pglite      # once; does not change package.json
//   node supabase/tests/run-pglite.mjs              # stub + schema.sql + every migration, then the tests
//   node supabase/tests/run-pglite.mjs a.sql b.sql  # stub + these files in this order, then the tests
//
// Each file is applied in one transaction, like the Supabase SQL Editor. Set PGLITE_MODULE to load
// PGlite from somewhere else (a path to its dist/index.js). Exits 0 only if every check passes.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const here = (...p) => path.join(root, ...p);

let PGlite;
try {
  const spec = process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : "@electric-sql/pglite";
  ({ PGlite } = await import(spec));
} catch {
  console.error("PGlite isn't installed. Run: npm install --no-save @electric-sql/pglite");
  process.exit(2);
}

const files = process.argv.length > 2
  ? process.argv.slice(2).map((f) => path.resolve(f))
  : [
      here("supabase/schema.sql"),
      ...readdirSync(here("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()
        .map((f) => here("supabase/migrations", f)),
    ];

const db = new PGlite();
const warnings = [];
const onNotice = (n) => { if (n.severity === "WARNING") warnings.push(n.message); };

await db.exec(readFileSync(here("supabase/tests/stub-supabase.sql"), "utf8"), { onNotice });
for (const file of files) {
  try {
    await db.exec(`begin;\n${readFileSync(file, "utf8")}\n;commit;`, { onNotice });
    console.log(`applied  ${path.relative(root, file) || file}`);
  } catch (e) {
    console.error(`FAILED to apply ${file}: ${e.message}`);
    process.exit(1);
  }
}
for (const w of warnings) console.log(`warning  ${w}`);

const lines = [];
let error = null;
try {
  await db.exec(readFileSync(here("supabase/tests/permissions.sql"), "utf8"), {
    onNotice: (n) => { if (n.severity === "NOTICE") lines.push(n.message); },
  });
} catch (e) {
  error = e.message;
  await db.exec("rollback");
}
console.log(lines.join("\n"));
const failed = lines.filter((l) => l.startsWith("FAIL")).length;
if (error && !/permission checks failed/.test(error)) console.error(`ERROR    ${error}`);
await db.close();
process.exit(error || failed ? 1 : 0);
