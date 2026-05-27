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

const BASH_LANGUAGE_SERVER_PLUGIN_ROOT =
  'C:\\Users\\ok\\Desktop\\bash-language-server'

const SHELLSCRIPT_LANGUAGE_ID = 'shellscript'

/**
 * Initialize built-in plugins. Called during CLI startup.
 */
export function initBuiltinPlugins(): void {
  registerBuiltinPlugin({
    name: 'bash-language-server',
    description: 'Always-on Bash LSP for shell script navigation and syntax.',
    version: '5.6.0',
    defaultEnabled: true,
    lspServers: {
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
        env: {
          TAU_BASH_LSP_PLUGIN_ROOT: BASH_LANGUAGE_SERVER_PLUGIN_ROOT,
        },
        startupTimeout: 10_000,
        maxRestarts: 5,
        alwaysOn: true,
      },
    },
  })
}
