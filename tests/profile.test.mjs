import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { BASE_COMMIT, EXPECTED_WORKFLOW, PUBLISHED_BASELINE, readRegularFile, readSources, validateProfile, verifyCheckedCommit, verifyPublishedBaseline } from '../scripts/verify-profile.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = readSources(root);

test('sandbox source passes and both published README files keep accepted bytes', () => {
  assert.equal(BASE_COMMIT, '651adec8d69b8419e0dc3e4f3c280a86c16aa48d');
  assert.equal(PUBLISHED_BASELINE['README.md'].sha256, '6b0210ec8eac03e2f65e0e3be0e948b2515fac74e3fbfb54216dbffc29a7f308');
  assert.equal(PUBLISHED_BASELINE['profile/README.md'].sha256, 'fe78ab81dfef858460e2b1caa4390b56b5d7296f04f9d6f39202ac2add6dd09a');
  assert.doesNotThrow(() => validateProfile(fixture));
});

for (const name of ['README.md', 'profile/README.md']) {
  const original = fixture.publishedFiles[name];
  const sameSize = Buffer.from(original);
  sameSize[0] ^= 1;
  const changes = {
    appended: Buffer.concat([original, Buffer.from('x')]),
    deleted: original.subarray(1),
    'same-size-edit': sameSize,
    CRLF: Buffer.from(original.toString('utf8').replaceAll('\n', '\r\n')),
    'missing-final-newline': original.subarray(0, -1),
    BOM: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]),
  };
  for (const [kind, bytes] of Object.entries(changes)) {
    test(name + ' rejects ' + kind, () => {
      assert.throws(() => verifyPublishedBaseline({ ...fixture.publishedFiles, [name]: bytes }));
    });
  }
  test(name + ' rejects decoded strings', () => {
    assert.throws(() => verifyPublishedBaseline({ ...fixture.publishedFiles, [name]: original.toString('utf8') }));
  });
  test(name + ' rejects an omitted file', () => {
    const files = { ...fixture.publishedFiles };
    delete files[name];
    assert.throws(() => verifyPublishedBaseline(files));
  });
}

for (const name of ['profile/assets/ripscloud-icon.png', 'profile/assets/ripscloud-icon.svg']) {
  test(name + ' rejects a same-size asset edit', () => {
    const bytes = Buffer.from(fixture.publishedFiles[name]);
    bytes[0] ^= 1;
    assert.throws(() => verifyPublishedBaseline({ ...fixture.publishedFiles, [name]: bytes }));
  });
}

test('sandbox-only text can change without altering the published baseline', () => {
  assert.doesNotThrow(() => validateProfile({ ...fixture, profile: fixture.profile + '\nNota de revisión: solo fuente sandbox.\n' }));
});

test('appending a known active hosted claim fails while all disclaimers remain', () => {
  assert.doesNotThrow(() => validateProfile(fixture));
  for (const claim of ['El servicio alojado está habilitado.', 'EL SERVICIO ALOJADO ESTÁ HABILITADO.', 'El servicio\n alojado está\n habilitado.', 'El servicio alojado esta\u0301 habilitado.']) {
    assert.throws(() => validateProfile({ ...fixture, profile: fixture.profile + '\n' + claim }), { message: 'The candidate contains a known active hosted-service claim.' });
  }
});

test('PR and main checks bind HEAD to a full immutable event SHA', () => {
  const pr = 'a'.repeat(40);
  const main = 'b'.repeat(40);
  assert.equal(verifyCheckedCommit({ expected: pr, actual: pr, requireExpected: true }), pr);
  assert.equal(verifyCheckedCommit({ expected: main, actual: main, requireExpected: true }), main);
  assert.equal(verifyCheckedCommit({ actual: pr }), pr);
  assert.throws(() => verifyCheckedCommit({ actual: pr, requireExpected: true }));
  assert.throws(() => verifyCheckedCommit({ expected: pr, actual: main, requireExpected: true }));
  for (const expected of ['', 'main', 'refs/pull/1/merge', 'a'.repeat(39), 'A'.repeat(40), 'a'.repeat(40) + '\n']) {
    assert.throws(() => verifyCheckedCommit({ expected, actual: pr, requireExpected: true }));
  }
  assert.throws(() => verifyCheckedCommit({ expected: pr, actual: 'main' }));
});

test('the workflow cannot omit or alter the immutable checkout and expected SHA', () => {
  const expression = '${{ github.event.pull_request.head.sha || github.sha }}';
  for (const workflow of [
    EXPECTED_WORKFLOW.replace('          ref: ' + expression + '\n', ''),
    EXPECTED_WORKFLOW.replace('ref: ' + expression, 'ref: main'),
    EXPECTED_WORKFLOW.replace('ref: ' + expression, 'ref: refs/pull/1/merge'),
    EXPECTED_WORKFLOW.replace('EXPECTED_SOURCE_SHA: ' + expression, 'EXPECTED_SOURCE_SHA: ' + 'a'.repeat(40)),
    EXPECTED_WORKFLOW.replace('          EXPECTED_SOURCE_SHA: ' + expression + '\n', ''),
  ]) {
    assert.throws(() => validateProfile({ ...fixture, workflow }));
  }
});

test('known unapproved service, contact and authentication claims fail', () => {
  for (const text of ['https://app.ripscloud.com', 'https://api.ripscloud.com/swagger', 'mailto:hola@ripscloud.com', '100 documentos gratis', 'Inyección automática de tokens', 'API estable']) {
    assert.throws(() => validateProfile({ ...fixture, profile: fixture.profile + '\n' + text }));
  }
});

