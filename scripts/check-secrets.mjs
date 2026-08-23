// Fails the build if a privileged credential can reach the browser (SPEC §8.1).
//
// Two ways that happens, both caught here:
//   1. Anything under app/ or components/ referencing the service role key.
//      Those trees are the app; the service role belongs to ingest/ alone.
//   2. A NEXT_PUBLIC_* name that looks like a secret. The prefix inlines a
//      value into any bundle that reads it, so a secret behind that prefix is
//      a published secret.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCANNED = ['app', 'components'];
const CODE = /\.(ts|tsx|js|jsx|mjs)$/;

const FORBIDDEN = [
  { pattern: /SUPABASE_SERVICE_ROLE_KEY/, why: 'service role key (bypasses row level security)' },
  { pattern: /\bsb_secret_/, why: 'Supabase secret key (bypasses row level security)' },
  { pattern: /createServiceClient/, why: 'service-role Supabase client factory' },
  { pattern: /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD)/, why: 'secret behind a NEXT_PUBLIC_ prefix' },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (CODE.test(entry)) yield full;
  }
}

const violations = [];
for (const tree of SCANNED) {
  const base = join(ROOT, tree);
  try {
    statSync(base);
  } catch {
    continue;
  }
  for (const file of walk(base)) {
    const source = readFileSync(file, 'utf8');
    source.split('\n').forEach((line, index) => {
      // Skip the comment lines that merely explain the rule.
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const { pattern, why } of FORBIDDEN) {
        if (pattern.test(line)) {
          violations.push(`${relative(ROOT, file)}:${index + 1} — ${why}\n    ${line.trim()}`);
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error('\nBuild refused: a privileged credential is reachable from the app.\n');
  for (const violation of violations) console.error(`  ${violation}\n`);
  console.error('The service role key belongs to ingest/ only. See SPEC §8.1.\n');
  process.exit(1);
}

console.log(`✓ no privileged credential referenced from ${SCANNED.join('/, ')}/`);
