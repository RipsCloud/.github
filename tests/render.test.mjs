import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPreview, normalizeToolModule, prepareOutputDirectory, sourceRoot, writeNewArtifact } from '../scripts/render-profile.mjs';

const icon = readFileSync(path.join(sourceRoot, 'profile/assets/ripscloud-icon.png'));
const body = '<h1 align="center">RipsCloud</h1><img src="../../profile/assets/ripscloud-icon.png" alt="RipsCloud" width="112" height="112"><a href="https://ripscloud.com">Web</a><a href="mailto:contacto@ripscloud.com">Contacto</a><a href="https://ripscloud.com">Web</a><a href="mailto:contacto@ripscloud.com">Contacto</a>';

test('optional tool imports support ESM and CommonJS namespaces', () => {
  const esm = { Marked: class {} };
  const cjs = { chromium: {} };
  assert.equal(normalizeToolModule(esm), esm);
  assert.equal(normalizeToolModule({ default: cjs }), cjs);
  assert.throws(() => normalizeToolModule(null));
});

test('preview is self-contained and keeps the local-only marker', () => {
  const html = buildPreview(body, icon);
  assert.match(html, /<html lang="es">/);
  assert.match(html, /No es el perfil público de GitHub/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /src="data:image\/png;base64,/);
  assert.doesNotMatch(html, /<script|<link|src="https?:|@import/i);
});

test('renderer rejects remote, executable and extra content', () => {
  for (const addition of ['<script>x</script>', '<iframe src="https://example.com"></iframe>', '<img src="https://example.com/a.png">', '<p onclick="x()">x</p>', '<style>x</style>', '<a href="javascript:x()">x</a>']) {
    assert.throws(() => buildPreview(body + addition, icon));
  }
  assert.throws(() => buildPreview(body.replace('../../profile/assets/ripscloud-icon.png', 'assets/ripscloud-icon.png'), icon));
  assert.throws(() => buildPreview(body + '<h1>Other</h1>', icon));
});

test('renderer rejects an altered icon and excess body size', () => {
  const edited = Buffer.from(icon);
  edited[0] ^= 1;
  assert.throws(() => buildPreview(body, edited));
  assert.throws(() => buildPreview(body + 'x'.repeat(129 * 1024), icon));
});

test('output guard rejects source paths before directory creation', () => {
  assert.throws(() => prepareOutputDirectory(sourceRoot));
  assert.throws(() => prepareOutputDirectory(path.join(sourceRoot, 'generated', 'preview')));
  assert.throws(() => prepareOutputDirectory('relative-output'));
});

test('output guard rejects a symlink to source and allows an external directory', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'rc144-render-guard-'));
  try {
    symlinkSync(sourceRoot, path.join(temp, 'source'));
    assert.throws(() => prepareOutputDirectory(path.join(temp, 'source', 'generated')));
    const output = prepareOutputDirectory(path.join(temp, 'outside', 'preview'));
    assert.equal(output, path.join(realpathSync(temp), 'outside', 'preview'));
    mkdirSync(path.join(temp, 'exists'));
    assert.equal(prepareOutputDirectory(path.join(temp, 'exists')), path.join(realpathSync(temp), 'exists'));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('artifact writes reject existing files and symlinks without changing their target', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'rc144-artifact-guard-'));
  try {
    const output = prepareOutputDirectory(path.join(temp, 'output'));
    const target = path.join(temp, 'target');
    writeFileSync(target, 'preserve');
    symlinkSync(target, path.join(output, 'profile-320.png'));
    assert.throws(() => writeNewArtifact(output, 'profile-320.png', Buffer.from('replacement')));
    assert.equal(readFileSync(target, 'utf8'), 'preserve');
    assert.throws(() => prepareOutputDirectory(output));
    writeNewArtifact(output, 'proof.json', 'first');
    assert.throws(() => writeNewArtifact(output, 'proof.json', 'second'));
    assert.equal(readFileSync(path.join(output, 'proof.json'), 'utf8'), 'first');
    assert.throws(() => writeNewArtifact(output, '../outside', 'x'));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
