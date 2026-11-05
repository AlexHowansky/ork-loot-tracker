/**
 * Production build: bundles the server (with the client it serves through
 * its HTML import) and the GM CLI into `dist/`, so they run with no
 * node_modules at all.
 *
 *   bun run build
 *   bun dist/server/index.js
 *   bun dist/cli/gm.js create <email>
 *
 * Entry points keep their depth below the project root (src/server →
 * dist/server), so paths they derive from `import.meta.dir`, such as
 * `drizzle/` and `data/`, still resolve.
 */
import { rm } from "node:fs/promises";
import type { BunPlugin } from "bun";
import tailwind from "bun-plugin-tailwind";

await rm("dist", { recursive: true, force: true });

// Built one entry at a time: Bun.serve looks up the client's files relative
// to the server's output file, so the server needs an outdir of its own.
async function build(entry: string, outdir: string, plugins: BunPlugin[] = []) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    target: "bun",
    minify: true,
    sourcemap: "linked",
    // Absolute asset URLs in the HTML, which every SPA route serves.
    publicPath: "/",
    plugins,
    // Picks React's production build for the client and makes the server's
    // production check a constant.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  for (const out of result.outputs) console.log(`${out.path} (${out.kind})`);
}

await build("src/server/index.ts", "dist/server", [tailwind]);
await build("src/cli/gm.ts", "dist/cli");
