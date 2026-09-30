import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PUBLISHED_BASELINE, readSources, validateProfile } from './verify-profile.mjs';

export const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconTag = '<img src="../../profile/assets/ripscloud-icon.png" alt="RipsCloud" width="112" height="112">';
const contained = (parent, child) => child === parent || child.startsWith(parent + path.sep);

export function prepareOutputDirectory(directory, root = sourceRoot) {
  assert.ok(typeof directory === 'string' && path.isAbsolute(directory), 'Use an absolute external output directory.');
  const requested = path.resolve(directory);
  const realRoot = realpathSync(root);
  assert.ok(!contained(path.resolve(root), requested), 'Do not write preview output inside source.');
  let ancestor = requested;
  while (!existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    assert.notEqual(parent, ancestor, 'Output needs an existing ancestor.');
    ancestor = parent;
  }
  assert.ok(!contained(realRoot, realpathSync(ancestor)), 'Output must not resolve inside source.');
  mkdirSync(requested, { recursive: true });
  const result = realpathSync(requested);
  assert.ok(!contained(realRoot, result), 'Output must stay outside source.');
  assert.equal(readdirSync(result).length, 0, 'Use an empty external output directory.');
  return result;
}

export function writeNewArtifact(directory, name, bytes) {
  assert.ok(typeof name === 'string' && /^[a-z0-9][a-z0-9.-]*$/.test(name), 'Use a plain artifact filename.');
  writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
}

export async function loadTool(name, modulesPath) {
  assert.ok(typeof modulesPath === 'string' && path.isAbsolute(modulesPath), 'Set an absolute external tools path.');
  const packageRoot = realpathSync(path.join(modulesPath, ...name.split('/')));
  const entry = realpathSync(createRequire(import.meta.url).resolve(name, { paths: [modulesPath] }));
  assert.ok(contained(packageRoot, entry), 'Use the package in the selected tools directory.');
  const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(metadata.name, name, 'The selected tools package does not match.');
  const namespace = await import(pathToFileURL(entry).href);
  return { module: normalizeToolModule(namespace), entry, version: metadata.version };
}

export function normalizeToolModule(namespace) {
  assert.ok(namespace && typeof namespace === 'object', 'The selected tool module is unavailable.');
  return namespace.default ?? namespace;
}

export function assertPreviewGeometry(metrics, expectedZoom) {
  for (const key of ['zoom', 'contentWidth', 'viewportWidth', 'blockOverlaps', 'clippedTextRects', 'textBlocks', 'minTextFontSize', 'minEffectiveTextFontSize']) {
    assert.ok(Number.isFinite(metrics[key]), 'Render geometry must be finite.');
  }
  assert.equal(metrics.zoom, expectedZoom, 'The requested local CSS zoom must be applied.');
  assert.ok(metrics.contentWidth <= metrics.viewportWidth, 'Local preview must not overflow horizontally.');
  assert.equal(metrics.blockOverlaps, 0, 'Local preview blocks must not overlap.');
  assert.equal(metrics.clippedTextRects, 0, 'Local preview text must not be clipped.');
  assert.ok(metrics.textBlocks > 0, 'Check visible text blocks.');
  assert.ok(metrics.minTextFontSize >= 16 && metrics.minEffectiveTextFontSize >= 16, 'Local preview text must remain readable.');
}

// This is a preview of checked repository source, not an untrusted Markdown service.
export function buildPreview(body, iconBytes) {
  assert.equal(typeof body, 'string');
  assert.ok(Buffer.byteLength(body) <= 128 * 1024, 'Rendered candidate is too large.');
  assert.ok(Buffer.isBuffer(iconBytes));
  assert.equal(createHash('sha256').update(iconBytes).digest('hex'), PUBLISHED_BASELINE['profile/assets/ripscloud-icon.png'].sha256, 'Use the unchanged approved icon.');
  assert.equal((body.match(/<h1\b/gi) ?? []).length, 1, 'The preview needs one H1.');
  assert.equal((body.match(/<img\b/gi) ?? []).length, 1, 'The preview needs one icon.');
  assert.ok(body.includes(iconTag), 'The approved icon path must resolve after relocation.');
  assert.doesNotMatch(body, /<(?:script|iframe|object|embed|link|style|form|input|button|textarea|base|meta|svg|math)\b|\bon\w+\s*=|\b(?:srcset|style)\s*=/i, 'The preview must not add executable or remote content.');
  assert.deepEqual([...body.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]), ['https://ripscloud.com', 'mailto:contacto@ripscloud.com', 'https://ripscloud.com', 'mailto:contacto@ripscloud.com'], 'Keep only the approved non-fetched links.');
  const embedded = body.replace(iconTag, `<img src="data:image/png;base64,${iconBytes.toString('base64')}" alt="RipsCloud" width="112" height="112">`);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>RipsCloud · fuente de perfil sandbox</title>
<style>
* { box-sizing: border-box; }
html { color-scheme: light; background: #f6f8fa; }
body { margin: 0; color: #1f2328; font: 16px/1.6 system-ui, sans-serif; }
.preview-note { padding: 12px 20px; background: #eaeef2; border-bottom: 1px solid #8c959f; }
.preview-note p { max-width: 896px; margin: auto; }
main { max-width: 896px; margin: 24px auto; padding: 28px; background: white; border: 1px solid #d0d7de; border-radius: 6px; }
h1 { font-size: 32px; line-height: 1.25; }
h2 { margin-top: 28px; font-size: 24px; line-height: 1.3; border-bottom: 1px solid #d0d7de; padding-bottom: 6px; }
p, li, a { overflow-wrap: anywhere; }
a { color: #0550ae; text-decoration: underline; }
a:focus-visible { outline: 3px solid #1f2328; outline-offset: 3px; border-radius: 2px; }
img { max-width: 100%; height: auto; }
blockquote { margin: 0 0 24px; padding: 12px 16px; border-left: 4px solid #57606a; background: #f6f8fa; color: #1f2328; }
blockquote p { margin: 0; }
ul { padding-left: 24px; }
@media (max-width: 600px) { main { margin: 12px; padding: 18px; } h1 { font-size: 28px; } h2 { font-size: 22px; } }
</style>
</head>
<body>
<header class="preview-note"><p>Vista local de fuente sandbox. No es el perfil público de GitHub.</p></header>
<main aria-label="Fuente de perfil sandbox">
${embedded}
</main>
</body>
</html>
`;
}

export async function renderToDirectory(directory) {
  assert.equal(process.versions.node.split('.')[0], '24', 'Use Node.js 24.');
  const sources = readSources(sourceRoot);
  validateProfile(sources);
  const marked = await loadTool('marked', process.env.PROFILE_RENDER_MODULES);
  assert.equal(marked.version, '17.0.5', 'Use the reviewed Marked version.');
  const parser = new marked.module.Marked({ gfm: true, breaks: false, async: false });
  const html = buildPreview(parser.parse(sources.profile), sources.publishedFiles['profile/assets/ripscloud-icon.png']);
  const output = prepareOutputDirectory(directory);
  const htmlPath = path.join(output, 'profile.html');
  writeFileSync(htmlPath, html, { encoding: 'utf8', flag: 'wx' });
  return { output, htmlPath, htmlSha256: createHash('sha256').update(html).digest('hex'), markedVersion: marked.version };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await renderToDirectory(process.argv[2]);
    console.log(`Local sandbox preview: ${result.htmlPath}. No server was started.`);
  } catch {
    console.error('Local sandbox preview failed. Check source, tools and external output path.');
    process.exitCode = 1;
  }
}
