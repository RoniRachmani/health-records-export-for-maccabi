// The weekly drift check's entry for a checkout kept only for the check: brings that checkout to GitHub's main, and
// its dependencies with it, then runs scripts/drift-check.mjs with the arguments it was given, as a new process from
// what is now on disk. It imports nothing but Node's own modules, so it runs in a checkout whose node_modules is
// missing or stale, which drift-check.mjs cannot. It refuses a checkout with changes of its own (ignored files, such as
// .env and .cache, don't count): those are someone's work, not this script's to move.
//
//   node scripts/drift-update.mjs --notify     what the agent runs, after `npm run drift -- --install --repo DIR --update`
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);

/** @param {string[]} a */
function git(...a) {
  return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim();
}

function update() {
  if (git('status', '--porcelain')) throw new Error('it runs only in a checkout with no changes of its own, and ' + root + ' has some.');
  const lock = git('rev-parse', 'HEAD:package-lock.json');
  git('fetch', '--quiet', 'origin', 'main');
  git('checkout', '--quiet', '--detach', 'FETCH_HEAD');
  if (git('rev-parse', 'HEAD:package-lock.json') !== lock || !existsSync(join(root, 'node_modules'))) {
    // launchd's PATH may not reach the npm that came with this node.
    const npm = join(dirname(process.execPath), 'npm');
    execFileSync(existsSync(npm) ? npm : 'npm', ['ci', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
  }
}

try {
  update();
} catch (e) {
  console.error('Could not update the checkout: ' + (e instanceof Error ? e.message : String(e)));
  if (args.includes('--notify')) {
    try {
      execFileSync('osascript', ['-e', 'display notification "Could not update its checkout. See .cache/drift/launchd.log" with title "Maccabi drift check"'], { timeout: 10_000 });
    } catch { /* not on a Mac, or no session to show it in: the log has it */ }
  }
  process.exit(2);
}
const run = spawnSync(process.execPath, [join(root, 'scripts', 'drift-check.mjs'), ...args], { stdio: 'inherit' });
process.exit(run.status ?? 2);
