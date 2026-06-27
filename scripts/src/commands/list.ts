import { getRepoRoot } from '../lib/repo';
import { discoverMods, groupMods } from '../lib/mods';
import { bold, dim } from '../lib/term';

/** Print the discovered mod/group/variant structure (a Phase 0 sanity tool). */
export function runList(): void {
  const repoRoot = getRepoRoot();
  const mods = discoverMods(repoRoot);
  const groups = groupMods(mods);

  let standalone = 0;
  let variantGroups = 0;
  let variants = 0;

  for (const g of groups) {
    if (!g.hasVariants) {
      standalone++;
      const [m] = g.members;
      console.log(`${dim('•')} ${m.id}`);
    } else {
      variantGroups++;
      console.log(`${dim('▾')} ${bold(g.parent?.id ?? '')} ${dim(`(group, ${g.members.length} variants)`)}`);
      for (const v of g.members) {
        variants++;
        console.log(`    ${dim('└')} ${v.id}  ${dim(`[${v.relDir}]`)}`);
      }
    }
  }

  console.log(
    dim(
      `\n${groups.length} groups — ${standalone} standalone, ${variantGroups} variant groups (${variants} variants).`,
    ),
  );
}
