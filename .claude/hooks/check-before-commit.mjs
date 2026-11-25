/**
 * PreToolUse hook: run the unit tests and the typecheck before a git commit.
 *
 * A failure denies that one command and hands the output back, so the problem can be fixed
 * and the commit retried. It must not answer {"continue": false}, which ends the whole turn.
 *
 * The `if` filter in settings.json can also match commands that are not commits, so the
 * command itself is checked here and anything else passes untouched.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const OUTPUT_LINES = 60;

/** `git commit` at the start of a command: after a line break, ; & | or (, past any variable
 *  assignments, and with options such as -C <dir> before the subcommand. */
const COMMIT = /(?:^|[\n;&|(])\s*(?:\w+=\S*\s+)*git\s+(?:-[cC]\s+\S+\s+|--?[\w-]+(?:=\S+)?\s+)*commit(?=\s|$|[;&|)])/;

const { tool_input: input } = JSON.parse(readFileSync(0, 'utf-8'));
if (!COMMIT.test(input?.command ?? '')) process.exit(0);

for (const args of [['test'], ['run', 'typecheck']]) {
  const run = spawnSync('npm', args, {
    cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    encoding: 'utf-8',
  });
  if (run.status === 0) continue;
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ?? ''}`.trimEnd().split('\n').slice(-OUTPUT_LINES).join('\n');
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `"npm ${args.join(' ')}" failed, so nothing was committed. Fix this, then commit again.\n\n${output}`,
    },
  }));
  break;
}
