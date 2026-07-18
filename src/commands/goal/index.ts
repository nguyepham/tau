import type { Command } from '../../commands.js'

const goal = {
  type: 'local-jsx',
  name: 'goal',
  description:
    'Set an objective goal that auto-continues until a check command passes',
  argumentHint:
    '<description> [--check <command>] | status | pause | resume | clear',
  load: () => import('./goal.js'),
} satisfies Command

export default goal
