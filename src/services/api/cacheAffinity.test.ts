/**
 * Run: bun run src/services/api/cacheAffinity.test.ts
 */

import type { QuerySource } from "../../constants/querySource.js";
import type { AgentId } from "../../types/ids.js";
import { resolveProviderRequestSessionId } from "./cacheAffinity.js";

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
  console.log("provider cache affinity:");

  await test("keeps the root Antigravity session for main-thread calls", () => {
    const sessionId = resolveProviderRequestSessionId({
      provider: "antigravity",
      rootSessionId: "root-session",
      querySource: "repl_main_thread",
    });

    assert(sessionId === "root-session", `sessionId=${sessionId}`);
  });

  await test("keeps the root Antigravity session for fork agents", () => {
    const sessionId = resolveProviderRequestSessionId({
      provider: "antigravity",
      rootSessionId: "root-session",
      agentId: "agent-fork" as AgentId,
      querySource: "agent:builtin:fork" as QuerySource,
    });

    assert(sessionId === "root-session", `sessionId=${sessionId}`);
  });

  await test("derives stable per-agent Antigravity sessions for fresh subagents", () => {
    const a = resolveProviderRequestSessionId({
      provider: "antigravity",
      rootSessionId: "root-session",
      agentId: "agent-a" as AgentId,
      querySource: "agent:builtin:general-purpose" as QuerySource,
    });
    const aAgain = resolveProviderRequestSessionId({
      provider: "antigravity",
      rootSessionId: "root-session",
      agentId: "agent-a" as AgentId,
      querySource: "agent:builtin:general-purpose" as QuerySource,
    });
    const b = resolveProviderRequestSessionId({
      provider: "antigravity",
      rootSessionId: "root-session",
      agentId: "agent-b" as AgentId,
      querySource: "agent:builtin:general-purpose" as QuerySource,
    });

    assert(a === aAgain, `unstable sessionId: ${a} vs ${aAgain}`);
    assert(a !== "root-session", `fresh subagent reused root session: ${a}`);
    assert(a !== b, `subagents collided: ${a}`);
    assert(
      typeof a === "string" && a.startsWith("zen-agent-"),
      `sessionId=${a}`,
    );
  });

  await test("forwards the root session for every cache-aware provider", () => {
    const providers = [
      "copilot",
      "openrouter",
      "agentrouter",
      "opencode",
      "opencodego",
      "moonshot",
      "mistral",
      "fireworks",
    ] as const;

    for (const provider of providers) {
      const sessionId = resolveProviderRequestSessionId({
        provider: provider as any,
        rootSessionId: "root-session",
        agentId: "agent-a" as AgentId,
        querySource: "agent:builtin:general-purpose" as QuerySource,
      });
      assert(
        sessionId === "root-session",
        `${provider} sessionId=${sessionId}`,
      );
    }
  });

  await test("does not add affinity keys for providers that do not use them", () => {
    const sessionId = resolveProviderRequestSessionId({
      provider: "gemini",
      rootSessionId: "root-session",
      agentId: "agent-a" as AgentId,
      querySource: "agent:builtin:general-purpose" as QuerySource,
    });

    assert(sessionId === undefined, `sessionId=${sessionId}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
