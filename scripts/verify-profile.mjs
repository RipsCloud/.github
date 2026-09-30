import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE_COMMIT = '651adec8d69b8419e0dc3e4f3c280a86c16aa48d';
export const PUBLISHED_BASELINE = Object.freeze({
  'README.md': Object.freeze({ bytes: 455, sha256: '6b0210ec8eac03e2f65e0e3be0e948b2515fac74e3fbfb54216dbffc29a7f308' }),
  'profile/README.md': Object.freeze({ bytes: 3922, sha256: 'fe78ab81dfef858460e2b1caa4390b56b5d7296f04f9d6f39202ac2add6dd09a' }),
  'profile/assets/ripscloud-icon.png': Object.freeze({ bytes: 18822, sha256: '9500328bb8e4efdfc48d970f65526565d9ad8f0b6103250918cc612883d64c58' }),
  'profile/assets/ripscloud-icon.svg': Object.freeze({ bytes: 1001, sha256: 'bf96c23fe211f3cbe3f767565ba00568dd3e5cd8f80994f95576e2112d2d5c78' }),
});

// A separate source review must approve changes to this closed workflow contract.
export const EXPECTED_WORKFLOW = `name: Sandbox profile source checks

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
        with:
          persist-credentials: false
      - name: Setup Node.js
        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
        with:
          node-version: 24
          package-manager-cache: false
      - name: Check sandbox source and published baseline
        run: node scripts/verify-profile.mjs
      - name: Test source and render guards
        run: node --test tests/*.test.mjs
`;

export function verifyPublishedBaseline(files) {
  assert.deepEqual(Object.keys(files).sort(), Object.keys(PUBLISHED_BASELINE).sort(), 'All published baseline files are required.');
  for (const [name, pin] of Object.entries(PUBLISHED_BASELINE)) {
    assert.ok(Buffer.isBuffer(files[name]), 'Published baseline checks require raw bytes.');
    assert.equal(files[name].byteLength, pin.bytes, 'A published baseline file changed size.');
    assert.equal(createHash('sha256').update(files[name]).digest('hex'), pin.sha256, 'A published baseline file changed bytes.');
  }
}

