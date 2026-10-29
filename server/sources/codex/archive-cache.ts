// Cópias locais de leitura: os arquivos originais do Codex nunca são alterados.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as zlib from 'node:zlib';

export function readableArchive(path: string, cacheDir: string): string {
  const original = realpathSync(path);
  const st = statSync(original);
  const key = createHash('sha256').update(`${original}:${st.size}:${st.mtimeMs}`).digest('hex');
  const target = join(cacheDir, `${key}.jsonl`);
  if (existsSync(target)) return target;
  const decompress = (zlib as unknown as { zstdDecompressSync?: (input: Buffer, options: { maxOutputLength: number }) => Buffer }).zstdDecompressSync;
  if (!decompress) throw new Error('A leitura de arquivos .zst requer Node.js com suporte a Zstandard.');
  const data = decompress(readFileSync(original), { maxOutputLength: 512 * 1024 * 1024 });
  mkdirSync(cacheDir, { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  writeFileSync(temp, data, { mode: 0o600 });
  renameSync(temp, target);
  return target;
}
