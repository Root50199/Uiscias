import { execFileSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { getRepoRoot, REPO_NAME, REPO_OWNER } from '../lib/repo';

const REPOSITORY = `${REPO_OWNER}/${REPO_NAME}`;
const TRAILER = 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>';
const REQUIRED_CHECKS = ['format', 'validate', 'test', 'commits'];
const CONVENTIONAL_PREFIX = /^[a-z]+(?:\([^)]+\))?!?:\s*/i;
const pullRequestsSchema = z.array(z.object({ number: z.number(), url: z.string() }));
const checksSchema = z.object({
  headRefOid: z.string(),
  isDraft: z.boolean(),
  state: z.string(),
  statusCheckRollup: z
    .array(
      z.union([
        z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable() }),
        z.object({ context: z.string(), state: z.string() }),
      ]),
    )
    .nullable(),
});

export interface PublishWipOptions {
  message?: string;
}

export const runPublishWip = async (options: PublishWipOptions): Promise<void> => {
  const cwd = getRepoRoot();
  const read = (command: string, args: string[]): string =>
    execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
  const run = (command: string, args: string[]): void => {
    execFileSync(command, args, { cwd, stdio: 'inherit' });
  };
  if (read('git', ['branch', '--show-current']) !== 'wip') {
    throw new Error('Publishing is only allowed from the wip branch.');
  }
  const remote = read('git', ['remote', 'get-url', '--push', 'origin']);
  if (
    remote !== `https://github.com/${REPOSITORY}.git` &&
    remote !== `https://github.com/${REPOSITORY}` &&
    remote !== `git@github.com:${REPOSITORY}.git`
  ) {
    throw new Error(`origin must point to ${REPOSITORY}; found ${remote}.`);
  }
  if (process.env.HUSKY === '0') {
    throw new Error('HUSKY=0 disables commit hooks. Enable hooks before publishing.');
  }
  const hooksPath = read('git', ['config', '--default', '', '--get', 'core.hooksPath']).replaceAll(
    '\\',
    '/',
  );
  if (hooksPath !== '.husky/_') {
    throw new Error('Husky hooks are not configured. Run npm run prepare first.');
  }
  run('gh', ['auth', 'status']);
  const changes = read('git', ['status', '--porcelain']);
  let message = options.message?.trim();
  if (changes) {
    console.log('All tracked and untracked changes below will be staged:');
    run('git', ['status', '--short']);
    if (!message) {
      if (!stdin.isTTY) {
        throw new Error('Pass --message with a Conventional Commit message outside a terminal.');
      }
      const prompt = readline.createInterface({ input: stdin, output: stdout });
      try {
        message = (await prompt.question('Commit message (blank cancels): ')).trim();
      } finally {
        prompt.close();
      }
    }
    if (!message || !CONVENTIONAL_PREFIX.test(message) || /[\r\n]/.test(message)) {
      throw new Error(
        'Provide a one-line Conventional Commit message, e.g. fix: update talent UI.',
      );
    }
    run('git', ['add', '--all']);
    run('git', ['commit', '-m', message, '-m', TRAILER]);
  } else {
    console.log('No local changes; resuming publication of the current WIP commit.');
  }
  if (read('git', ['status', '--porcelain'])) {
    throw new Error(
      'Files changed during commit. Review them before retrying; nothing was pushed.',
    );
  }
  const head = read('git', ['rev-parse', 'HEAD']);
  const title = read('git', ['log', '-1', '--format=%s']).replace(CONVENTIONAL_PREFIX, '').trim();
  if (!title || CONVENTIONAL_PREFIX.test(title)) {
    throw new Error('Cannot derive a plain PR title from the latest commit subject.');
  }
  run('git', ['push', '--set-upstream', 'origin', 'wip']);
  const prs = pullRequestsSchema.parse(
    JSON.parse(
      read('gh', [
        'pr',
        'list',
        '--repo',
        REPOSITORY,
        '--head',
        'wip',
        '--base',
        'main',
        '--state',
        'open',
        '--json',
        'number,url',
      ]),
    ),
  );
  if (prs.length > 1) throw new Error('Multiple WIP PRs found; resolve them before retrying.');
  let pr = prs[0];
  if (!pr) {
    run('gh', [
      'pr',
      'create',
      '--repo',
      REPOSITORY,
      '--head',
      'wip',
      '--base',
      'main',
      '--title',
      title,
      '--body',
      'Publishes the committed WIP changes. Local commit hooks run before pushing; CI must pass before merging.',
    ]);
    pr = pullRequestsSchema.element.parse(
      JSON.parse(read('gh', ['pr', 'view', 'wip', '--repo', REPOSITORY, '--json', 'number,url'])),
    );
  }
  console.log(`Waiting for all CI checks: ${pr.url}`);
  const prNumber = String(pr.number);
  let hasPassed = false;
  for (let attempt = 0; attempt < 360; attempt++) {
    const state = checksSchema.parse(
      JSON.parse(
        read('gh', [
          'pr',
          'view',
          prNumber,
          '--repo',
          REPOSITORY,
          '--json',
          'headRefOid,isDraft,state,statusCheckRollup',
        ]),
      ),
    );
    if (state.headRefOid !== head || state.isDraft || state.state !== 'OPEN') {
      throw new Error('PR head, draft status or open state changed; refusing to merge.');
    }
    const checks = (state.statusCheckRollup ?? []).map((check) =>
      'name' in check
        ? { name: check.name, isComplete: check.status === 'COMPLETED', result: check.conclusion }
        : { name: check.context, isComplete: check.state !== 'PENDING', result: check.state },
    );
    const failed = checks.filter(
      (check) =>
        check.isComplete && !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(check.result ?? ''),
    );
    if (failed.length) {
      throw new Error(`CI failed: ${failed.map((check) => check.name).join(', ')}. See ${pr.url}.`);
    }
    const hasRequiredSuccesses = REQUIRED_CHECKS.every((name) =>
      checks.some((check) => check.name === name && check.isComplete && check.result === 'SUCCESS'),
    );
    if (hasRequiredSuccesses && checks.every((check) => check.isComplete)) {
      hasPassed = true;
      break;
    }
    await setTimeout(10_000);
  }
  if (!hasPassed) throw new Error(`CI did not pass within one hour. Review ${pr.url} and retry.`);
  run('gh', [
    'pr',
    'merge',
    prNumber,
    '--repo',
    REPOSITORY,
    '--merge',
    '--match-head-commit',
    head,
  ]);
  console.log(`Merged ${pr.url}. Local wip is retained; main was not checked out or reset.`);
};
