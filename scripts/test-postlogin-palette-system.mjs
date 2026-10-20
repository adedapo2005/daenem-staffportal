import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/postlogin-palette-system.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function('exports', compiled)(exports);

const {
  POSTLOGIN_DEFAULT_PALETTE,
  postLoginPalettes,
  normalizePostLoginPaletteId,
  postLoginPaletteVariables,
} = exports;

function rgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}
function luminance(hex) {
  const channels = rgb(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(a, b) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}

test('approved Option 2 + Option B is the only default', () => {
  assert.equal(POSTLOGIN_DEFAULT_PALETTE, 'ocean-azure-prestige');
  const approved = postLoginPalettes.find((palette) => palette.id === POSTLOGIN_DEFAULT_PALETTE);
  assert.ok(approved);
  assert.equal(approved.name, 'Ocean Sapphire - Azure Prestige');
  assert.equal(approved.anchor, '#173A63');
  assert.equal(approved.primary, '#2563EB');
  assert.equal(approved.accent, '#06B6D4');
  assert.equal(approved.highlight, '#F59E0B');
  assert.equal(approved.tint, '#EAF3FF');
  assert.equal(approved.canvas, '#F1F5F9');
});

test('nineteen named palettes remain unique and selectable', () => {
  assert.equal(postLoginPalettes.length, 19);
  assert.equal(new Set(postLoginPalettes.map((palette) => palette.id)).size, 19);
  assert.equal(new Set(postLoginPalettes.map((palette) => palette.name)).size, 19);
  for (const palette of postLoginPalettes) {
    assert.match(palette.id, /^[a-z0-9-]+$/);
    assert.ok(palette.note.length >= 28);
    for (const role of ['anchor', 'primary', 'accent', 'highlight', 'tint', 'canvas', 'surface', 'ink']) {
      assert.match(palette[role], /^#[0-9A-F]{6}$/i, `${palette.id} ${role}`);
    }
  }
});

test('every palette provides readable core text pairings', () => {
  for (const palette of postLoginPalettes) {
    assert.ok(contrast(palette.ink, palette.surface) >= 7, `${palette.id}: ink/surface contrast`);
    assert.ok(contrast(palette.ink, palette.canvas) >= 7, `${palette.id}: ink/canvas contrast`);
    assert.ok(contrast(palette.onAnchor, palette.anchor) >= 4.5, `${palette.id}: navigation contrast`);
    assert.ok(contrast(palette.onPrimary, palette.primary) >= 4.5, `${palette.id}: primary action contrast`);
  }
});

test('unknown values fail closed to the approved default', () => {
  assert.equal(normalizePostLoginPaletteId('not-approved'), POSTLOGIN_DEFAULT_PALETTE);
  assert.equal(normalizePostLoginPaletteId(undefined), POSTLOGIN_DEFAULT_PALETTE);
  assert.equal(normalizePostLoginPaletteId('oxblood-opal'), 'oxblood-opal');
});

test('runtime variables use semantic palette roles, not page-specific colours', () => {
  const vars = postLoginPaletteVariables('plum-glacier');
  assert.equal(vars['--stage1-anchor'], '#382A48');
  assert.equal(vars['--stage1-primary'], '#7650AF');
  assert.equal(vars['--stage1-accent'], '#69BACC');
  assert.equal(vars['--stage1-highlight'], '#B79663');
  assert.equal(vars['--stage1-canvas'], '#FBFAFD');
  assert.equal(Object.keys(vars).length, 11);
});

test('post-login palette source does not import Sign-In theme systems', () => {
  assert.equal(source.includes('signin-preferences'), false);
  assert.equal(source.includes('approved-signin-v180'), false);
  assert.equal(source.includes("from './theme-system'"), false);
});
