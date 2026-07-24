import { feature } from "bun:bundle";
import { getModelOptions } from "../../utils/model/modelOptions.js";
import { isVoiceGrowthBookEnabled } from "../../voice/voiceModeEnabled.js";
import {
  getOptionsForSetting,
  SUPPORTED_SETTINGS,
} from "./supportedSettings.js";

export const DESCRIPTION = "Get or set Zen configuration settings.";

/**
 * Generate the prompt documentation from the registry
 */
export function generatePrompt(): string {
  const globalSettings: string[] = [];
  const projectSettings: string[] = [];

  for (const [key, config] of Object.entries(SUPPORTED_SETTINGS)) {
    // Skip model - it gets its own section with dynamic options
    if (key === "model") continue;
    // Voice settings are registered at build-time but gated by GrowthBook
    // at runtime. Hide from model prompt when the kill-switch is on.
    if (
      feature("VOICE_MODE") &&
      key === "voiceEnabled" &&
      !isVoiceGrowthBookEnabled()
    )
      continue;

    const options = getOptionsForSetting(key);
    let line = `- ${key}`;

    if (options) {
      line += `: ${options.map((o) => `"${o}"`).join(", ")}`;
    } else if (config.type === "boolean") {
      line += `: true/false`;
    }

    line += ` - ${config.description}`;

    if (config.source === "global") {
      globalSettings.push(line);
    } else {
      projectSettings.push(line);
    }
  }

  const modelSection = generateModelSection();

  return `Get or set Zen configuration settings.

  View or change settings. Use when user requests config changes, asks about current settings, or adjusting setting benefits them.

## Usage
- **Get current value:** Omit "value" parameter
- **Set new value:** Include "value" parameter

## Configurable settings

### Global Settings (~/.claude.json)
${globalSettings.join("\n")}

### Project Settings (settings.json)
${projectSettings.join("\n")}

${modelSection}
## Examples
- Get theme: { "setting": "theme" }
- Set dark theme: { "setting": "theme", "value": "dark" }
- Enable vim mode: { "setting": "editorMode", "value": "vim" }
- Enable verbose: { "setting": "verbose", "value": true }
- Change model: { "setting": "model", "value": "opus" }
- Change permission mode: { "setting": "permissions.defaultMode", "value": "plan" }
`;
}

function generateModelSection(): string {
  try {
    const options = getModelOptions();
    const lines = options.map((o) => {
      const value = o.value === null ? 'null/"default"' : `"${o.value}"`;
      return `  - ${value}: ${o.descriptionForModel ?? o.description}`;
    });
    return `## Model
- model - Override the default model. Available options:
${lines.join("\n")}`;
  } catch {
    return `## Model
- model - Override the default model (sonnet, opus, haiku, best, or full model ID)`;
  }
}
