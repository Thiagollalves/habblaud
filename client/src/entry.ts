/** O escritório conectado é a entrada padrão; finanças exige navegação explícita. */
export function entryFor(search: string, hash = ''): 'office' | 'broker' {
  const params = new URLSearchParams(search);
  if (params.has('office') || params.has('mock') || params.has('agent') || params.has('delivery') || hash === '#meus-agentes') return 'office';
  return params.get('broker') === '1' ? 'broker' : 'office';
}
