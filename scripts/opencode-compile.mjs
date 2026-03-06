import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OPENCODE_DIR = path.join(ROOT, ".opencode");
const AGENTS_MD = path.join(ROOT, "AGENTS.md");

const BEGIN = "<!-- BEGIN OPENCODE AUTO -->";
const END = "<!-- END OPENCODE AUTO -->";

// Directories that should NOT be compiled
const EXCLUDED_DIRS = ["plans"];

function walk(dir) {
  const results = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.includes(entry.name)) {
        results.push(...walk(fullPath));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }

  return results;
}

function compileSection(files) {
  return files
    .sort()
    .map((filePath) => {
      const relative = path.relative(OPENCODE_DIR, filePath);
      const content = fs.readFileSync(filePath, "utf8").trim();

      return `\n\n## ${relative}\n\n${content}`;
    })
    .join("");
}

function upsert(original, replacement) {
  const block = `${BEGIN}\n${replacement}\n${END}`;

  if (original.includes(BEGIN) && original.includes(END)) {
    return original.replace(
      new RegExp(`${BEGIN}[\\s\\S]*?${END}`, "m"),
      block
    );
  }

  return original + `\n\n${block}\n`;
}

function main() {
  if (!fs.existsSync(OPENCODE_DIR)) {
    console.error(".opencode directory not found.");
    process.exit(1);
  }

  const files = walk(OPENCODE_DIR);

  const compiled = `
# 🔒 Compiled OpenCode Configuration

> Auto-generated. Do not edit manually.

${compileSection(files)}
`.trim();

  const existing = fs.existsSync(AGENTS_MD)
    ? fs.readFileSync(AGENTS_MD, "utf8")
    : "# AGENTS.md\n";

  const updated = upsert(existing, compiled);

  fs.writeFileSync(AGENTS_MD, updated);

  console.log("✅ AGENTS.md compiled successfully.");
  console.log(`Included files: ${files.length}`);
}

main();