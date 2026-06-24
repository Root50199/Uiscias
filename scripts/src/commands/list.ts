import { getRepoRoot } from '../lib/repo';
import { discoverMods, groupMods } from '../lib/mods';

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
      console.log(`• ${m.id}`);
    } else {
      variantGroups++;
      console.log(`▾ ${g.parent?.id} (group, ${g.members.length} variants)`);
      for (const v of g.members) {
        variants++;
        console.log(`    └ ${v.id}  [${v.relDir}]`);
      }
    }
  }

  console.log(
    `\n${groups.length} groups — ${standalone} standalone, ${variantGroups} variant groups (${variants} variants).`,
  );
}