export function validateProfile({ profile, sandboxReadme, workflow, publishedFiles }) {
  verifyPublishedBaseline(publishedFiles);
  for (const source of [profile, sandboxReadme, workflow]) {
    assert.equal(typeof source, 'string');
    assert.ok(Buffer.byteLength(source) <= 32 * 1024, 'Checked source is too large.');
    assert.doesNotMatch(source, /[ \t]+$/m, 'Checked source must have no trailing whitespace.');
    assert.doesNotMatch(source, /\r|\u0000|\uFEFF/, 'Checked source must use plain UTF-8 and LF.');
  }
  assert.equal(workflow, EXPECTED_WORKFLOW, 'The read-only, fail-fast workflow contract changed.');
  assert.match(profile, /^> \*\*Fuente sandbox\. No es el perfil público de la organización\.\*\*/);
  assert.match(profile, /no habilita un servicio alojado ni cambia el perfil público/);
  assert.match(profile, /Producto en preproducción/);
  assert.match(profile, /pruebas locales o sandbox con datos ficticios/);
  assert.match(profile, /No está habilitado para operación\s+productiva/);
  assert.match(profile, /no ejecuta el motor nativo del Ministerio de Salud/);
  assert.match(profile, /no emite el CUV\s+oficial/);
  assert.match(profile, /Todos los planes comerciales de RipsCloud requieren una suscripción activa de\s+PahFacturar Pro por NIT/);
  assert.match(profile, /Base PahFacturar Pro: \*\*\$49\.000 COP por NIT al mes\*\*/);
  assert.match(profile, /Componente RipsCloud: propuesta de plan independiente de la base/);
  assert.match(profile, /Los totales combinados no están aprobados/);
  assert.deepEqual(profile.match(/\$[\d.,]+\s*COP/g), ['$49.000 COP'], 'Only the approved separate base price is allowed.');
  assert.doesNotMatch(profile, /hola@ripscloud\.com|100 documentos|inyección automática de tokens|autenticación centralizada|API estable/i);
  assert.doesNotMatch(profile, /https?:\/\/(?:app|console|api|auth|docs|status)\.ripscloud\.com\b/i);
  assert.equal((profile.match(/<h1\b/gi) ?? []).length, 1, 'The candidate needs one H1.');
  assert.match(profile, /^<h1 align="center">RipsCloud<\/h1>$/m, 'Keep the approved H1 as an unescaped HTML line.');
  assert.doesNotMatch(profile, /[\\`]|^\s*~{3,}/m, 'Do not escape or code-wrap the approved markup.');
  assert.doesNotMatch(profile, /^(?:[ \t]*(?:>[ \t]*|[-+*][ \t]+|\d+[.)][ \t]+))*[ \t]*#(?:[ \t]|$)/m, 'Do not add a Markdown H1.');
  assert.doesNotMatch(profile, /^(?:[ \t]*(?:>[ \t]*|[-+*][ \t]+|\d+[.)][ \t]+))*[ \t]*=+[ \t]*$/m, 'Do not add a setext H1.');
  assert.doesNotMatch(profile, /!\[|^\s*\[[^\]]+\]:|\]\s*\[/m, 'Use only the approved local icon and direct links.');
  const allowedTags = new Set([
    '<p align="center">', '</p>', '<h1 align="center">', '</h1>', '<strong>', '</strong>', '</a>',
    '<a href="https://ripscloud.com">', '<a href="mailto:contacto@ripscloud.com">',
    '<img src="../../profile/assets/ripscloud-icon.png" alt="RipsCloud" width="112" height="112">',
  ]);
  for (const match of profile.matchAll(/<[^>]*>/g)) {
    assert.ok(allowedTags.has(match[0]), 'The candidate contains unapproved raw HTML.');
  }
  const links = [
    ...[...profile.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]),
    ...[...profile.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]),
  ];
  assert.deepEqual(links, ['https://ripscloud.com', 'mailto:contacto@ripscloud.com', 'https://ripscloud.com', 'mailto:contacto@ripscloud.com'], 'Keep only the approved website and contact links.');
  assert.deepEqual(profile.match(/(?:\b[a-z][a-z0-9+.-]*:\/\/|mailto:)[^\s"<>)]*/gi), ['https://ripscloud.com', 'mailto:contacto@ripscloud.com', 'https://ripscloud.com', 'mailto:contacto@ripscloud.com'], 'Do not add GFM URL autolinks.');
  assert.deepEqual(profile.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z0-9-]+\b/gi), ['contacto@ripscloud.com', 'contacto@ripscloud.com', 'contacto@ripscloud.com'], 'Do not add GFM email autolinks.');
  assert.equal(profile.replaceAll('contacto@ripscloud.com', '').includes('@'), false, 'Do not add another email token.');
  assert.doesNotMatch(profile, /\bwww\./i, 'Do not add GFM www autolinks.');
  assert.equal((profile.match(/<img\b/g) ?? []).length, 1, 'Keep one approved icon.');
  assert.match(sandboxReadme, /not the GitHub organization profile/);
  assert.match(sandboxReadme, /does not grant hosted sandbox access or a free evaluation/);
  assert.match(sandboxReadme, /Source and render checks do not run the RC-120 native engine/);
  assert.match(sandboxReadme, /separate publication approval/);
  assert.match(sandboxReadme, /sidebar contact, organization settings, DNS and hosted product state stay unchanged/);
  assert.match(sandboxReadme, /historical RC-142 and RC-144 public criteria remain/);
  assert.match(sandboxReadme, /mailto:contacto@ripscloud\.com/);
  assert.match(sandboxReadme, /not a separate approval control/);
}

export function readRegularFile(root, relative) {
  assert.ok(!path.isAbsolute(relative) && !relative.split('/').includes('..'), 'Use a checked relative source path.');
  let directory = root;
  for (const segment of relative.split('/').slice(0, -1)) {
    directory = path.join(directory, segment);
    const parent = lstatSync(directory);
    assert.ok(parent.isDirectory() && !parent.isSymbolicLink(), 'Checked source directories must not be symlinks.');
  }
  const file = path.join(root, relative);
  const stat = lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Checked source must be a regular file, not a symlink.');
  assert.equal(stat.mode & 0o111, 0, 'Checked source must not be executable.');
  assert.ok(stat.size <= 128 * 1024, 'Checked source exceeds the byte limit.');
  return readFileSync(file);
}

export function readSources(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const publishedFiles = Object.fromEntries(Object.keys(PUBLISHED_BASELINE).map((name) => [name, readRegularFile(root, name)]));
  const decode = (name) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readRegularFile(root, name));
  return {
    profile: decode('sandbox/profile/README.md'),
    sandboxReadme: decode('sandbox/README.md'),
    workflow: decode('.github/workflows/verify-profile.yml'),
    publishedFiles,
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    assert.equal(process.versions.node.split('.')[0], '24', 'Use Node.js 24.');
    validateProfile(readSources());
    console.log('Sandbox source checks passed. Published README and icon bytes are unchanged. CI is read-only and fail-fast.');
  } catch {
    console.error('Sandbox profile source checks failed.');
    process.exitCode = 1;
  }
}
