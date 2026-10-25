// Read-only remote audit. --write updates only local review artifacts and pins.
// No source substitution: restore missing files at their approved exact URLs.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import sharp from 'sharp';

const origin = 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site';
const stagingOrigin = 'https://daenem-staffportal-api-staging.adedapo2005.workers.dev';
const source = await readFile(new URL('../worker/v180-public-assets.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
const safeAsset = new Function('module', 'exports', 'require', `${compiled}\nreturn safeAsset;`)(loaded, loaded.exports, () => ({ default: {} }));
const options = (accept) => ({ headers: { accept }, credentials: 'omit', redirect: 'manual', signal: AbortSignal.timeout(15_000) });
const manifestResponse = await fetch(`${origin}/api/assets`, options('application/json'));
if (manifestResponse.status !== 200 || !manifestResponse.headers.get('content-type')?.startsWith('application/json')) throw new Error('Manifest unavailable');
const manifestText = await manifestResponse.text();
if (Buffer.byteLength(manifestText) > 1_500_000) throw new Error('Manifest too large');
const payload = JSON.parse(manifestText);
if (!Array.isArray(payload.assets) || payload.assets.length > 500) throw new Error('Invalid manifest');
const assets = payload.assets.map(safeAsset).filter(Boolean);
if (new Set(assets.map(asset => asset.asset_key)).size !== assets.length) throw new Error('Ambiguous asset keys');
async function inspectImage(url) {
    let result;
    try {
      const response = await fetch(url, options('image/webp,image/png,image/jpeg'));
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      result = { url, status: response.status, mime };
      if (response.status !== 200 || response.redirected || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
        await response.body?.cancel();
        result.failure = 'missing-or-non-image-source';
      } else {
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 12_000_000) throw new Error('Image too large');
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        const decoder = sharp(bytes, { failOn: 'warning', limitInputPixels: 40_000_000 });
        const metadata = await decoder.metadata();
        if (`image/${metadata.format}` !== mime || metadata.pages > 1 || !metadata.width || !metadata.height) throw new Error('Unsupported image');
        // Force full decompression, not metadata/signature inspection.
        await decoder.raw().toBuffer();
        result = { ...result, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, width: metadata.width, height: metadata.height };
      }
    } catch {
      result = { url, failure: 'fetch-or-decode-failed' };
    }
    return result;
}
const results = new Map();
for (const asset of assets) {
  for (const field of ['image_url', 'default_image_url']) {
    const url = asset[field];
    if (!url || results.has(url)) continue;
    const result = await inspectImage(url);
    results.set(url, result);
    console.log(`${result.sha256 ? 'DECODED' : 'UNAVAILABLE'} ${asset.asset_key} ${url}`);
  }
}
// Inventory exact-path staging copies separately. Do not silently substitute
// them for the selected source or relay back into the same Worker.
const stagingCopies = [];
for (const asset of assets) {
  if (results.get(asset.image_url)?.sha256 || !asset.image_url.startsWith(`${origin}/assets/`)) continue;
  const result = await inspectImage(stagingOrigin + new URL(asset.image_url).pathname);
  stagingCopies.push({ asset_key: asset.asset_key, ...result });
  console.log(`STAGING ${result.sha256 ? 'DECODED' : 'UNAVAILABLE'} ${asset.asset_key}`);
}
const pins = Object.fromEntries([...results].filter(([, result]) => result.sha256).map(([url, { sha256, mime, bytes }]) => [url, { sha256, mime, bytes }]));
const report = {
  checkedAt: new Date().toISOString(), source: `${origin}/api/assets`,
  approvedEnabled: assets.length, excluded: payload.assets.length - assets.length,
  decodedSources: Object.keys(pins).length,
  requiredRestoration: assets.filter(asset => !results.get(asset.image_url)?.sha256).map(asset => ({ asset_key: asset.asset_key, image_url: asset.image_url })),
  stagingCopies,
  missingAtBothOrigins: stagingCopies.filter(result => !result.sha256).map(result => result.asset_key),
  sources: [...results.values()],
};
if (process.argv.includes('--write')) {
  await writeFile(new URL('../worker/v180-public-image-manifest.json', import.meta.url), `${JSON.stringify(pins, null, 2)}\n`);
  await writeFile(new URL('../delivery/backend-a-public-image-restoration.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ approvedEnabled: report.approvedEnabled, excluded: report.excluded, decodedSources: report.decodedSources, requiredRestoration: report.requiredRestoration.length, decodedStagingCopies: stagingCopies.filter(result => result.sha256).length, missingAtBothOrigins: report.missingAtBothOrigins.length }));
