import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateProfile({ profile, repositoryReadme, workflow, imageExists }) {
  for (const source of [profile, repositoryReadme, workflow]) {
    assert.doesNotMatch(source, /[ \t]+$/m, 'Checked source must have no trailing whitespace.');
  }
  assert.match(profile, /Producto en preproducción/);
  assert.match(profile, /pruebas locales o sandbox con datos ficticios/);
  assert.match(profile, /No está habilitado para operación\s+productiva/);
  assert.match(profile, /no ejecuta el motor nativo del Ministerio de Salud/);
  assert.match(profile, /no emite el CUV\s+oficial/);
  assert.match(profile, /Todos los planes comerciales de RipsCloud requieren una suscripción activa de\s+PahFacturar Pro por NIT/);
  assert.match(profile, /Base PahFacturar Pro: \*\*\$49\.000 COP por NIT al mes\*\*/);
  assert.match(profile, /Componente RipsCloud: propuesta de plan independiente de la base/);
  assert.match(profile, /Los totales combinados no están aprobados/);

  for (const source of [profile, repositoryReadme]) {
    assert.match(source, /mailto:contacto@ripscloud\.com/);
    assert.doesNotMatch(source, /hola@ripscloud\.com/i);
    assert.doesNotMatch(source, /https?:\/\/(?:app|console|api|auth|docs|status)\.ripscloud\.com\b/i);
  }
  assert.doesNotMatch(profile, /100 documentos|inyección automática de tokens|autenticación centralizada|API estable/i);
  assert.equal((profile.match(/<h1\b/gi) ?? []).length, 1);
  assert.ok(imageExists, 'The existing profile icon must resolve locally.');
  assert.match(repositoryReadme, /A merge into `main` is a publication action/);
  assert.match(repositoryReadme, /sidebar email and description are separate settings/);

  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node --test tests\/profile\.test\.mjs/);
  assert.doesNotMatch(workflow, /secrets\.|: write\b|wrangler|pages deploy|workflow_dispatch|pull_request_target/);
  assert.deepEqual(
    [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]),
    [
      'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
      'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
    ],
  );
  assert.deepEqual(
    [...workflow.matchAll(/^\s+run:\s*(.+)$/gm)].map((match) => match[1]),
    ['node scripts/verify-profile.mjs', 'node --test tests/profile.test.mjs'],
  );
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const root = path.resolve(path.dirname(scriptPath), '..');
  const profile = readFileSync(path.join(root, 'profile/README.md'), 'utf8');
  const icon = profile.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1];
  assert.ok(icon && !icon.includes('://') && !path.isAbsolute(icon), 'Use the existing local profile icon.');
  validateProfile({
    profile,
    repositoryReadme: readFileSync(path.join(root, 'README.md'), 'utf8'),
    workflow: readFileSync(path.join(root, '.github/workflows/verify-profile.yml'), 'utf8'),
    imageExists: existsSync(path.resolve(root, 'profile', icon)),
  });
  console.log('Profile source checks passed: availability, contact, pricing, icon and no-deployment CI.');
}