test('required state, price, native and publication warnings cannot be removed', () => {
  for (const text of ['Fuente sandbox.', 'Producto en preproducción', '$49.000 COP por NIT al mes', 'Los totales combinados no están aprobados', 'no ejecuta el motor nativo del Ministerio de Salud']) {
    assert.throws(() => validateProfile({ ...fixture, profile: fixture.profile.replace(text, '') }));
  }
  for (const text of ['separate publication approval', 'Source and render checks do not run the RC-120 native engine', 'does not grant hosted sandbox access or a free evaluation']) {
    assert.throws(() => validateProfile({ ...fixture, sandboxReadme: fixture.sandboxReadme.replace(text, '') }));
  }
});

test('combined prices and unsafe HTML or links fail', () => {
  for (const text of ['$99.000 COP combined', '<script>alert(1)</script>', '<img src="https://example.com/a.png">', '<a href="javascript:alert(1)">x</a>', '[x](javascript:alert(1))', '![x](https://example.com/x.png)', '[x]: https://example.com']) {
    assert.throws(() => validateProfile({ ...fixture, profile: fixture.profile + '\n' + text }));
  }
  assert.throws(() => validateProfile({ ...fixture, profile: fixture.profile.replace('../../profile/assets/ripscloud-icon.png', 'assets/ripscloud-icon.png') }));
});

test('GFM autolinks and alternate Markdown H1 forms fail in source CI', () => {
  for (const text of ['https://example.com/privacy', 'patient@example.com', 'x@example.c', 'x@example.1', 'contacto@ripscloud.com', 'www.example.com', 'ftp://example.com', 'Extra heading\n=============', '  # Extra heading', '> # Extra heading', '- # Extra heading']) {
    assert.throws(() => validateProfile({ ...fixture, profile: fixture.profile + '\n' + text + '\n' }));
  }
});

test('the approved H1 cannot be escaped, indented or code-wrapped', () => {
  const h1 = '<h1 align="center">RipsCloud</h1>';
  for (const replacement of ['\\' + h1, '    ' + h1, '`' + h1 + '`', '~~~\n' + h1 + '\n~~~']) {
    assert.throws(() => validateProfile({ ...fixture, profile: fixture.profile.replace(h1, replacement) }));
  }
});

for (const [name, workflow] of Object.entries({
  'disabled job': EXPECTED_WORKFLOW.replace('  verify:\n', '  verify:\n    if: false\n'),
  'ignored failure': EXPECTED_WORKFLOW.replace('      - name: Test source and render guards\n', '      - name: Test source and render guards\n        continue-on-error: true\n'),
  secrets: EXPECTED_WORKFLOW + 'env:\n  TOKEN: ${{ secrets.TOKEN }}\n',
  'write permission': EXPECTED_WORKFLOW.replace('contents: read', 'contents: write'),
  'unpinned action': EXPECTED_WORKFLOW.replace('actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803', 'actions/checkout@main'),
  'extra command': EXPECTED_WORKFLOW + '        run: curl https://example.com\n',
  'masked command': EXPECTED_WORKFLOW.replace('node scripts/verify-profile.mjs', 'node scripts/verify-profile.mjs || true'),
  'publish copy': EXPECTED_WORKFLOW + '        run: cp sandbox/profile/README.md profile/README.md\n',
  'deploy command': EXPECTED_WORKFLOW + '        run: wrangler pages deploy dist\n',
})) {
  test('the closed CI contract rejects ' + name, () => {
    assert.throws(() => validateProfile({ ...fixture, workflow }));
  });
}

test('checked sandbox sources reject whitespace, BOM, CRLF, NUL and excess size', () => {
  for (const field of ['profile', 'sandboxReadme', 'workflow']) {
    for (const suffix of [' \n', '\uFEFF', '\r\n', '\u0000', 'x'.repeat(33 * 1024)]) {
      assert.throws(() => validateProfile({ ...fixture, [field]: fixture[field] + suffix }));
    }
  }
});

test('regular-file loader rejects missing files, symlinks and executable files', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rc144-source-guard-'));
  try {
    for (const name of Object.keys(PUBLISHED_BASELINE)) {
      mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      copyFileSync(path.join(root, name), path.join(dir, name));
    }
    for (const name of ['README.md', 'profile/README.md']) {
      const file = path.join(dir, name);
      const target = file + '.saved';
      writeFileSync(target, readFileSync(file));
      unlinkSync(file);
      assert.throws(() => readRegularFile(dir, name));
      symlinkSync(target, file);
      assert.throws(() => readRegularFile(dir, name));
      unlinkSync(file);
      copyFileSync(target, file);
      chmodSync(file, 0o755);
      assert.throws(() => readRegularFile(dir, name));
      chmodSync(file, 0o644);
      assert.doesNotThrow(() => readRegularFile(dir, name));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('regular-file loader rejects parent-directory symlinks and oversized files', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rc144-parent-guard-'));
  try {
    mkdirSync(path.join(dir, 'real-assets'));
    copyFileSync(path.join(root, 'profile/assets/ripscloud-icon.png'), path.join(dir, 'real-assets', 'ripscloud-icon.png'));
    symlinkSync(path.join(dir, 'real-assets'), path.join(dir, 'profile'));
    assert.throws(() => readRegularFile(dir, 'profile/ripscloud-icon.png'));
    unlinkSync(path.join(dir, 'profile'));
    mkdirSync(path.join(dir, 'profile'));
    symlinkSync(path.join(dir, 'real-assets'), path.join(dir, 'profile', 'assets'));
    assert.throws(() => readRegularFile(dir, 'profile/assets/ripscloud-icon.png'));
    writeFileSync(path.join(dir, 'oversized'), Buffer.alloc(129 * 1024));
    assert.throws(() => readRegularFile(dir, 'oversized'));
    assert.throws(() => readRegularFile(dir, '../outside'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
