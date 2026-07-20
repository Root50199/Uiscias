import { describe, expect, it, vi } from 'vitest';
import { fetchDownloadCounts, sumDownloadsByModId, type FetchLike } from './downloads';

/** Build a minimal GitHub release object with the fields the summer reads. */
const release = (
  assets: { name: string; download_count: number }[],
  extra: { draft?: boolean } = {},
): unknown => ({ ...extra, assets });

/** A `Response`-like stub carrying a JSON body and an ok status. */
const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
  }) as unknown as Response;

describe('sumDownloadsByModId', () => {
  it('sums a single mod across every released version', () => {
    const totals = sumDownloadsByModId([
      release([{ name: 'UisciasAchievmentUnhide_00001.it', download_count: 10 }]),
      release([{ name: 'UisciasAchievmentUnhide_00002.it', download_count: 50 }]),
    ]);
    expect(totals.get('AchievmentUnhide')).toBe(60);
  });

  it('tracks each variant independently by its own modId', () => {
    const totals = sumDownloadsByModId([
      release([
        { name: 'UisciasBriHpBars1And2_00001.it', download_count: 15 },
        { name: 'UisciasBriHpBars1And3_00001.it', download_count: 8 },
      ]),
      release([
        { name: 'UisciasBriHpBars1And2_00002.it', download_count: 30 },
        { name: 'UisciasBriHpBars1And3_00002.it', download_count: 20 },
      ]),
      release([{ name: 'UisciasBriHpBars1And3_00003.it', download_count: 10 }]),
    ]);
    expect(totals.get('BriHpBars1And2')).toBe(45);
    expect(totals.get('BriHpBars1And3')).toBe(38);
  });

  it('ignores non-managed assets like manifestCatalog.json', () => {
    const totals = sumDownloadsByModId([
      release([
        { name: 'manifestCatalog.json', download_count: 999 },
        { name: 'UisciasAchievmentUnhide_00001.it', download_count: 5 },
      ]),
    ]);
    expect([...totals.keys()]).toEqual(['AchievmentUnhide']);
    expect(totals.get('AchievmentUnhide')).toBe(5);
  });

  it('skips draft releases (their assets are not publicly downloadable)', () => {
    const totals = sumDownloadsByModId([
      release([{ name: 'UisciasAchievmentUnhide_00001.it', download_count: 100 }], { draft: true }),
      release([{ name: 'UisciasAchievmentUnhide_00002.it', download_count: 7 }]),
    ]);
    expect(totals.get('AchievmentUnhide')).toBe(7);
  });

  it('skips malformed assets without failing the rest of the release', () => {
    const totals = sumDownloadsByModId([
      release([{ name: 'UisciasAchievmentUnhide_00001.it', download_count: 3 }]),
      { assets: [{ name: 'UisciasFoo_00001.it' /* missing download_count */ }, 'not-an-object'] },
      { notARelease: true },
    ]);
    expect(totals.get('AchievmentUnhide')).toBe(3);
    expect(totals.has('Foo')).toBe(false);
  });

  it('returns an empty map for no releases', () => {
    expect(sumDownloadsByModId([]).size).toBe(0);
  });
});

describe('fetchDownloadCounts', () => {
  it('paginates until a short page and aggregates all pages', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      assets: [{ name: `UisciasModA_${String(i + 1).padStart(5, '0')}.it`, download_count: 1 }],
    }));
    const page2 = [
      release([{ name: 'UisciasModA_00101.it', download_count: 1 }]),
      release([{ name: 'UisciasModB_00001.it', download_count: 4 }]),
    ];

    const fetchFn = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));

    const totals = await fetchDownloadCounts({ owner: 'o', repo: 'r', token: 't', fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toContain('/repos/o/r/releases?per_page=100&page=1');
    expect(fetchFn.mock.calls[1][0]).toContain('page=2');
    expect(totals.get('ModA')).toBe(101);
    expect(totals.get('ModB')).toBe(4);
  });

  it('sends an Authorization header when a token is provided', async () => {
    const fetchFn = vi.fn<FetchLike>().mockResolvedValue(jsonResponse([]));
    await fetchDownloadCounts({ owner: 'o', repo: 'r', token: 'secret', fetchFn });
    const init = fetchFn.mock.calls[0][1];
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret' });
  });

  it('throws on a non-ok response', async () => {
    const fetchFn = vi.fn<FetchLike>().mockResolvedValue(jsonResponse([], false, 404));
    await expect(fetchDownloadCounts({ owner: 'o', repo: 'r', fetchFn })).rejects.toThrow(
      /HTTP 404/,
    );
  });
});
