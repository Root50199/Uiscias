import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPublishWip } from './publishWip';

const { execute, pause } = vi.hoisted(() => ({
  execute: vi.fn<(command: string, args: string[], options: unknown) => string>(),
  pause: vi.fn<() => Promise<void>>(),
}));
vi.mock('node:child_process', () => ({ execFileSync: execute }));
vi.mock('node:timers/promises', () => ({ setTimeout: pause }));
vi.mock('../lib/repo', () => ({
  getRepoRoot: () => 'E:\\repo',
  REPO_OWNER: 'Root50199',
  REPO_NAME: 'Uiscias',
}));

const successfulChecks = ['format', 'validate', 'test', 'commits'].map((name) => ({
  name,
  status: 'COMPLETED',
  conclusion: 'SUCCESS',
}));
const prState = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    headRefOid: 'abc123',
    isDraft: false,
    state: 'OPEN',
    statusCheckRollup: successfulChecks,
    ...overrides,
  });
const hasCommand = (command: string, prefix: string[]): boolean =>
  execute.mock.calls.some(
    ([actual, args]) =>
      actual === command && prefix.every((argument, index) => args[index] === argument),
  );
let statusReads = 0;
const respond = (command: string, args: string[]): string => {
  const key = `${command} ${args.join(' ')}`;
  if (key === 'git branch --show-current') return 'wip';
  if (key === 'git remote get-url --push origin') return 'https://github.com/Root50199/Uiscias.git';
  if (key === 'git config --default  --get core.hooksPath') return '.husky/_';
  if (key === 'git status --porcelain') return statusReads++ === 0 ? ' M mods/Test/data/a.xml' : '';
  if (key === 'git rev-parse HEAD') return 'abc123';
  if (key === 'git log -1 --format=%s') return 'fix: update talent UI';
  if (key.startsWith('gh pr list '))
    return '[{"number":12,"url":"https://github.com/Root50199/Uiscias/pull/12"}]';
  if (key.startsWith('gh pr view wip '))
    return '{"number":12,"url":"https://github.com/Root50199/Uiscias/pull/12"}';
  if (key.startsWith('gh pr view 12 ')) return prState();
  return '';
};

