#!/usr/bin/env node
// Fails if a tracked (or about-to-be-tracked) file appears to contain a credential.
// Dependency-free so it runs in CI and locally before pushing: `npm run check:secrets`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "Groq API key", re: /gsk_[A-Za-z0-9]{20,}/ },
  { name: "Generic secret key", re: /\bsk-[A-Za-z0-9_-]{24,}/ },
  {
    name: "PayPal credential assignment",
    re: /(PAYPAL_CLIENT_(?:ID|SECRET)|client_secret)\s*[:=]\s*["']?[A-Za-z0-9_-]{40,}/i,
  },
  { name: "Database URL with password", re: /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/ },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const SKIP = [/^package-lock\.json$/, /\.(png|jpe?g|webp|gif|ico|pdf|woff2?)$/i];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .filter((f) => !SKIP.some((re) => re.test(f)));

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // deleted in working tree
  }
  text.split("\n").forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) findings.push(`${file}:${i + 1}  ${name}`);
    }
  });
}

if (findings.length > 0) {
  console.error("Possible secrets found:\n" + findings.map((f) => `  ${f}`).join("\n"));
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} files checked).`);
