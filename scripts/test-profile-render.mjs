import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASE_COMMIT, PUBLISHED_BASELINE, readSources, validateProfile } from './verify-profile.mjs';
import { loadTool, prepareOutputDirectory, renderToDirectory, sourceRoot, writeNewArtifact } from './render-profile.mjs';

const output = prepareOutputDirectory(process.argv[2]);
const proof = { status: 'failed', scope: 'local-sandbox-source-render-only', timestamp: new Date().toISOString(), base: BASE_COMMIT, widths: [], browserPageErrors: 0, browserConsoleErrors: 0, externalRequestAttempts: 0, networkRequests: 0, serverStarted: false, nativeEngineStarted: false, browserStarted: false, browserClosed: null, failureStage: 'source' };
let browser;
try {
  const sources = readSources(sourceRoot);
  validateProfile(sources);
  const git = (args) => execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8', env: { PATH: process.env.PATH, LANG: 'C' } }).trim();
  proof.head = git(['rev-parse', 'HEAD']);
  proof.tree = git(['rev-parse', 'HEAD^{tree}']);
  proof.sourceDirty = git(['status', '--porcelain']).length !== 0;
  const sourcePaths = ['README.md', 'profile/README.md', 'profile/assets/ripscloud-icon.png', 'profile/assets/ripscloud-icon.svg', 'sandbox/README.md', 'sandbox/profile/README.md', '.github/workflows/verify-profile.yml', 'scripts/verify-profile.mjs', 'scripts/render-profile.mjs', 'scripts/test-profile-render.mjs', 'tests/profile.test.mjs', 'tests/render.test.mjs'];
  proof.sourceFiles = Object.fromEntries(sourcePaths.map((name) => {
    const bytes = readFileSync(path.join(sourceRoot, name));
    return [name, { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }];
  }));
  proof.publishedBaseline = PUBLISHED_BASELINE;
  proof.failureStage = 'render';
  const rendered = await renderToDirectory(output);
  proof.renderedHtmlSha256 = rendered.htmlSha256;
  proof.failureStage = 'tools';
  const playwright = await loadTool('playwright', process.env.PROFILE_BROWSER_MODULES);
  const axe = await loadTool('axe-core', process.env.PROFILE_AXE_MODULES);
  proof.tools = { node: process.versions.node, marked: rendered.markedVersion, playwright: playwright.version, axe: axe.version };
  const axeSource = readFileSync(axe.entry, 'utf8');
  const previewUrl = pathToFileURL(rendered.htmlPath).href;
  proof.failureStage = 'browser-launch';
  browser = await playwright.module.chromium.launch({ headless: true, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: 'C' } });
  proof.browserStarted = true;
  proof.browserVersion = browser.version();
  for (const width of [320, 390, 1280]) {
    proof.failureStage = 'browser-navigation';
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    try {
      await context.route('**/*', async (route) => {
        const url = route.request().url();
        if (url === previewUrl || url.startsWith('data:image/png;base64,')) {
          await route.continue();
        } else {
          proof.externalRequestAttempts += 1;
          await route.abort();
        }
      });
      context.on('request', (request) => {
        if (/^https?:/i.test(request.url())) proof.networkRequests += 1;
      });
      const page = await context.newPage();
      page.on('pageerror', () => { proof.browserPageErrors += 1; });
      page.on('console', (message) => { if (message.type() === 'error') proof.browserConsoleErrors += 1; });
      await page.goto(previewUrl, { waitUntil: 'load', timeout: 15000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode()));
      });
      proof.failureStage = 'browser-structure';
      const structure = await page.evaluate(() => ({
        h1: document.querySelectorAll('h1').length,
        main: document.querySelectorAll('main').length,
        images: document.images.length,
        iconLoaded: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
        scriptElements: document.scripts.length,
        contentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        sandboxMarker: document.body.textContent.includes('Fuente sandbox. No es el perfil público de la organización.'),
      }));
      assert.equal(structure.h1, 1);
      assert.equal(structure.main, 1);
      assert.equal(structure.images, 1);
      assert.equal(structure.iconLoaded, true);
      assert.equal(structure.scriptElements, 0);
      assert.equal(structure.sandboxMarker, true);
      assert.ok(structure.contentWidth <= structure.viewportWidth, 'Local preview overflowed.');
      proof.failureStage = 'browser-focus';
      const expectedLinks = ['https://ripscloud.com', 'mailto:contacto@ripscloud.com', 'https://ripscloud.com', 'mailto:contacto@ripscloud.com'];
      for (const href of expectedLinks) {
        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => ({ href: document.activeElement?.getAttribute('href'), outlineStyle: getComputedStyle(document.activeElement).outlineStyle, outlineWidth: getComputedStyle(document.activeElement).outlineWidth }));
        assert.equal(focus.href, href);
        assert.equal(focus.outlineStyle, 'solid');
        assert.ok(Number.parseFloat(focus.outlineWidth) >= 2, 'Keyboard focus must be visible.');
      }
      proof.failureStage = 'browser-accessibility';
      await page.evaluate(axeSource);
      const accessibility = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return { violations: result.violations.map((rule) => ({ id: rule.id, impact: rule.impact, nodeCount: rule.nodes.length })), incomplete: result.incomplete.map((rule) => rule.id), passes: result.passes.length };
      });
      proof.lastAccessibility = { width, ...accessibility };
      assert.deepEqual(accessibility.violations, [], 'Local preview failed accessibility checks.');
      proof.failureStage = 'browser-evidence';
      const screenshot = await page.screenshot({ fullPage: true });
      writeNewArtifact(output, `profile-${width}.png`, screenshot);
      proof.widths.push({ width, structure, focusChecks: 4, accessibility });
    } finally {
      await context.close();
    }
  }
  proof.failureStage = 'browser-request-and-error-counts';
  assert.equal(proof.externalRequestAttempts, 0);
  assert.equal(proof.networkRequests, 0);
  assert.equal(proof.browserPageErrors, 0);
  assert.equal(proof.browserConsoleErrors, 0);
  delete proof.lastAccessibility;
  proof.status = 'passed';
  proof.failureStage = null;
} catch (error) {
  proof.failureClass = error instanceof assert.AssertionError ? 'assertion' : 'runtime';
  process.exitCode = 1;
} finally {
  if (browser) {
    try { await browser.close(); proof.browserClosed = true; } catch { proof.browserClosed = false; proof.status = 'failed'; process.exitCode = 1; }
  }
  writeNewArtifact(output, 'profile-render-proof.json', JSON.stringify(proof, null, 2) + '\n');
}
console.log(`Local sandbox render ${proof.status}. Widths checked: ${proof.widths.length}. No server or native engine was started.`);