beforeEach(() => {
  statusReads = 0;
  execute.mockReset().mockImplementation(respond);
  pause.mockReset().mockResolvedValue();
  vi.stubEnv('HUSKY', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('runPublishWip', () => {
  it('stages all, commits with hooks and trailer, pushes and merges the exact checked head', async () => {
    await runPublishWip({ message: 'fix: update talent UI' });
    expect(hasCommand('git', ['add', '--all'])).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      'git',
      [
        'commit',
        '-m',
        'fix: update talent UI',
        '-m',
        'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
      ],
      expect.objectContaining({ stdio: 'inherit' }),
    );
    expect(hasCommand('git', ['push', '--set-upstream', 'origin', 'wip'])).toBe(true);
    expect(execute).toHaveBeenLastCalledWith(
      'gh',
      [
        'pr',
        'merge',
        '12',
        '--repo',
        'Root50199/Uiscias',
        '--merge',
        '--match-head-commit',
        'abc123',
      ],
      expect.anything(),
    );
    expect(hasCommand('gh', ['pr', 'create'])).toBe(false);
  });

  it('creates a plain-titled PR when none exists', async () => {
    execute.mockImplementation((command, args) =>
      command === 'gh' && args[0] === 'pr' && args[1] === 'list' ? '[]' : respond(command, args),
    );
    await runPublishWip({ message: 'fix: update talent UI' });
    const creation = execute.mock.calls.find(
      ([command, args]) => command === 'gh' && args[1] === 'create',
    );
    expect(creation?.[1]).toContain('update talent UI');
    expect(creation?.[1]).not.toContain('fix: update talent UI');
  });

  it('resumes a clean committed branch without another commit', async () => {
    statusReads = 1;
    await runPublishWip({});
    expect(hasCommand('git', ['add'])).toBe(false);
    expect(hasCommand('git', ['commit'])).toBe(false);
    expect(hasCommand('gh', ['pr', 'merge'])).toBe(true);
  });

  it.each([
    ['wrong branch', 'git branch --show-current', 'main'],
    ['wrong remote', 'git remote get-url --push origin', 'https://github.com/other/repo.git'],
    ['missing hooks', 'git config --default  --get core.hooksPath', ''],
    ['wrong hooks', 'git config --default  --get core.hooksPath', '/other/hooks'],
  ])('refuses %s before staging', async (_label, target, result) => {
    execute.mockImplementation((command, args) =>
      `${command} ${args.join(' ')}` === target ? result : respond(command, args),
    );
    await expect(runPublishWip({ message: 'fix: update' })).rejects.toThrow();
    expect(hasCommand('git', ['add'])).toBe(false);
  });

  it('refuses disabled hooks before staging', async () => {
    vi.stubEnv('HUSKY', '0');
    await expect(runPublishWip({ message: 'fix: update' })).rejects.toThrow('HUSKY=0');
    expect(hasCommand('git', ['add'])).toBe(false);
  });

  it('rejects invalid messages without staging', async () => {
    await expect(runPublishWip({ message: 'not conventional' })).rejects.toThrow(
      'Conventional Commit',
    );
    expect(hasCommand('git', ['add'])).toBe(false);
  });

  it('does not push after a failed commit hook', async () => {
    execute.mockImplementation((command, args) => {
      if (command === 'git' && args[0] === 'commit') throw new Error('Hook failed');
      return respond(command, args);
    });
    await expect(runPublishWip({ message: 'fix: update' })).rejects.toThrow('Hook failed');
    expect(hasCommand('git', ['push'])).toBe(false);
  });

  it('does not push if the commit leaves changes behind', async () => {
    execute.mockImplementation((command, args) =>
      command === 'git' && args.join(' ') === 'status --porcelain'
        ? ' M file'
        : respond(command, args),
    );
    await expect(runPublishWip({ message: 'fix: update' })).rejects.toThrow('Files changed');
    expect(hasCommand('git', ['push'])).toBe(false);
  });

  it('does not create a PR after a rejected push', async () => {
    execute.mockImplementation((command, args) => {
      if (command === 'git' && args[0] === 'push') throw new Error('Push rejected');
      return respond(command, args);
    });
    await expect(runPublishWip({ message: 'fix: update' })).rejects.toThrow('Push rejected');
    expect(hasCommand('gh', ['pr', 'create'])).toBe(false);
    expect(hasCommand('gh', ['pr', 'merge'])).toBe(false);
  });

  it('waits for checks to register and finish before merging', async () => {
    let checksRead = 0;
    execute.mockImplementation((command, args) => {
      if (command === 'gh' && args[1] === 'view' && args[2] === '12') {
        checksRead++;
        if (checksRead === 1) return prState({ statusCheckRollup: null });
        if (checksRead === 2) {
          return prState({
            statusCheckRollup: [...successfulChecks, { context: 'external', state: 'PENDING' }],
          });
        }
      }
      return respond(command, args);
    });
    await runPublishWip({ message: 'fix: update' });
    expect(pause).toHaveBeenCalledTimes(2);
    expect(hasCommand('gh', ['pr', 'merge'])).toBe(true);
  });

  it.each([
    { headRefOid: 'someone-elses-commit' },
    { isDraft: true },
    { state: 'CLOSED' },
    { statusCheckRollup: [{ name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }] },
    { statusCheckRollup: [{ context: 'external', state: 'ERROR' }] },
  ])('refuses unsafe PR/check state: %j', async (state) => {
    execute.mockImplementation((command, args) =>
      command === 'gh' && args[1] === 'view' && args[2] === '12'
        ? prState(state)
        : respond(command, args),
    );
    await expect(runPublishWip({ message: 'fix: update' })).rejects.toThrow();
    expect(hasCommand('gh', ['pr', 'merge'])).toBe(false);
  });

  it('never treats missing CI jobs as success', async () => {
    execute.mockImplementation((command, args) =>
      command === 'gh' && args[1] === 'view' && args[2] === '12'
        ? prState({ statusCheckRollup: successfulChecks.slice(0, 3) })
        : respond(command, args),
    );
    await expect(runPublishWip({ message: 'fix: update' })).rejects.toThrow('within one hour');
    expect(hasCommand('gh', ['pr', 'merge'])).toBe(false);
  });
});
