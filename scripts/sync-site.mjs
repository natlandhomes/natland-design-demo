#!/usr/bin/env node
// Copies the built Natland website (dev branch of the website repo) into site/, so GitHub Pages
// can show it at https://natlandhomes.github.io/natland-design-demo/site/.
//
//   node scripts/sync-site.mjs
//
// The website repo is read-only from here: the script only checks its branch/status and runs
// `node build.js` there (which writes the git-ignored dist/ and .cache/). The website repo is
// expected next to this one (../natlandhomes); override with NATLAND_SITE_REPO=/path/to/repo.
//
// The build uses root-relative URLs (/assets/..., /portfolio/...), which break under /site/, so
// every internal URL is rewritten relative to the page it is in.

import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_REPO = path.resolve(process.env.NATLAND_SITE_REPO || path.join(DEMO, '..', 'natlandhomes'));
const DIST = path.join(SITE_REPO, 'dist');
const OUT = path.join(DEMO, 'site');
const BRANCH = 'dev';

// Top-level entries of dist/ that are not copied: the CMS, and Netlify-only / crawler files.
const EXCLUDE = new Set(['admin', '_headers', '_redirects', 'robots.txt', 'sitemap.xml']);
// Attributes in the HTML that hold internal URLs (srcset/imagesrcset hold a comma-separated list).
const URL_ATTRS = ['href', 'src', 'srcset', 'imagesrcset', 'data-base'];
const LIST_ATTRS = new Set(['srcset', 'imagesrcset']);

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

const git = (...args) => execFileSync('git', ['-C', SITE_REPO, ...args], { encoding: 'utf8' }).trim();

// ---------- 1. Check the website repo, then build it ----------

if (!fs.existsSync(path.join(SITE_REPO, 'build.js'))) fail(`No build.js in ${SITE_REPO} (set NATLAND_SITE_REPO?)`);

const branch = git('branch', '--show-current');
if (branch !== BRANCH) {
  fail(`Website repo is on branch "${branch || '(detached HEAD)'}", not "${BRANCH}".\n  Switch it to ${BRANCH} yourself (git -C ${SITE_REPO} switch ${BRANCH}) and run again.`);
}
const dirty = git('status', '--porcelain');
if (dirty) fail(`Website repo has uncommitted changes — commit or stash them first:\n${dirty.replace(/^/gm, '  ')}`);

const commit = git('rev-parse', '--short', 'HEAD');
const subject = git('log', '-1', '--format=%s');
console.log(`Website repo: ${SITE_REPO} @ ${BRANCH} ${commit} — ${subject}`);

// Build in the default BLOCKED mode (noindex everywhere): never pass SITE_ENV / CONTEXT on.
const env = { ...process.env };
delete env.SITE_ENV;
delete env.CONTEXT;
console.log('Running node build.js …');
const build = spawnSync(process.execPath, ['build.js'], { cwd: SITE_REPO, env, encoding: 'utf8' });
const buildOutput = `${build.stdout || ''}${build.stderr || ''}`;
// Content warnings ("! … may look blurry") go to stderr; the summary line ends stdout.
const lastLine = (build.stdout || '').trim().split('\n').pop() || '';
if (build.status !== 0) fail(`node build.js exited with ${build.status}:\n${buildOutput}`);
const warnings = (build.stderr || '').trim();
if (warnings) console.log(`  ${warnings.split('\n').length} build warning line(s) (content, not fatal)`);
if (!lastLine.startsWith('✓ dist/ (BLOCKED)')) fail(`Unexpected last line of the build (expected "✓ dist/ (BLOCKED) …"):\n  ${lastLine}`);
console.log(`  ${lastLine}`);

// ---------- 2. Copy dist/ → site/ ----------

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DIST, OUT, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(DIST, src);
    if (!rel) return true;
    if (path.basename(src) === '.DS_Store') return false;
    return !EXCLUDE.has(rel.split(path.sep)[0]);
  },
});

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---------- 3. Rewrite root-relative URLs ----------

