import { z } from 'zod';
import { REPO_OWNER, REPO_NAME } from './repo';

/**
 * Aggregates GitHub release-asset download counts into per-`modId` lifetime
 * totals. Every released `.it` asset is named `Uiscias<modId>_<version>.it`
 * (see `itName` in `itFile.ts`), so summing `download_count` across all
 * versions of a given `modId` yields that variant's lifetime downloads. A
 * non-variant mod has a single `modId`, so its total is the mod's total.
 *
 * The GitHub API payload is untrusted input, so it is validated with zod and
 * anything malformed is skipped rather than trusted or thrown on.
 */

/** Minimal `fetch` shape we depend on; lets tests inject a stub without casts. */
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface FetchDownloadCountsOptions {
  owner?: string;
  repo?: string;
  baseUrl?: string;
  /** GitHub token; falls back to `GITHUB_TOKEN` from the env. */
  token?: string;
  fetchFn?: FetchLike;
}

const DEFAULT_BASE_URL = 'https://api.github.com';
const PER_PAGE = 100;

/**
 * Managed release-asset grammar, mirroring `itName()`: `Uiscias<modId>_<n>.it`.
 * The greedy `(.+)` captures the `modId`, then the trailing `_<version>.it` is
 * stripped. Non-managed assets (e.g. `manifestCatalog.json`) never match.
 */
const MANAGED_ASSET = /^Uiscias(.+)_(\d{1,5})\.it$/;

/** The asset fields we consume; other fields are ignored. */
const assetSchema = z.object({
  name: z.string(),
  download_count: z.number().nonnegative(),
});

/**
 * The release fields we consume. `assets` stays `unknown[]` so one malformed
 * asset never invalidates the whole release.
 */
const releaseSchema = z.object({
  draft: z.boolean().optional(),
  assets: z.array(z.unknown()).optional(),
});

/**
 * Sum release-asset download counts into a `modId -> lifetime downloads` map.
 * Pure and side-effect free (the unit-test target). Draft releases are skipped
 * (their assets are not publicly downloadable), and any asset whose name is not
 * a managed `.it` (or is otherwise malformed) is ignored.
 */
export const sumDownloadsByModId = (releases: readonly unknown[]): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const rawRelease of releases) {
    const release = releaseSchema.safeParse(rawRelease);
    if (!release.success || release.data.draft === true) continue;
    for (const rawAsset of release.data.assets ?? []) {
      const asset = assetSchema.safeParse(rawAsset);
      if (!asset.success) continue;
      const match = MANAGED_ASSET.exec(asset.data.name);
      if (!match) continue;
      const modId = match[1];
      totals.set(modId, (totals.get(modId) ?? 0) + asset.data.download_count);
    }
  }
  return totals;
};

/**
 * Fetch every release for the repo (paginated) and return per-`modId` lifetime
 * download totals. Uses the authenticated GitHub API (5,000 req/hr) when a
 * token is present; the release list is the only budget cost — asset bytes are
 * never downloaded. Throws on a non-2xx response or a non-array payload.
 */
export const fetchDownloadCounts = async (
  options: FetchDownloadCountsOptions = {},
): Promise<Map<string, number>> => {
  const owner = options.owner ?? REPO_OWNER;
  const repo = options.repo ?? REPO_NAME;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const fetchFn = options.fetchFn ?? fetch;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Uiscias-build',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const releases: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const url = `${baseUrl}/repos/${owner}/${repo}/releases?per_page=${PER_PAGE}&page=${page}`;
    const response = await fetchFn(url, { headers });
    if (!response.ok) {
      throw new Error(
        `GitHub releases request failed (HTTP ${response.status}) for ${owner}/${repo}.`,
      );
    }
    const json: unknown = await response.json();
    if (!Array.isArray(json)) {
      throw new Error('GitHub releases response was not an array.');
    }
    releases.push(...json);
    if (json.length < PER_PAGE) break;
  }

  return sumDownloadsByModId(releases);
};
