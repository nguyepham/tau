import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isLinuxArm64Musl,
  isUsableRipgrepCommand,
  resolveWindowsSystemExecutable,
} from '../scripts/platform-support.mjs';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('Windows System32 tools follow SystemRoot instead of assuming drive C', () => {
  const expected = 'D:\\Windows\\System32\\tar.exe';
  const result = resolveWindowsSystemExecutable('tar.exe', {
    env: { SystemRoot: 'D:\\Windows' },
    fileExists: path => path === expected,
  });
  assert.equal(result, expected);
});

test('Windows System32 resolution fails closed for missing or unsafe roots', () => {
  assert.equal(
    resolveWindowsSystemExecutable('tar.exe', {
      env: { SystemRoot: 'relative\\Windows', WINDIR: 'E:\\Windows\nother' },
      fileExists: () => true,
    }),
    null,
  );
  assert.equal(
    resolveWindowsSystemExecutable('..\\taskkill.exe', {
      env: { SystemRoot: 'D:\\Windows' },
      fileExists: () => true,
    }),
    null,
  );
});

test('Linux ARM64 musl detection is narrow and treats unknown reports safely', () => {
  assert.equal(
    isLinuxArm64Musl({
      platform: 'linux',
      arch: 'arm64',
      getReport: () => ({ header: {} }),
    }),
    true,
  );
  assert.equal(
    isLinuxArm64Musl({
      platform: 'linux',
      arch: 'arm64',
      getReport: () => ({ header: { glibcVersionRuntime: '2.39' } }),
    }),
    false,
  );
  assert.equal(
    isLinuxArm64Musl({
      platform: 'linux',
      arch: 'x64',
      getReport: () => ({ header: {} }),
    }),
    false,
  );
  assert.equal(
    isLinuxArm64Musl({
      platform: 'linux',
      arch: 'arm64',
      getReport: () => {
        throw new Error('report unavailable');
      },
    }),
    false,
  );
});

test('Windows ARM64 uses the first ripgrep release that ships that artifact', () => {
  const source = readFileSync(join(repositoryRoot, 'scripts', 'postinstall.mjs'), 'utf8');
  assert.match(
    source,
    /'win32-arm64':\s*\{[^}]*target:\s*'aarch64-pc-windows-msvc'[^}]*version:\s*'15\.1\.0'/,
  );
  assert.match(source, /const version = info\.version \?\? RG_VERSION/);
});

test('ripgrep probes require a real ripgrep version response', () => {
  const calls = [];
  assert.equal(
    isUsableRipgrepCommand('rg', {
      spawnSyncImpl: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0, stdout: 'ripgrep 15.1.0\n' };
      },
    }),
    true,
  );
  assert.equal(calls[0].command, 'rg');
  assert.deepEqual(calls[0].args, ['--version']);
  assert.equal(calls[0].options.timeout, 5000);

  assert.equal(
    isUsableRipgrepCommand('rg', {
      spawnSyncImpl: () => ({ status: 0, stdout: 'not-ripgrep\n' }),
    }),
    false,
  );
  assert.equal(
    isUsableRipgrepCommand('/missing/rg', {
      requireFile: true,
      fileExists: () => false,
      spawnSyncImpl: () => {
        throw new Error('must not spawn');
      },
    }),
    false,
  );
});

test('postinstall does not certify an install without vendored or system ripgrep', () => {
  const source = readFileSync(join(repositoryRoot, 'scripts', 'postinstall.mjs'), 'utf8');
  assert.match(source, /await main\(\)/);
  assert.doesNotMatch(source, /await main\(\);\s*\} catch \{ \/\* ripgrep is optional/);
  assert.match(source, /no working system rg was found/);
  assert.ok(
    source.indexOf('await main();') <
      source.indexOf('writeLifecycleCompletionMarker(packageRoot)'),
    'ripgrep verification must finish before the lifecycle marker is written',
  );
});
