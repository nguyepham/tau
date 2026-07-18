import {
  AFT_AST_SEARCH_TOOL_NAME,
  AFT_DIAGNOSTICS_TOOL_NAME,
  AFT_NAVIGATE_TOOL_NAME,
  AFT_OUTLINE_TOOL_NAME,
  AFT_ZOOM_TOOL_NAME,
} from '../tools/AFTTool/constants.js'
import { ARTIFACT_CANVAS_TOOL_NAME } from '../tools/ArtifactCanvasTool/constants.js'
import { DEPLOY_PREVIEW_TOOL_NAME } from '../tools/DeployPreviewTool/constants.js'
import { DIFF_ARTIFACT_TOOL_NAME } from '../tools/DiffArtifactTool/constants.js'
import { BROWSER_TOOL_NAME } from '../tools/BrowserTool/constants.js'
import { INSPECT_SITE_TOOL_NAME } from '../tools/InspectSiteTool/constants.js'
import { INTEGRATION_HUB_TOOL_NAME } from '../tools/IntegrationHubTool/constants.js'
import { LSP_TOOL_NAME } from '../tools/LSPTool/prompt.js'
import { MERMAID_RENDER_TOOL_NAME } from '../tools/MermaidRenderTool/constants.js'
import { NATIVE_SYSINFO_TOOL_NAME } from '../tools/NativeTools/constants.js'
import { PACKAGE_MANAGER_TOOL_NAME } from '../tools/PackageManagerTool/constants.js'
import { PROJECT_WORKFLOW_TOOL_NAME } from '../tools/ProjectWorkflowTool/constants.js'
import { TEST_SEARCH_TOOL_NAME } from '../tools/TestSearchTool/constants.js'
import { TOOL_GUIDE_TOOL_NAME } from '../tools/ToolGuideTool/constants.js'
import { VISUAL_DESIGN_AUDIT_TOOL_NAME } from '../tools/VisualDesignAuditTool/constants.js'
import { WEB_BROWSER_TOOL_NAME } from '../tools/WebBrowserTool/constants.js'

export type PrebuiltToolToggleItem = {
  readonly id: string
  readonly aliases?: readonly string[]
  readonly purpose: string
  readonly toolNames: readonly string[]
}

export type PrebuiltToolToggleGroup = {
  readonly label: string
  readonly items: readonly PrebuiltToolToggleItem[]
}

