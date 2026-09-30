import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASE_COMMIT, PUBLISHED_BASELINE, readSources, validateProfile, verifyCheckedCommit } from './verify-profile.mjs';
import { assertPreviewGeometry, loadTool, prepareOutputDirectory, renderToDirectory, sourceRoot, writeNewArtifact } from './render-profile.mjs';

const output = prepareOutputDirectory(process.argv[2]);
const proof = { status: 'failed', scope: 'local-sandbox-source-render-only', timestamp: new Date().toISOString(), base: BASE_COMMIT, widths: [], zoomChecks: [], browserPageErrors: 0, browserConsoleErrors: 0, externalRequestAttempts: 0, networkRequests: 0, serverStarted: false, nativeEngineStarted: false, browserStarted: false, browserClosed: null, failureStage: 'source' };
let browser;
try {
  const sources = readSources(sourceRoot);
  validateProfile(sources);
  const git = (args) => execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8', env: { PATH: process.env.PATH, LANG: 'C' } }).trim();
  proof.head = git(['rev-parse', 'HEAD']);
  proof.expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
  proof.checkedSourceSha = verifyCheckedCommit({ expected: proof.expectedSourceSha, actual: proof.head, requireExpected: true });
  proof.tree = git(['rev-parse', 'HEAD^{tree}']);
  proof.sourceDirty = git(['status', '--porcelain']).length !== 0;
  assert.equal(proof.sourceDirty, false, 'Freeze a clean commit before recording local render proof.');
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
  const cases = [
    ...[320, 390, 1280].map((width) => ({ width, zoom: 1, screenshot: `profile-${width}.png` })),
    { width: 1280, zoom: 2, screenshot: 'profile-1280-zoom-200.png' },
  ];
  for (const { width, zoom, screenshot: screenshotName } of cases) {
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
      if (zoom !== 1) {
        await page.evaluate((factor) => { document.documentElement.style.zoom = String(factor); }, zoom);
      }
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
      proof.failureStage = 'browser-geometry';
      const geometry = await page.evaluate(() => {
        const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom);
        const blocks = [...document.querySelector('main').children].map((element) => element.getBoundingClientRect()).filter((rect) => rect.height > 0);
        let blockOverlaps = 0;
        for (let index = 1; index < blocks.length; index += 1) {
          if (blocks[index].top < blocks[index - 1].bottom - 0.5) blockOverlaps += 1;
        }
        let clippedTextRects = 0;
        let minTextFontSize = Infinity;
        const textBlocks = [...document.querySelectorAll('header p, main p, main li, main h1, main h2')].filter((element) => element.textContent.trim());
        for (const element of textBlocks) {
          const bounds = element.getBoundingClientRect();
          minTextFontSize = Math.min(minTextFontSize, Number.parseFloat(getComputedStyle(element).fontSize));
          const range = document.createRange();
          range.selectNodeContents(element);
          for (const rect of range.getClientRects()) {
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1) clippedTextRects += 1;
          }
        }
        return { zoom, contentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth, blockOverlaps, clippedTextRects, textBlocks: textBlocks.length, minTextFontSize, minEffectiveTextFontSize: minTextFontSize * zoom };
      });
      assertPreviewGeometry(geometry, zoom);
      proof.failureStage = 'browser-focus';
      const expectedLinks = ['https://ripscloud.com', 'mailto:contacto@ripscloud.com', 'https://ripscloud.com', 'mailto:contacto@ripscloud.com'];
      for (const href of expectedLinks) {
        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => {
          const element = document.activeElement;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom);
          const padding = (Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)) * zoom;
          return { href: element.getAttribute('href'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, visible: rect.left - padding >= -1 && rect.right + padding <= innerWidth + 1 && rect.top - padding >= -1 && rect.bottom + padding <= innerHeight + 1 };
        });
        assert.equal(focus.href, href);
        assert.equal(focus.outlineStyle, 'solid');
        assert.ok(Number.parseFloat(focus.outlineWidth) >= 2, 'Keyboard focus must be visible.');
        assert.equal(focus.visible, true, 'Keyboard focus and its outline must remain in the viewport.');
      }
      proof.failureStage = 'browser-accessibility';
      await page.evaluate(axeSource);
      const accessibility = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return { violations: result.violations.map((rule) => ({ id: rule.id, impact: rule.impact, nodeCount: rule.nodes.length })), incomplete: result.incomplete.map((rule) => rule.id), passes: result.passes.length };
      });
      proof.lastAccessibility = { width, zoom, ...accessibility };
      assert.deepEqual(accessibility.violations, [], 'Local preview failed accessibility checks.');
      proof.failureStage = 'browser-evidence';
      const screenshot = await page.screenshot({ fullPage: true });
      writeNewArtifact(output, screenshotName, screenshot);
      const result = { width, zoom, structure, geometry, focusChecks: 4, focusVisible: true, accessibility };
      if (zoom === 1) proof.widths.push(result);
      else proof.zoomChecks.push({
        ...result,
        percent: 200,
        technique: 'CSS document zoom: document.documentElement.style.zoom = 2',
        limits: 'Local static-preview geometry only. This does not exercise browser UI zoom or its media-query behavior.',
      });
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
console.log(`Local sandbox render ${proof.status}. Widths checked: ${proof.widths.length}. Zoom checks: ${proof.zoomChecks.length}. No server or native engine was started.`);
