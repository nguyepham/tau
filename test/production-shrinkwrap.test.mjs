import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_SHRINKWRAP_PATH,
  createProductionManifest,
  createStagedSourceLock,
  verifyProductionShrinkwrap,
} from '../release/production-shrinkwrap.mjs';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(
  readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
);
const sourceLock = JSON.parse(
  readFileSync(join(repositoryRoot, 'package-lock.json'), 'utf8'),
);
const shrinkwrap = JSON.parse(readFileSync(CANONICAL_SHRINKWRAP_PATH, 'utf8'));

test('canonical shrinkwrap is production-only and pins the tested graph', () => {
  assert.equal(verifyProductionShrinkwrap(shrinkwrap, manifest, sourceLock), true);

  const entries = Object.entries(shrinkwrap.packages);
  assert.equal(entries.some(([, metadata]) => metadata.dev === true), false);
  assert.equal(entries.some(([, metadata]) => metadata.devOptional === true), false);
  assert.equal(entries.some(([, metadata]) => metadata.link === true), false);
  assert.equal(entries.some(([path]) => path.startsWith('packages/')), false);
  assert.equal(shrinkwrap.packages[''].devDependencies, undefined);
  assert.equal(shrinkwrap.packages[''].workspaces, undefined);
});

test('canonical shrinkwrap retains optional packages for every supported platform', () => {
  for (const packageName of Object.keys(manifest.optionalDependencies)) {
    assert.ok(
      shrinkwrap.packages[`node_modules/${packageName}`],
      `missing direct optional package ${packageName}`,
    );
  }

  assert.ok(shrinkwrap.packages['node_modules/fsevents']);
  assert.ok(shrinkwrap.packages['node_modules/@img/sharp-win32-x64']);
  assert.ok(shrinkwrap.packages['node_modules/@img/sharp-darwin-arm64']);
  assert.ok(shrinkwrap.packages['node_modules/@img/sharp-linux-x64']);
  assert.ok(shrinkwrap.packages['node_modules/@cortexkit/aft-win32-x64']);
  assert.ok(shrinkwrap.packages['node_modules/@cortexkit/aft-darwin-arm64']);
  assert.ok(shrinkwrap.packages['node_modules/@cortexkit/aft-linux-x64']);
});

test('staging inputs remove development and workspace metadata before pruning', () => {
  const productionManifest = createProductionManifest(manifest);
  const stagedLock = createStagedSourceLock(sourceLock);

  assert.equal(productionManifest.devDependencies, undefined);
  assert.equal(productionManifest.workspaces, undefined);
  assert.equal(stagedLock.packages[''].devDependencies, undefined);
  assert.equal(stagedLock.packages[''].workspaces, undefined);
  assert.equal(stagedLock.packages['packages/tau-installer'], undefined);
  assert.equal(
    stagedLock.packages['node_modules/@abdoknbgit/tau-installer'],
    undefined,
  );
});