export const PREBUILT_TOOL_TOGGLE_GROUPS = [
  {
    label: 'Code Intelligence',
    items: [
      {
        id: 'AFT',
        aliases: [
          AFT_OUTLINE_TOOL_NAME,
          AFT_ZOOM_TOOL_NAME,
          AFT_AST_SEARCH_TOOL_NAME,
          AFT_NAVIGATE_TOOL_NAME,
          AFT_DIAGNOSTICS_TOOL_NAME,
        ],
        purpose:
          'Read-only code outline, symbol zoom, AST search, navigation, and diagnostics.',
        toolNames: [
          AFT_OUTLINE_TOOL_NAME,
          AFT_ZOOM_TOOL_NAME,
          AFT_AST_SEARCH_TOOL_NAME,
          AFT_NAVIGATE_TOOL_NAME,
          AFT_DIAGNOSTICS_TOOL_NAME,
        ],
      },
      {
        id: LSP_TOOL_NAME,
        purpose:
          'Language-server code intelligence for definitions, references, hover, symbols, and call hierarchy.',
        toolNames: [LSP_TOOL_NAME],
      },
    ],
  },
  {
    label: 'Project & Workflow',
    items: [
      {
        id: PROJECT_WORKFLOW_TOOL_NAME,
        purpose: 'Return repo-native build, lint, test, dev, preview, and deploy commands.',
        toolNames: [PROJECT_WORKFLOW_TOOL_NAME],
      },
      {
        id: TEST_SEARCH_TOOL_NAME,
        purpose: 'Find likely source and test counterparts.',
        toolNames: [TEST_SEARCH_TOOL_NAME],
      },
      {
        id: PACKAGE_MANAGER_TOOL_NAME,
        purpose: 'Detect the package manager and suggest safe package commands.',
        toolNames: [PACKAGE_MANAGER_TOOL_NAME],
      },
      {
        id: INTEGRATION_HUB_TOOL_NAME,
        purpose: 'Scan database, auth, storage, integration, and secret signals.',
        toolNames: [INTEGRATION_HUB_TOOL_NAME],
      },
      {
        id: DEPLOY_PREVIEW_TOOL_NAME,
        purpose: 'Inspect deploy, preview, tunnel, hosting, and port readiness.',
        toolNames: [DEPLOY_PREVIEW_TOOL_NAME],
      },
      {
        id: TOOL_GUIDE_TOOL_NAME,
        purpose: 'Choose the right Tau-native workflow and tool sequence.',
        toolNames: [TOOL_GUIDE_TOOL_NAME],
      },
    ],
  },
  {
    label: 'Testing & Verification',
    items: [
      {
        id: INSPECT_SITE_TOOL_NAME,
        purpose: 'Verify HTTP pages, expected text, assets, and simple forms.',
        toolNames: [INSPECT_SITE_TOOL_NAME],
      },
      {
        id: WEB_BROWSER_TOOL_NAME,
        purpose:
          'Open URLs/local files in the native browser or capture compact HTTP/local HTML snapshots.',
        toolNames: [WEB_BROWSER_TOOL_NAME],
      },
      {
        id: BROWSER_TOOL_NAME,
        purpose:
          'Drive a real Chrome/Edge browser: navigate, read the page as numbered elements, click, fill, type, scroll, screenshot, and manage tabs.',
        toolNames: [BROWSER_TOOL_NAME],
      },
      {
        id: VISUAL_DESIGN_AUDIT_TOOL_NAME,
        purpose: 'Scan frontend styling risks and visual verification needs.',
        toolNames: [VISUAL_DESIGN_AUDIT_TOOL_NAME],
      },
      {
        id: NATIVE_SYSINFO_TOOL_NAME,
        purpose: 'Return local CPU, memory, disk, load, and process summary.',
        toolNames: [NATIVE_SYSINFO_TOOL_NAME],
      },
    ],
  },
  {
    label: 'Artifacts',
    items: [
      {
        id: ARTIFACT_CANVAS_TOOL_NAME,
        purpose:
          'Create browser-reviewable HTML artifacts for reports, previews, mockups, and canvases.',
        toolNames: [ARTIFACT_CANVAS_TOOL_NAME],
      },
      {
        id: DIFF_ARTIFACT_TOOL_NAME,
        purpose:
          'Create shareable browser diff artifacts and unified patch files.',
        toolNames: [DIFF_ARTIFACT_TOOL_NAME],
      },
    ],
  },
  {
    label: 'Diagrams',
    items: [
      {
        id: MERMAID_RENDER_TOOL_NAME,
        purpose: 'Create Mermaid diagrams and browser-reviewable HTML previews.',
        toolNames: [MERMAID_RENDER_TOOL_NAME],
      },
    ],
  },
] as const satisfies readonly PrebuiltToolToggleGroup[]

export const PREBUILT_TOOL_TOGGLE_ITEMS = PREBUILT_TOOL_TOGGLE_GROUPS.flatMap(
  group => group.items,
)

export type PrebuiltToolToggleId =
  (typeof PREBUILT_TOOL_TOGGLE_ITEMS)[number]['id']

export function getPrebuiltToolToggleItem(
  value: string,
): PrebuiltToolToggleItem | undefined {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined

  return PREBUILT_TOOL_TOGGLE_ITEMS.find(item => {
    if (item.id.toLowerCase() === normalized) return true
    if (item.toolNames.some(name => name.toLowerCase() === normalized)) {
      return true
    }
    return item.aliases?.some(alias => alias.toLowerCase() === normalized)
  })
}

