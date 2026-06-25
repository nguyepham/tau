import { spawnSync } from "child_process";
import { statSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { getCwd } from "./cwd.js";
import { execFileNoThrowWithCwd } from "./execFileNoThrow.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const binaryName = process.platform === "win32" ? "zen-tools.exe" : "zen-tools";
let cachedNativeZenToolsPath: string | null | undefined;

function isExecutableFile(path: string): boolean {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return false;
    if (process.platform === "win32") return true;
    return (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

export function getNativeZenToolsPath(): string | null {
  if (cachedNativeZenToolsPath !== undefined) {
    return cachedNativeZenToolsPath;
  }

  const candidates = [
    // Bundled JS package: dist/cli.mjs -> dist/native/zen-tools.
    resolve(moduleDir, "native", binaryName),
    // Source/dev execution: src/utils/nativeZenTools.ts -> dist/native/zen-tools.
    resolve(moduleDir, "../../dist/native", binaryName),
    // Some test/bundle layouts place this module one level below dist.
    resolve(moduleDir, "../native", binaryName),
  ];

  cachedNativeZenToolsPath =
    candidates.find((candidate) => isExecutableFile(candidate)) ?? null;
  return cachedNativeZenToolsPath;
}

export function isNativeZenToolsAvailable(): boolean {
  return getNativeZenToolsPath() !== null;
}

export async function runNativeZenTool(
  command: string,
  args: string[],
  options: {
    input?: string;
    timeoutMs?: number;
    maxBuffer?: number;
  } = {},
): Promise<string> {
  const binary = getNativeZenToolsPath();
  if (!binary) {
    throw new Error(
      "Native Zen tools are not available. Run `npm run build:native-tools` from the Zen repository, or reinstall with Go 1.25.8+ available.",
    );
  }

  const result = await execFileNoThrowWithCwd(binary, [command, ...args], {
    cwd: getCwd(),
    abortSignal: undefined,
    timeout: options.timeoutMs ?? 30_000,
    preserveOutputOnError: true,
    maxBuffer: options.maxBuffer ?? 5_000_000,
    stdin: options.input === undefined ? "ignore" : "pipe",
    input: options.input,
  });

  if (result.code !== 0) {
    const detail = [result.stderr, result.error, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(detail || `zen-tools ${command} failed`);
  }

  return result.stdout;
}

export function runNativeZenToolSync(
  command: string,
  args: string[],
  options: {
    input?: string;
    timeoutMs?: number;
    maxBuffer?: number;
  } = {},
): string | null {
  const binary = getNativeZenToolsPath();
  if (!binary) return null;

  let result;
  try {
    result = spawnSync(binary, [command, ...args], {
      cwd: getCwd(),
      encoding: "utf8",
      input: options.input,
      timeout: options.timeoutMs ?? 5_000,
      maxBuffer: options.maxBuffer ?? 1_000_000,
      windowsHide: true,
    });
  } catch {
    return null;
  }

  if (result.status !== 0 || result.error) {
    return null;
  }

  return result.stdout;
}
