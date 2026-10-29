import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface PersonalSkill { name: string; description: string; account: string }

// Somente nome e descrição das skills pessoais; não executa nem devolve as instruções.
export function personalSkills(accounts: readonly { id: string; dir: string }[]): PersonalSkill[] {
  const result: PersonalSkill[] = [];
  for (const account of accounts) {
    const root = join(account.dir, 'skills');
    let entries;
    try { entries = readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
      try {
        const text = readFileSync(join(root, entry.name, 'SKILL.md'), 'utf8');
        const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
        if (!front) continue;
        const field = (key: string) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(front)?.[1]?.trim().replace(/^["']|["']$/g, '');
        const name = field('name') || entry.name;
        result.push({ name, description: field('description') || '', account: account.id });
      } catch { /* pasta sem skill pessoal */ }
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