// "/portfolio/x/?a#b" seen from the page in site/<pageDir>/ → "../portfolio/x/?a#b" etc.
function relativize(url, pageDir) {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  const cut = url.search(/[?#]/);
  const pathname = cut === -1 ? url : url.slice(0, cut);
  const suffix = cut === -1 ? '' : url.slice(cut);
  let rel = path.posix.relative(`/${pageDir}`, pathname);
  if (pathname.endsWith('/') && rel) rel += '/';
  return (rel || './') + suffix;
}

const attrRe = new RegExp(`(\\s(${URL_ATTRS.join('|')})\\s*=\\s*)(["'])(.*?)\\3`, 'gi');

let htmlFiles = 0;
let rewritten = 0;
for (const file of walk(OUT).filter((f) => f.endsWith('.html'))) {
  const pageDir = path.relative(OUT, path.dirname(file)).split(path.sep).join('/');
  const html = fs.readFileSync(file, 'utf8');
  const next = html.replace(attrRe, (m, pre, name, q, value) => {
    const out = LIST_ATTRS.has(name.toLowerCase())
      ? value.split(',').map((cand) => cand.replace(/^(\s*)(\S+)/, (_, ws, u) => ws + relativize(u, pageDir))).join(',')
      : relativize(value, pageDir);
    if (out !== value) rewritten++;
    return pre + q + out + q;
  });
  fs.writeFileSync(file, next);
  htmlFiles++;
}
console.log(`Rewrote ${rewritten} URL attributes in ${htmlFiles} HTML files`);

// main.js loads Lenis by a hardcoded root path; resolve it next to main.js itself instead.
const mainJs = path.join(OUT, 'assets', 'js', 'main.js');
const LENIS_LITERAL = "'/assets/js/lenis-1.1.20.min.js'";
const LENIS_RELATIVE =
  "new URL('lenis-1.1.20.min.js', (document.currentScript || document.querySelector('script[src*=\"main.js\"]')).src).href";
{
  const js = fs.readFileSync(mainJs, 'utf8');
  if (!js.includes(LENIS_LITERAL)) fail(`${LENIS_LITERAL} not found in main.js — the website changed; update this script.`);
  fs.writeFileSync(mainJs, js.replaceAll(LENIS_LITERAL, LENIS_RELATIVE));
}

// ---------- 4. /our-services/ was removed (a Netlify 301 to the home page) ----------

fs.mkdirSync(path.join(OUT, 'our-services'), { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'our-services', 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<title>Natland Group</title>
<meta http-equiv="refresh" content="0; url=../">
<script>location.replace('../' + location.search + location.hash);</script>
</head>
<body>
<p><a href="../">Natland Group</a></p>
</body>
</html>
`,
);

// ---------- 5. Check: no internal root-relative URLs left ----------

const problems = [];
const anyAttrRe = /\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(["'])(.*?)\2/g;
// Site paths in quotes/parens anywhere (inline scripts, JSON, CSS url(), JS string literals).
const sitePathRe = /["'(`]\/(?:assets|portfolio|contact|admin|our-services|favicon|apple-touch-icon)\b[^"')\s]*/g;
for (const file of walk(OUT).filter((f) => /\.(html|js|css)$/.test(f))) {
  const rel = path.relative(OUT, file);
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) {
    for (const [, name, , value] of text.matchAll(anyAttrRe)) {
      const urls = LIST_ATTRS.has(name.toLowerCase()) ? value.split(',').map((c) => c.trim().split(/\s+/)[0]) : [value.trim()];
      for (const u of urls) if (u.startsWith('/') && !u.startsWith('//')) problems.push(`${rel}: ${name}="${u}"`);
    }
  }
  for (const [m] of text.matchAll(sitePathRe)) problems.push(`${rel}: …${m.trim()}`);
}
if (problems.length) fail(`Root-relative URLs left in site/:\n${[...new Set(problems)].slice(0, 50).map((p) => `  ${p}`).join('\n')}`);
console.log('Check: no root-relative internal URLs left in site/');

// ---------- 6. Provenance note ----------

const generated = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
fs.writeFileSync(
  path.join(OUT, 'README.md'),
  `# site/ — copy of the Natland website (dev build)

Generated by \`scripts/sync-site.mjs\`; do not edit by hand — every sync deletes and rewrites this folder.

- Source: website repo, branch \`${BRANCH}\`, commit \`${commit}\` (${subject})
- Generated: ${generated}
- Build mode: BLOCKED (\`noindex\` on every page)
- Online: https://natlandhomes.github.io/natland-design-demo/site/

## Re-sync

With the website repo at \`../natlandhomes\` on \`${BRANCH}\`, clean and up to date:

\`\`\`sh
node scripts/sync-site.mjs        # builds the website, copies dist/ here, rewrites paths
npx serve . -l 4173               # check http://localhost:4173/site/
git add -A site && git commit -m "site: sync website dev @ <commit>"
\`\`\`

## Differences from the real site

- Root-relative URLs are rewritten to page-relative ones (\`main.js\` resolves Lenis next to itself).
- Not copied: \`admin/\` (CMS), \`_headers\`, \`_redirects\`, \`robots.txt\`, \`sitemap.xml\`.
- Netlify redirects do not exist; only \`/our-services/\` gets a small redirect page to the home page.
- GitHub Pages does not use \`site/404.html\` for missing pages under \`site/\`.
`,
);

const bytes = walk(OUT).reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`\n✓ site/ synced from ${BRANCH} ${commit}: ${walk(OUT).length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
