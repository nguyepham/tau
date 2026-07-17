import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { win32 } from 'node:path';

/**
 * Resolve an executable shipped in Windows' System32 directory without
 * assuming the operating system is installed on C:. An invalid or missing
 * environment value fails closed so callers can use their normal fallback.
 */
export function resolveWindowsSystemExecutable(
  executableName,
  { env = process.env, fileExists = existsSync } = {},
) {
  if (
    !executableName ||
    executableName !== win32.basename(executableName) ||
    /[\0\r\n]/.test(executableName)
  ) {
    return null;
  }

  for (const value of [env.SystemRoot, env.WINDIR]) {
    const root = value?.trim();
    if (!root || !win32.isAbsolute(root) || /[\0\r\n]/.test(root)) continue;

    const candidate = win32.join(root, 'System32', executableName);
    if (fileExists(candidate)) return candidate;
  }

  return null;
}

/**
 * The ripgrep 14.1.1 release has no Linux ARM64 musl artifact. Detect the
 * libc reported by Node so postinstall does not place a known-incompatible
 * GNU binary on Alpine ARM64. Unknown report implementations return false;
 * runtime still probes the binary before selecting it.
 */
export function isLinuxArm64Musl(
  {
    platform = process.platform,
    arch = process.arch,
    getReport = () => process.report?.getReport?.(),
  } = {},
) {
  if (platform !== 'linux' || arch !== 'arm64') return false;

  try {
    const header = getReport()?.header;
    return Boolean(header) && !header.glibcVersionRuntime;
  } catch {
    return false;
  }
}

/**
 * Return true only when a ripgrep command can actually execute on this host.
 * `requireFile` is used for vendored absolute paths; bare `rg` commands are
 * intentionally left to the operating system's normal PATH lookup.
 */
export function isUsableRipgrepCommand(
  command,
  {
    fileExists = existsSync,
    requireFile = false,
    spawnSyncImpl = spawnSync,
  } = {},
) {
  if (
    typeof command !== 'string' ||
    command.length === 0 ||
    /[\0\r\n]/.test(command) ||
    (requireFile && !fileExists(command))
  ) {
    return false;
  }

  try {
    const probe = spawnSyncImpl(command, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      windowsHide: true,
    });
    return (
      probe.status === 0 &&
      typeof probe.stdout === 'string' &&
      probe.stdout.startsWith('ripgrep ')
    );
  } catch {
    return false;
  }
}
