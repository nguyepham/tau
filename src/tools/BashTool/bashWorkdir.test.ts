/**
 * Bash workdir normalization unit tests.
 *
 * Run: bun run src/tools/BashTool/bashWorkdir.test.ts
 */

import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, posix as pathPosix, relative } from "path";
import { toJSONSchema, z } from "zod/v4";
import { getPlatform } from "../../utils/platform.js";
import {
  extractLeadingCdCommand,
  isSameBashCwd,
  normalizeBashExecutionInput,
  resolveBashPathFrom,
} from "./bashWorkdir.js";

let passed = 0;
let failed = 0;

async function test(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL ${name}: ${e?.message ?? String(e)}`);
  }
}

function assert(cond: unknown, hint: string): void {
  if (!cond) throw new Error(hint);
}

async function main(): Promise<void> {
  console.log("bash workdir normalization:");

  await test("extracts simple leading cd command", () => {
    const result = extractLeadingCdCommand("cd backend && npm install");
    assert(result?.target === "backend", "expected backend target");
    assert(result?.remainder === "npm install", "expected command remainder");
  });

  await test("does not extract dynamic cd target", () => {
    const result = extractLeadingCdCommand('cd "$PROJECT_DIR" && npm install');
    assert(result === null, "dynamic cd target should not normalize");
  });

  await test("moves relative leading cd into workdir", () => {
    const root = pathPosix.join("/tmp", "repo");
    const result = normalizeBashExecutionInput(
      { command: "cd backend && npm install" },
      root,
      "linux",
    );
    assert(result.command === "npm install", "expected cd to be stripped");
    assert(
      result.workdir === pathPosix.join(root, "backend"),
      `got ${result.workdir}`,
    );
  });

  await test("combines provided workdir with leading cd", () => {
    const root = pathPosix.join("/tmp", "repo");
    const result = normalizeBashExecutionInput(
      { command: "cd app && npm test", workdir: "packages" },
      root,
      "linux",
    );
    assert(result.command === "npm test", "expected cd to be stripped");
    assert(
      result.workdir === pathPosix.join(root, "packages", "app"),
      `got ${result.workdir}`,
    );
  });

  await test("normalizes chained literal cd commands", () => {
    const root = pathPosix.join("/tmp", "repo");
    const result = normalizeBashExecutionInput(
      { command: "cd packages && cd app && npm test" },
      root,
      "linux",
    );
    assert(result.command === "npm test", "expected both cd commands stripped");
    assert(
      result.workdir === pathPosix.join(root, "packages", "app"),
      `got ${result.workdir}`,
    );
  });

  await test("keeps command_parts inputs unchanged", () => {
    const input = {
      command: "cd backend && npm install",
      command_parts: { executable: "npm" },
    };
    const result = normalizeBashExecutionInput(input, "tmp", "linux");
    assert(
      result === input,
      "expected exact same object when command_parts exist",
    );
  });

  await test("resolves Windows native path as absolute on Windows", () => {
    const target = "C:\\Workspace\\todo-app\\backend";
    const result = normalizeBashExecutionInput(
      { command: `cd ${target} && npm install` },
      "C:\\Workspace\\main-project",
      "windows",
    );
    assert(result.command === "npm install", "expected cd to be stripped");
    assert(result.workdir === target, `got ${result.workdir}`);
  });

  await test("marks synthesized workdir with _workdirFromCd flag", () => {
    const result = normalizeBashExecutionInput(
      { command: "cd backend && npm install" },
      "/tmp/repo",
      "linux",
    );
    assert(result._workdirFromCd === true, "expected _workdirFromCd flag");
  });

  await test("does not set _workdirFromCd for explicit workdir without cd", () => {
    const result = normalizeBashExecutionInput(
      { command: "npm install", workdir: "backend" },
      "/tmp/repo",
      "linux",
    );
    assert(result._workdirFromCd === undefined, "flag must stay unset");
  });

  await test("omit+strip Bash input schema hides workdir and injected internals", () => {
    // Regression for the `unrecognized_keys: _workdirFromCd` crash in the Bash
    // permission dialog. Mirrors BashTool.tsx `inputSchema`: a strictObject with
    // workdir/internal keys omitted, re-wrapped as a STRIPPING z.object.
    // validateInput mutates the live tool input in place to add `_workdirFromCd`
    // (see normalizeBashExecutionInputInPlace), and the permission UI / api
    // layer then re-parses that same input. If this schema is left strict, that
    // parse throws and crashes the dialog. It must STRIP hidden keys, not reject
    // them.
    const full = z.strictObject({
      command: z.string(),
      description: z.string().optional(),
      workdir: z.string().optional(),
      _simulatedSedEdit: z
        .object({ filePath: z.string(), newContent: z.string() })
        .optional(),
      _workdirFromCd: z.boolean().optional(),
    });
    const strict = full.omit({
      workdir: true,
      _simulatedSedEdit: true,
      _workdirFromCd: true,
    });
    const modelFacing = z.object(strict.shape);

    // Old strict behavior would throw here — the exact production bug.
    let strictThrew = false;
    try {
      strict.parse({
        command: "npm install",
        workdir: "/repo/be",
        _workdirFromCd: true,
      });
    } catch {
      strictThrew = true;
    }
    assert(
      strictThrew,
      "sanity: a strict omit DOES reject the injected internal key",
    );

    // New stripping behavior must parse cleanly and drop hidden keys.
    const parsed = modelFacing.parse({
      command: "npm install",
      workdir: "/repo/be",
      _workdirFromCd: true,
    });
    assert(parsed.command === "npm install", "command must survive the parse");
    assert(
      !("workdir" in parsed),
      "workdir must be stripped from the parsed result",
    );
    assert(
      !("_workdirFromCd" in parsed),
      "internal flag must be stripped from the parsed result",
    );

    // The model-facing JSON must hide workdir and internal keys.
    const json = toJSONSchema(modelFacing) as {
      properties?: Record<string, unknown>;
    };
    assert(
      !json.properties?.workdir &&
        !json.properties?._workdirFromCd &&
        !json.properties?._simulatedSedEdit,
      "workdir/internal keys must stay hidden from the model-facing schema",
    );
  });

  await test("isSameBashCwd compares case-insensitively on Windows", () => {
    assert(
      isSameBashCwd("C:\\Workspace\\Demo", "c:\\workspace\\DEMO\\", "windows"),
      "expected Windows paths to compare equal",
    );
  });

  await test("isSameBashCwd matches Git Bash and native Windows spellings", () => {
    assert(
      isSameBashCwd("/c/Workspace/Demo", "C:\\Workspace\\Demo", "windows"),
      "expected Git Bash spelling to match native spelling",
    );
  });

  await test("isSameBashCwd stays case-sensitive on linux", () => {
    assert(!isSameBashCwd("/tmp/Repo", "/tmp/repo", "linux"), "must differ");
    assert(
      isSameBashCwd("/tmp/repo/", "/tmp/repo", "linux"),
      "trailing slash equal",
    );
  });

  await test("resolves Git Bash drive path to host Windows path", () => {
    const result = resolveBashPathFrom(
      "C:\\Workspace\\main-project",
      "/c/Workspace/todo-app/backend",
      "windows",
    );
    assert(result === "C:\\Workspace\\todo-app\\backend", `got ${result}`);
  });

  await test("collapses a repeated cwd suffix from a leading cd", () => {
    const root = mkdtempSync(join(tmpdir(), "zen-workdir-overlap-"));
    try {
      const actual = join(root, "sd", "ef");
      mkdirSync(actual, { recursive: true });
      const repeated = relative(root, actual);
      const result = normalizeBashExecutionInput(
        { command: `cd ${repeated} && docker compose up -d` },
        actual,
        getPlatform(),
      );
      assert(
        result.command === "docker compose up -d",
        "expected cd to be stripped",
      );
      assert(
        result.workdir === actual,
        `expected ${actual}, got ${result.workdir}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  await test("collapses a repeated cwd suffix from an explicit workdir", () => {
    const root = mkdtempSync(join(tmpdir(), "zen-workdir-explicit-"));
    try {
      const actual = join(root, "project", "nested");
      mkdirSync(actual, { recursive: true });
      const repeated = relative(root, actual);
      const result = normalizeBashExecutionInput(
        { command: "npm test", workdir: repeated },
        actual,
        getPlatform(),
      );
      assert(
        result.workdir === actual,
        `expected ${actual}, got ${result.workdir}`,
      );
      assert(
        result._workdirFromCd === undefined,
        "explicit workdir must stay one-off",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  await test("keeps a real nested directory even when its name repeats", () => {
    const root = mkdtempSync(join(tmpdir(), "zen-workdir-real-nested-"));
    try {
      const current = join(root, "app");
      const realChild = join(current, "app");
      mkdirSync(realChild, { recursive: true });
      const result = normalizeBashExecutionInput(
        { command: "cd app && pwd" },
        current,
        getPlatform(),
      );
      assert(
        result.workdir === realChild,
        `expected real child ${realChild}, got ${result.workdir}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
