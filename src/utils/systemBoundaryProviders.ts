/**
 * Which providers get the SYSTEM_PROMPT_DYNAMIC_BOUNDARY marker for lane-side
 * cache splitting. Kept dependency-free so it can be unit-tested without
 * pulling in the beta-header / bootstrap import chain.
 */

/**
 * Native-lane providers whose request builder strips + splits the flat system
 * prompt on SYSTEM_PROMPT_DYNAMIC_BOUNDARY to keep volatile context (git
 * status, env, memory, date) OUT of the cached prefix:
 *   - gemini / antigravity → GeminiLane `splitSystemAtBoundary`
 *   - openrouter           → `splitOpenRouterSystemForCache`
 * (The legacy gemini/openrouter providers strip it too, so this holds whether
 * CLAUDEX_NATIVE_LANES is on or off.)
 *
 * Only providers that STRIP the marker belong here: any other provider would
 * forward the literal marker text to the model.
 */
export const SYSTEM_BOUNDARY_SPLITTING_PROVIDERS: ReadonlySet<string> = new Set(
  ["gemini", "antigravity", "openrouter"],
);

export function providerSplitsSystemBoundary(provider: string): boolean {
  return SYSTEM_BOUNDARY_SPLITTING_PROVIDERS.has(provider);
}
