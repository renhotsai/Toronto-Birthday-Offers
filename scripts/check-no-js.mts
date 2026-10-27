// Fails when a JavaScript file appears outside the allowlist (see "Language: TypeScript first" in CLAUDE.md).
import { execFileSync } from "node:child_process";

// Files that must stay JavaScript because their tool cannot load TypeScript. Keep the reason in the file itself.
const ALLOWED_JS: string[] = [];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => /\.(js|jsx|mjs|cjs)$/.test(file) && !ALLOWED_JS.includes(file));

if (files.length > 0) {
  console.error("JavaScript files found; write them in TypeScript or add them to ALLOWED_JS with a reason:");
  for (const file of files) console.error(`  ${file}`);
  process.exit(1);
}
console.log("No stray JavaScript files.");
