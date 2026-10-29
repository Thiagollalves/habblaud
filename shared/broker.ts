import { tr } from './i18n';

export const DESKS = [
  { id: 'equities', name: tr('Mesa de Renda Variável') },
  { id: 'macro', name: tr('Análise Macro') },
  { id: 'income', name: tr('FIIs & Dividendos') },
  { id: 'crypto', name: tr('Cripto & Derivativos') },
  { id: 'private', name: tr('Atendimento Private') },
  { id: 'compliance', name: tr('Compliance') },
] as const;
export type DeskId = typeof DESKS[number]['id'];
export const STATES = {
  analyzing: tr('Analisando ativo...'), reading: tr('Lendo fato relevante...'),
  risk: tr('Calculando risco...'), executing: tr('Executando ordem...'),
  idle: tr('Disponível'), offline: tr('Fora da mesa'),
} as const;
export type BrokerSource = 'simulation' | 'integration';
export interface BrokerAgent {
  id: string; name: string; room_id: DeskId; state: keyof typeof STATES;
  description: string; updated_at: number;
  /** Destino em tiles relativos à sala. null deixa o motor escolher a mesa. */
  x: number | null; y: number | null;
}
export interface BrokerOrder {
  id: string; agent_id: string; ticker: string; side: 'buy' | 'sell';
  quantity: number; value: number; thesis: string;
  status: 'pending' | 'approved' | 'rejected'; created_at: number; decided_at: number | null;
}
export interface BrokerActivity { id: string; agent_id: string; description: string; at: number }
export type BrokerEvent = { id: string; source: BrokerSource } & (
  { type: 'status'; agent: BrokerAgent } |
  { type: 'activity'; activity: BrokerActivity } |
  { type: 'order'; order: BrokerOrder }
);
export interface BrokerSnapshot {
  agents: (BrokerAgent & { source: BrokerSource })[];
  orders: (BrokerOrder & { source: BrokerSource })[];
  events: (BrokerActivity & { source: BrokerSource })[];
  simulating: boolean;
}
export const emptyBroker = (): BrokerSnapshot => ({ agents: [], orders: [], events: [], simulating: false });
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(tr('Objeto JSON inválido.'));
  return v as Record<string, unknown>;
};
const str = (v: unknown, max = 160): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(tr('Texto ausente ou longo demais.'));
  return v.trim();
};
const id = (v: unknown): string => {
  const s = str(v, 100);
  if (!/^[\w-]+$/.test(s)) throw new Error(tr('Identificador inválido.'));
  return s;
};
const num = (v: unknown, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(tr('Número fora dos limites.'));
  return v;
};
const timestamp = (v: unknown) => num(v, 0, Date.now() + 60_000);
export function parseBrokerAgent(value: unknown): BrokerAgent {
  const a = obj(value);
  if (!DESKS.some(d => d.id === a.room_id) || typeof a.state !== 'string' || !Object.hasOwn(STATES, a.state)) throw new Error(tr('Mesa ou estado inválido.'));
  const x = a.x == null ? null : num(a.x, 1, 14);
  const y = a.y == null ? null : num(a.y, 2, 10);
  if ((x === null) !== (y === null) || (x !== null && (!Number.isInteger(x) || !Number.isInteger(y)))) throw new Error(tr('Informe x e y inteiros juntos.'));
  return { id: id(a.id), name: str(a.name, 70), room_id: a.room_id as DeskId, state: a.state as BrokerAgent['state'], description: str(a.description, 300), updated_at: timestamp(a.updated_at), x, y };
}
export function parseBrokerOrder(value: unknown): BrokerOrder {
  const o = obj(value);
  if (o.side !== 'buy' && o.side !== 'sell') throw new Error(tr('Operação inválida.'));
  if (!['pending', 'approved', 'rejected'].includes(String(o.status))) throw new Error(tr('Decisão inválida.'));
  const ticker = str(o.ticker, 20);
  if (!/^[A-Z0-9./-]+$/.test(ticker)) throw new Error(tr('Ativo inválido.'));
  return { id: id(o.id), agent_id: id(o.agent_id), ticker, side: o.side, quantity: num(o.quantity, 0.00000001, 1e12), value: num(o.value, 0.01, 1e14), thesis: str(o.thesis, 2000), status: o.status as BrokerOrder['status'], created_at: timestamp(o.created_at), decided_at: o.decided_at == null ? null : timestamp(o.decided_at) };
}
export function parseBrokerActivity(value: unknown): BrokerActivity {
  const a = obj(value);
  return { id: id(a.id), agent_id: id(a.agent_id), description: str(a.description, 500), at: timestamp(a.at) };
}
export function parseBrokerEvent(value: unknown): BrokerEvent {
  const e = obj(value);
  if (e.source !== 'simulation' && e.source !== 'integration') throw new Error(tr('Origem inválida.'));
  const base: { id: string; source: BrokerSource } = { id: id(e.id), source: e.source };
  if (e.type === 'status') return { ...base, type: 'status', agent: parseBrokerAgent(e.agent) };
  if (e.type === 'activity') return { ...base, type: 'activity', activity: parseBrokerActivity(e.activity) };
  if (e.type === 'order') {
    const order = parseBrokerOrder(e.order);
    if (order.status !== 'pending' || order.decided_at !== null) throw new Error(tr('Novas ordens devem estar pendentes.'));
    return { ...base, type: 'order', order };
  }
  throw new Error(tr('Tipo de evento inválido.'));
}

/** Eventos exclusivamente fictícios, usados pelo botão local e pelo script CLI. */
export function simulationEvents(tick: number, run: string, at = Date.now()): BrokerEvent[] {
  const names = [tr('Analista Quant'), tr('Estrategista Macro'), tr('Analista de Dividendos'), tr('Analista Cripto'), tr('Assessor Private'), tr('Supervisor de Risco')];
  const i = tick % DESKS.length;
  const agentId = `sim-${run}-${i}`;
  const eventId = `sim-${run}-${tick}`;
  const state: BrokerAgent['state'] = ['analyzing', 'reading', 'risk'][Math.floor(tick / 6) % 3] as BrokerAgent['state'];
  const room = tick >= 12 && i === 0 && Math.floor(tick / 6) % 2 === 0 ? 'compliance' : DESKS[i].id;
  const events: BrokerEvent[] = [{ id: eventId, source: 'simulation', type: 'status', agent: { id: agentId, name: names[i], room_id: room, state, description: STATES[state], x: null, y: null, updated_at: at } },
    { id: `${eventId}-log`, source: 'simulation', type: 'activity', activity: { id: `${eventId}-log`, agent_id: agentId, description: tr('Simulação: {0}', [STATES[state]]), at } }];
  if (tick % 6 === 0) events.push({ id: `${eventId}-order`, source: 'simulation', type: 'order', order: { id: `${eventId}-order`, agent_id: agentId, ticker: 'PETR4', side: 'buy', quantity: 100, value: 3500, thesis: tr('Exemplo fictício para testar a autorização humana. Não representa recomendação ou cotação atual.'), status: 'pending', created_at: at, decided_at: null } });
  return events;
}
