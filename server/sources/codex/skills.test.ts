import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { tempDir } from '../../test/fixtures';
import { personalSkills } from './skills';

it('lista apenas skills pessoais e não devolve o corpo das instruções', () => {
  const home = tempDir();
  try {
    for (const name of ['trading', '.system', 'sem-skill']) mkdirSync(join(home.dir, 'skills', name), { recursive: true });
    const text = '---\nname: trading\ndescription: "Analista do simulador"\n---\nINSTRUCOES_PRIVADAS';
    writeFileSync(join(home.dir, 'skills/trading/SKILL.md'), text);
    writeFileSync(join(home.dir, 'skills/.system/SKILL.md'), text);
    expect(personalSkills([{ id: '.codex', dir: home.dir }])).toEqual([{ name: 'trading', description: 'Analista do simulador', account: '.codex' }]);
  } finally { home.cleanup(); }
});
