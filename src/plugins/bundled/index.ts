/**
 * Built-in Plugin Initialization
 *
 * Initializes built-in plugins that ship with the CLI and appear in the
 * /plugin UI for users to enable/disable.
 *
 * Not all bundled features should be built-in plugins — use this for
 * features that users should be able to explicitly enable/disable. For
 * features with complex setup or automatic-enabling logic (e.g.
 * claude-in-chrome), use src/skills/bundled/ instead.
 *
 * To add a new built-in plugin:
 * 1. Import registerBuiltinPlugin from '../builtinPlugins.js'
 * 2. Call registerBuiltinPlugin() with the plugin definition here
 */
import { registerBuiltinPlugin } from '../builtinPlugins.js'

const JAVASCRIPT_LANGUAGE_ID = 'javascript'
const JAVASCRIPT_REACT_LANGUAGE_ID = 'javascriptreact'
const TYPESCRIPT_LANGUAGE_ID = 'typescript'
const TYPESCRIPT_REACT_LANGUAGE_ID = 'typescriptreact'
const GO_LANGUAGE_ID = 'go'
const GO_MOD_LANGUAGE_ID = 'gomod'
const GO_SUM_LANGUAGE_ID = 'gosum'
const GO_WORK_LANGUAGE_ID = 'gowork'
const SHELLSCRIPT_LANGUAGE_ID = 'shellscript'
const YAML_LANGUAGE_ID = 'yaml'

/**
 * Initialize built-in plugins. Called during CLI startup.
 */
export function initBuiltinPlugins(): void {
  registerBuiltinPlugin({
    name: 'claude-code-lsps',
    description:
      'Built-in LSP bundle for TypeScript, JavaScript, Go, Bash, and YAML.',
    version: '1.0.0',
    defaultEnabled: true,
    lspServers: {
      vtsls: {
        command: 'vtsls',
        args: ['--stdio'],
        extensionToLanguage: {
          '.ts': TYPESCRIPT_LANGUAGE_ID,
          '.mts': TYPESCRIPT_LANGUAGE_ID,
          '.cts': TYPESCRIPT_LANGUAGE_ID,
          '.tsx': TYPESCRIPT_REACT_LANGUAGE_ID,
          '.js': JAVASCRIPT_LANGUAGE_ID,
          '.mjs': JAVASCRIPT_LANGUAGE_ID,
          '.cjs': JAVASCRIPT_LANGUAGE_ID,
          '.jsx': JAVASCRIPT_REACT_LANGUAGE_ID,
        },
        startupTimeout: 20_000,
        maxRestarts: 5,
        alwaysOn: true,
      },
      gopls: {
        command: 'gopls',
        extensionToLanguage: {
          '.go': GO_LANGUAGE_ID,
          '.mod': GO_MOD_LANGUAGE_ID,
          '.sum': GO_SUM_LANGUAGE_ID,
          '.work': GO_WORK_LANGUAGE_ID,
        },
        startupTimeout: 20_000,
        maxRestarts: 5,
      },
      bash: {
        command: 'bash-language-server',
        args: ['start'],
        extensionToLanguage: {
          '.sh': SHELLSCRIPT_LANGUAGE_ID,
          '.bash': SHELLSCRIPT_LANGUAGE_ID,
          '.zsh': SHELLSCRIPT_LANGUAGE_ID,
          '.ksh': SHELLSCRIPT_LANGUAGE_ID,
          '.bats': SHELLSCRIPT_LANGUAGE_ID,
          '.bashrc': SHELLSCRIPT_LANGUAGE_ID,
          '.bash_profile': SHELLSCRIPT_LANGUAGE_ID,
          '.bash_login': SHELLSCRIPT_LANGUAGE_ID,
          '.bash_logout': SHELLSCRIPT_LANGUAGE_ID,
          '.profile': SHELLSCRIPT_LANGUAGE_ID,
        },
        startupTimeout: 10_000,
        maxRestarts: 5,
        alwaysOn: true,
      },
      yaml: {
        command: 'yaml-language-server',
        args: ['--stdio'],
        extensionToLanguage: {
          '.yaml': YAML_LANGUAGE_ID,
          '.yml': YAML_LANGUAGE_ID,
        },
        startupTimeout: 10_000,
        maxRestarts: 5,
        alwaysOn: true,
      },
    },
  })
}
