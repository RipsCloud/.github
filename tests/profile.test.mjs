import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateProfile } from '../scripts/verify-profile.mjs';

const root = new URL('../', import.meta.url);
const fixture = {
  profile: readFileSync(new URL('profile/README.md', root), 'utf8'),
  repositoryReadme: readFileSync(new URL('README.md', root), 'utf8'),
  workflow: readFileSync(new URL('.github/workflows/verify-profile.yml', root), 'utf8'),
  imageExists: true,
};

test('current profile is source-honest and keeps the publication boundary', () => {
  assert.doesNotThrow(() => validateProfile(fixture));
});

test('active service links and old contact fail', () => {
  for (const addition of ['https://app.ripscloud.com', 'https://api.ripscloud.com/swagger', 'mailto:hola@ripscloud.com']) {
    assert.throws(() => validateProfile({ ...fixture, profile: `${fixture.profile}\n${addition}` }));
  }
});

test('free cloud and authentication claims fail', () => {
  for (const addition of ['100 documentos gratis', 'Inyección automática de tokens', 'API estable']) {
    assert.throws(() => validateProfile({ ...fixture, profile: `${fixture.profile}\n${addition}` }));
  }
});

test('removing PF base or combined-price approval fails', () => {
  for (const text of ['$49.000 COP por NIT al mes', 'Los totales combinados no están aprobados']) {
    assert.throws(() => validateProfile({ ...fixture, profile: fixture.profile.replace(text, '') }));
  }
});

test('a missing icon or native-engine warning fails', () => {
  assert.throws(() => validateProfile({ ...fixture, imageExists: false }));
  assert.throws(() => validateProfile({ ...fixture, profile: fixture.profile.replace('no ejecuta el motor nativo del Ministerio de Salud', '') }));
});

test('deploy commands, secrets, write permissions and unpinned actions fail', () => {
  for (const addition of ['run: wrangler pages deploy dist', 'token: ${{ secrets.TOKEN }}', 'contents: write', 'uses: actions/checkout@main']) {
    assert.throws(() => validateProfile({ ...fixture, workflow: `${fixture.workflow}\n${addition}` }));
  }
});

test('removing the public-merge warning fails', () => {
  assert.throws(() => validateProfile({ ...fixture, repositoryReadme: fixture.repositoryReadme.replace('A merge into `main` is a publication action', '') }));
});

test('trailing whitespace and extra workflow commands fail', () => {
  for (const field of ['profile', 'repositoryReadme', 'workflow']) {
    assert.throws(() => validateProfile({ ...fixture, [field]: `${fixture[field]} \n` }));
  }
  assert.throws(() => validateProfile({ ...fixture, workflow: `${fixture.workflow}\n        run: curl https://example.com` }));
});
