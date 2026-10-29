import { describe, expect, it } from 'vitest';
import { entryFor } from './entry';

describe('entrada do escritório conectado', () => {
  it('abre o Habblaud por padrão e reserva o painel financeiro para navegação explícita', () => {
    expect(entryFor('')).toBe('office');
    expect(entryFor('?broker=1')).toBe('broker');
    expect(entryFor('?broker=0')).toBe('office');
  });
  it('mantém links de agentes, entregas, biblioteca e demonstração no escritório completo', () => {
    for (const search of ['?office=1', '?mock=1', '?agent=codex-123', '?delivery=report', '?broker=1&agent=codex-123']) expect(entryFor(search)).toBe('office');
    expect(entryFor('', '#meus-agentes')).toBe('office');
  });
});
