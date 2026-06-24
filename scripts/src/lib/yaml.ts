import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import prettier from 'prettier';

/** Write a value as Prettier-formatted YAML, creating parent dirs as needed. */
export async function writeYamlFile(filepath: string, value: unknown): Promise<void> {
  const raw = YAML.stringify(value);
  const text = await prettier.format(raw, {
    ...(await prettier.resolveConfig(filepath)),
    parser: 'yaml',
  });
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, text, 'utf8');
}

export function readYamlFile<T = unknown>(filepath: string): T {
  const text = fs.readFileSync(filepath, 'utf8').replace(/^\uFEFF/, '');
  return YAML.parse(text) as T;
}
