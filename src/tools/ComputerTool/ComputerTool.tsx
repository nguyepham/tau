import type {
  Base64ImageSource,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/index.mjs";
import { z } from "zod/v4";
import { Text } from "../../ink.js";
import {
  buildTool,
  type ToolDef,
  type ToolUseContext,
  type ValidationResult,
} from "../../Tool.js";
import {
  clickMouse,
  dragMouse,
  moveMouse,
  normalizeHotkeyInput,
  pressHotkey,
  scrollDesktop,
  takeDesktopScreenshot,
  typeText,
  waitForDesktop,
  type DesktopScreenshot,
  type DesktopScreenshotOptions,
  type MouseButtonName,
  type ScrollDirection,
} from "../../utils/desktopUse/nutJsDesktopAdapter.js";
import { lazySchema } from "../../utils/lazySchema.js";
import type { PermissionResult } from "../../utils/permissions/PermissionResult.js";

export const COMPUTER_TOOL_NAME = "Computer";

const COMPUTER_PROMPT = `Use this tool when the user asks you to inspect or operate the local desktop GUI, or when a task genuinely requires a native application instead of files, shell commands, or web fetches.

Actions operate on the user's real computer through Zen's permission system:
- screenshot returns the current primary display as an image. Take a screenshot before coordinate-based actions unless you already have a current screenshot.
- Fast screenshots are shown to you as a fixed 1000x1000 control frame. Coordinates are normalized, not pixels: x and y are integers from 0 to 1000 over that visible screenshot, with 0,0 at top-left and 1000,1000 at bottom-right.
- click, double_click, right_click, middle_click, move, drag, scroll, type, hotkey, and wait affect the active desktop session.
- Every action except screenshot returns a fresh post-action screenshot by default, so continue from the returned image instead of taking a separate screenshot.
- Use observeAfter=false only when you intentionally want a blind fast action. Use settleMs to wait briefly for animations or loading before the post-action screenshot.
- Screenshots default to low-latency compressed frames. Use detail="full" only when you need small text or exact visual detail.
- For cross-platform shortcuts, use ctrl/cmd style hotkeys such as "ctrl+l"; Zen maps common shortcuts to the platform-appropriate modifier.
- Prefer small, verifiable steps: inspect, act once, inspect the returned image, then continue.
- Never report GUI state, usage remaining, settings values, or success unless the current returned screenshot actually shows it. If the app/page is not visible, keep navigating or say you could not verify it.
- Do not emit placeholder text such as "0", "00", or "_" between desktop actions. If the next step is unclear, take another screenshot or explain the blocker.
- Do not run broad filesystem searches to find GUI apps unless the user explicitly asks for file discovery. Prefer normal desktop navigation and launch flows.`;

const actionSchema = z.enum([
  "screenshot",
  "move",
  "click",
  "double_click",
  "right_click",
  "middle_click",
  "drag",
  "type",
  "hotkey",
  "scroll",
  "wait",
]);

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: actionSchema.describe("Desktop action to perform."),
    x: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .optional()
      .describe("Normalized X coordinate from 0 left to 1000 right."),
    y: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .optional()
      .describe("Normalized Y coordinate from 0 top to 1000 bottom."),
    toX: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .optional()
      .describe("Destination normalized X coordinate for drag actions."),
    toY: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .optional()
      .describe("Destination normalized Y coordinate for drag actions."),
    button: z
      .enum(["left", "middle", "right"])
      .optional()
      .describe("Mouse button for click actions. Defaults to left."),
    text: z.string().optional().describe("Text to type into the active app."),
    submit: z.boolean().optional().describe("Press Enter after typing text."),
    viaClipboard: z
      .boolean()
      .optional()
      .describe(
        "On Windows, paste text through the clipboard for reliability.",
      ),
    key: z
      .string()
      .optional()
      .describe('Hotkey string such as "ctrl+l", "alt+tab", or "enter".'),
    keys: z
      .array(z.string())
      .optional()
      .describe('Hotkey keys as an array, for example ["ctrl", "l"].'),
    direction: z
      .enum(["up", "down", "left", "right"])
      .optional()
      .describe("Scroll direction."),
    amount: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .describe("Scroll amount. Defaults to 500."),
    durationMs: z
      .number()
      .int()
      .min(0)
      .max(60_000)
      .optional()
      .describe("Wait duration in milliseconds. Defaults to 5000."),
    observeAfter: z
      .boolean()
      .optional()
      .describe(
        "Return a fresh screenshot after this action. Defaults to true for every non-screenshot action.",
      ),
    settleMs: z
      .number()
      .int()
      .min(0)
      .max(5000)
      .optional()
      .describe(
        "Delay before the post-action screenshot in milliseconds. Defaults to 150.",
      ),
    detail: z
      .enum(["fast", "full"])
      .optional()
      .describe(
        "Screenshot detail level. Defaults to fast compressed frames; use full only when small text is unreadable.",
      ),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;
type Input = z.infer<InputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    action: actionSchema,
    message: z.string(),
    screenshot: z
      .object({
        base64: z.string(),
        width: z.number(),
        height: z.number(),
        logicalWidth: z.number().optional(),
        logicalHeight: z.number().optional(),
        physicalWidth: z.number(),
        physicalHeight: z.number(),
        scaleFactor: z.number(),
        mediaType: z.enum(["image/jpeg", "image/png"]),
      })
      .optional(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;
export type ComputerOutput = z.infer<OutputSchema>;
type ComputerAction = Input["action"];
type ComputerHandler = (
  input: Input,
  context: ToolUseContext,
) => Promise<ComputerOutput>;
type Point = { x: number; y: number };
type CoordinateSpace = {
  logicalHeight: number;
  logicalWidth: number;
};

let coordinateSpace: CoordinateSpace | undefined;

function requiredFields(
  input: Input,
  fields: Array<keyof Input>,
): ValidationResult {
  const missing = fields.filter((field) => input[field] === undefined);
  if (missing.length === 0) return { result: true };
  return {
    result: false,
    message: `Computer action "${input.action}" requires: ${missing.join(", ")}`,
    errorCode: 1,
  };
}

const REQUIRED_FIELDS_BY_ACTION: Partial<
  Record<ComputerAction, Array<keyof Input>>
> = {
  click: ["x", "y"],
  double_click: ["x", "y"],
  drag: ["x", "y", "toX", "toY"],
  middle_click: ["x", "y"],
  move: ["x", "y"],
  right_click: ["x", "y"],
  scroll: ["direction"],
};

const CUSTOM_VALIDATORS: Partial<
  Record<ComputerAction, (input: Input) => ValidationResult>
> = {
  hotkey: (input) =>
    normalizeHotkeyInput(input).length > 0
      ? { result: true }
      : {
          result: false,
          message: 'Computer action "hotkey" requires key or keys.',
          errorCode: 1,
        },
  scroll: (input) =>
    (input.x === undefined && input.y !== undefined) ||
    (input.x !== undefined && input.y === undefined)
      ? {
          result: false,
          message:
            'Computer action "scroll" requires both x and y when either coordinate is provided.',
          errorCode: 1,
        }
      : { result: true },
  type: (input) =>
    input.text === undefined
      ? requiredFields(input, ["text"])
      : { result: true },
};

function validateComputerInput(input: Input): ValidationResult {
  const required = REQUIRED_FIELDS_BY_ACTION[input.action];
  const fieldResult: ValidationResult = required
    ? requiredFields(input, required)
    : { result: true };
  if (!fieldResult.result) return fieldResult;
  return CUSTOM_VALIDATORS[input.action]?.(input) ?? { result: true };
}

function screenshotOutput(screenshot: DesktopScreenshot): ComputerOutput {
  rememberCoordinateSpace(screenshot);
  return {
    action: "screenshot",
    message: `Screenshot captured (${screenshot.width}x${screenshot.height}).`,
    screenshot: {
      ...screenshot,
    },
  };
}

function outputWithScreenshot(
  output: ComputerOutput,
  screenshot: DesktopScreenshot,
  settleMs: number,
): ComputerOutput {
  rememberCoordinateSpace(screenshot);
  return {
    ...output,
    message: `${output.message} Observed after ${settleMs}ms (${screenshot.width}x${screenshot.height}).`,
    screenshot: {
      ...screenshot,
    },
  };
}

function rememberCoordinateSpace(screenshot: DesktopScreenshot): void {
  coordinateSpace = {
    logicalHeight: screenshot.logicalHeight,
    logicalWidth: screenshot.logicalWidth,
  };
}

async function ensureCoordinateSpace(input: Input): Promise<CoordinateSpace> {
  if (coordinateSpace) return coordinateSpace;
  const screenshot = await takeDesktopScreenshot(getScreenshotOptions(input));
  rememberCoordinateSpace(screenshot);
  return coordinateSpace!;
}

async function toDesktopPoint(
  input: Input,
  x: number,
  y: number,
): Promise<Point> {
  const space = await ensureCoordinateSpace(input);
  return {
    x: Math.round((x * space.logicalWidth) / 1000),
    y: Math.round((y * space.logicalHeight) / 1000),
  };
}

function shouldObserveAfter(input: Input): boolean {
  return input.action !== "screenshot" && input.observeAfter !== false;
}

function getSettleMs(input: Input): number {
  if (input.settleMs !== undefined) return input.settleMs;
  if (input.action === "wait") return 0;
  return 150;
}

function getScreenshotOptions(input: Input): DesktopScreenshotOptions {
  if (input.detail === "full")
    return { format: "png", maxHeight: 100_000, maxWidth: 100_000 };
  return {
    fixedHeight: 1000,
    fixedWidth: 1000,
    format: "jpeg",
    jpegQuality: 65,
  };
}

function getClickButton(input: Input): MouseButtonName {
  if (input.action === "right_click") return "right";
  if (input.action === "middle_click") return "middle";
  return (input.button ?? "left") as MouseButtonName;
}

function formatPoint(input: Pick<Input, "x" | "y">): string {
  return `${input.x},${input.y}`;
}

const SUMMARY_FORMATTERS: Partial<
  Record<ComputerAction, (input: Partial<Input>) => string>
> = {
  click: (input) =>
    input.x !== undefined && input.y !== undefined
      ? `click at ${formatPoint(input)}`
      : "click",
  double_click: (input) =>
    input.x !== undefined && input.y !== undefined
      ? `double click at ${formatPoint(input)}`
      : "double click",
  drag: (input) =>
    input.x !== undefined &&
    input.y !== undefined &&
    input.toX !== undefined &&
    input.toY !== undefined
      ? `drag ${input.x},${input.y} to ${input.toX},${input.toY}`
      : "drag",
  hotkey: (input) =>
    `hotkey ${input.keys?.join("+") ?? input.key ?? ""}`.trim(),
  middle_click: (input) =>
    input.x !== undefined && input.y !== undefined
      ? `middle click at ${formatPoint(input)}`
      : "middle click",
  move: (input) =>
    input.x !== undefined && input.y !== undefined
      ? `move to ${formatPoint(input)}`
      : "move",
  right_click: (input) =>
    input.x !== undefined && input.y !== undefined
      ? `right click at ${formatPoint(input)}`
      : "right click",
  screenshot: () => "screenshot",
  scroll: (input) => `scroll ${input.direction ?? ""}`.trim(),
  type: (input) => `type ${input.text?.length ?? 0} chars`,
  wait: (input) => `wait ${input.durationMs ?? 5000}ms`,
};

function getSummary(input: Partial<Input> | undefined): string | null {
  if (!input?.action) return null;
  return SUMMARY_FORMATTERS[input.action]?.(input) ?? input.action;
}

function permissionSuggestions() {
  return [
    {
      type: "addRules" as const,
      destination: "localSettings" as const,
      rules: [{ toolName: COMPUTER_TOOL_NAME }],
      behavior: "allow" as const,
    },
  ];
}

function textResult(action: Input["action"], message: string): ComputerOutput {
  return { action, message };
}

function modelFacingMessage(output: ComputerOutput): string {
  if (!output.screenshot) return output.message;

  return [
    output.message,
    "Internal desktop-control contract:",
    '- The screenshot is a fixed 1000x1000 control frame unless detail="full" was requested.',
    "- Use normalized x/y coordinates from 0 to 1000 over the visible screenshot for mouse actions.",
    "- Do not claim GUI state, usage remaining, settings values, or success unless it is visible in this screenshot.",
  ].join("\n");
}

async function handleScreenshot(input: Input): Promise<ComputerOutput> {
  return screenshotOutput(
    await takeDesktopScreenshot(getScreenshotOptions(input)),
  );
}

async function handleMove(input: Input): Promise<ComputerOutput> {
  const point = await toDesktopPoint(input, input.x!, input.y!);
  await moveMouse(point.x, point.y);
  return textResult(input.action, `Moved mouse to ${formatPoint(input)}.`);
}

async function handleClick(input: Input): Promise<ComputerOutput> {
  const point = await toDesktopPoint(input, input.x!, input.y!);
  await clickMouse({
    x: point.x,
    y: point.y,
    button: getClickButton(input),
    double: input.action === "double_click",
  });
  return textResult(
    input.action,
    `${getSummary(input) ?? input.action} completed.`,
  );
}

async function handleDrag(input: Input): Promise<ComputerOutput> {
  const from = await toDesktopPoint(input, input.x!, input.y!);
  const to = await toDesktopPoint(input, input.toX!, input.toY!);
  await dragMouse({
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
  });
  return textResult(input.action, `${getSummary(input)} completed.`);
}

async function handleType(input: Input): Promise<ComputerOutput> {
  await typeText({
    text: input.text!,
    submit: input.submit,
    viaClipboard: input.viaClipboard,
  });
  const suffix = input.submit ? " and pressed Enter" : "";
  return textResult(
    input.action,
    `Typed ${input.text!.length} characters${suffix}.`,
  );
}

async function handleHotkey(input: Input): Promise<ComputerOutput> {
  const keys = normalizeHotkeyInput(input);
  await pressHotkey(keys);
  return textResult(input.action, `Pressed hotkey ${keys.join("+")}.`);
}

async function handleScroll(input: Input): Promise<ComputerOutput> {
  const point =
    input.x !== undefined && input.y !== undefined
      ? await toDesktopPoint(input, input.x, input.y)
      : undefined;
  await scrollDesktop({
    x: point?.x,
    y: point?.y,
    direction: input.direction as ScrollDirection,
    amount: input.amount ?? 500,
  });
  return textResult(input.action, `${getSummary(input)} completed.`);
}

async function handleWait(
  input: Input,
  context: ToolUseContext,
): Promise<ComputerOutput> {
  const durationMs = input.durationMs ?? 5000;
  await waitForDesktop(durationMs, context.abortController.signal);
  return textResult(input.action, `Waited ${durationMs}ms.`);
}

const ACTION_HANDLERS: Record<ComputerAction, ComputerHandler> = {
  click: handleClick,
  double_click: handleClick,
  drag: handleDrag,
  hotkey: handleHotkey,
  middle_click: handleClick,
  move: handleMove,
  right_click: handleClick,
  screenshot: handleScreenshot,
  scroll: handleScroll,
  type: handleType,
  wait: handleWait,
};

export const ComputerTool = buildTool({
  name: COMPUTER_TOOL_NAME,
  searchHint: "inspect and control the local desktop GUI",
  maxResultSizeChars: 100_000,
  async description(input) {
    return `Zen wants to use the computer: ${getSummary(input) ?? input.action}`;
  },
  userFacingName() {
    return "Computer";
  },
  getToolUseSummary: getSummary,
  getActivityDescription(input) {
    return getSummary(input);
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  isConcurrencySafe() {
    return false;
  },
  isReadOnly(input) {
    return input.action === "screenshot" || input.action === "wait";
  },
  isDestructive(input) {
    return !["screenshot", "move", "scroll", "wait"].includes(input.action);
  },
  isOpenWorld() {
    return true;
  },
  requiresUserInteraction() {
    return true;
  },
  toAutoClassifierInput(input) {
    return {
      action: input.action,
      x: input.x,
      y: input.y,
      toX: input.toX,
      toY: input.toY,
      button: input.button,
      direction: input.direction,
      key: input.key,
      keys: input.keys,
      detail: input.detail,
      observeAfter: input.observeAfter,
      settleMs: input.settleMs,
      textLength: input.text?.length,
      submit: input.submit,
    };
  },
  async checkPermissions(): Promise<PermissionResult> {
    return {
      behavior: "passthrough",
      message: "Computer access requires permission.",
      suggestions: permissionSuggestions(),
    };
  },
  async prompt(): Promise<string> {
    return COMPUTER_PROMPT;
  },
  async validateInput(input) {
    return validateComputerInput(input);
  },
  renderToolUseMessage(input) {
    return getSummary(input);
  },
  renderToolUseProgressMessage() {
    return null;
  },
  renderToolResultMessage(output) {
    return <Text>{output.message}</Text>;
  },
  extractSearchText(output) {
    return output.message;
  },
  async call(input, context) {
    const output = await ACTION_HANDLERS[input.action](input, context);
    if (!shouldObserveAfter(input)) return { data: output };

    const settleMs = getSettleMs(input);
    await waitForDesktop(settleMs, context.abortController.signal);
    const screenshot = await takeDesktopScreenshot(getScreenshotOptions(input));
    return { data: outputWithScreenshot(output, screenshot, settleMs) };
  },
  mapToolResultToToolResultBlockParam(
    output: ComputerOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    if (!output.screenshot) {
      return {
        tool_use_id: toolUseID,
        type: "tool_result",
        content: modelFacingMessage(output),
      };
    }

    return {
      tool_use_id: toolUseID,
      type: "tool_result",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: output.screenshot
              .mediaType as Base64ImageSource["media_type"],
            data: output.screenshot.base64,
          },
        },
        {
          type: "text",
          text: modelFacingMessage(output),
        },
      ],
    };
  },
} satisfies ToolDef<InputSchema, ComputerOutput>);
