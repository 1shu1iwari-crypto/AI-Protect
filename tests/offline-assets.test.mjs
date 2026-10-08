import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('offline app cache covers the complete static engine import and export graph', () => {
  const root = new URL('../', import.meta.url);
  const worker = readFileSync(new URL('web/sw.js', root), 'utf8');
  const declaration = worker.match(/const ASSETS\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(declaration, 'worker declares its offline assets');
  const assets = new Set(runInNewContext(declaration[1]));
  for (const asset of assets) {
    if (asset !== '/app') assert.ok(existsSync(new URL(asset.slice(1), root)), 'missing offline asset: ' + asset);
  }
  const visited = new Set();
  const pending = ['/web/app.mjs'];
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    assert.ok(assets.has(path), 'uncached dependency: ' + path);
    if (!path.endsWith('.mjs')) continue;
    const source = readFileSync(new URL(path.slice(1), root), 'utf8');
    // Includes re-exports and JSON import attributes, not only import statements.
    for (const match of source.matchAll(/\bfrom\s*['"]([./][^'"]+)['"]/g)) {
      const dependency = new URL(match[1], 'https://offline.invalid' + path).pathname;
      pending.push(dependency);
    }
  }
  assert.ok(visited.size > 20, 'inspect the full financial engine, not just the entry page');
});
