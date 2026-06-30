/**
 * Turn a PascalCase mod id into a spaced, human-readable name.
 * e.g. `BriHpBars1And2` → `Bri Hp Bars 1 And 2`, `...FoV` is preserved.
 */
export const humanizeModId = (id: string): string => {
  let s = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');
  s = s.replace(/\bFo V\b/g, 'FoV');
  return s.replace(/\s+/g, ' ').trim();
};
