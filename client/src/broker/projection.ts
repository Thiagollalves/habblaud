import { DESKS, STATES, type BrokerSnapshot, type BrokerOrder } from '../../../shared/broker';
import { hash32 } from '../../../shared/hash';
import { tr } from '../../../shared/i18n';
import type { AgentInfo, OfficeSnapshot } from '../../../shared/types';
import type { CloudSnapshot } from './cloud';

export type OrderView = BrokerOrder & { origin: 'cloud' | 'simulation' | 'integration'; agentName: string };
export function orderViews(local: BrokerSnapshot, cloud: CloudSnapshot): OrderView[] {
  return [...local.orders.map(o => ({ ...o, origin: o.source, agentName: local.agents.find(a => a.id === o.agent_id)?.name ?? o.agent_id })),
    ...cloud.orders.map(o => ({ ...o, origin: 'cloud' as const, agentName: cloud.agents.find(a => a.id === o.agent_id)?.name ?? o.agent_id }))];
}
export function brokerProjection(local: BrokerSnapshot, cloud: CloudSnapshot, native: OfficeSnapshot | null, rev: number): OfficeSnapshot {
  const now = Date.now();
  const rooms = DESKS.map((d, slot) => ({ id: `broker:${d.id}`, name: d.name, path: '', slot, seed: hash32(d.id), createdAt: now }));
  const agents: AgentInfo[] = [];
  const groups = [{ source: 'local', agents: local.agents, orders: local.orders }, { source: 'cloud', agents: cloud.agents, orders: cloud.orders }];
  for (const g of groups) for (const a of g.agents) {
    const pending = g.orders.some(o => o.agent_id === a.id && o.status === 'pending');
    const origin = 'source' in a ? a.source : 'cloud';
    const activity = { id: `${g.source}:${a.id}:${a.updated_at}`, kind: 'think' as const, icon: pending ? '✋' : '◈', text: pending ? tr('Autorizar operação') : STATES[a.state], detail: a.description, at: a.updated_at };
    agents.push({ id: `${g.source}:${a.id}`, kind: 'main', roomId: `broker:${a.room_id}`, name: a.name, look: hash32(a.id) % 2 ? 'f' : 'm', role: String(origin), sessionId: '', account: '',
      status: a.state === 'offline' ? 'offline' : pending ? 'waiting' : a.state === 'idle' ? 'idle' : 'working', waitingFor: pending ? tr('Autorização de operação') : undefined,
      activity, recent: [activity], tasks: [], startedAt: a.updated_at, lastEventAt: a.updated_at, statusSince: a.updated_at, seed: hash32(a.id),
      brokerPosition: a.x !== null && a.y !== null ? { x: a.x, y: a.y } : undefined,
      stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 } });
  }
  // Mantém o que o Codex realmente está fazendo, sem converter comandos em operações financeiras.
  if (native) {
    rooms.push(...[...native.rooms].sort((a, b) => a.slot - b.slot).map((room, index) => ({ ...room, id: `native:${room.id}`, slot: DESKS.length + index })));
    agents.push(...native.agents.map(a => ({ ...a, id: `native:${a.id}`, parentId: a.parentId ? `native:${a.parentId}` : undefined, roomId: `native:${a.roomId}`, role: a.provider === 'codex' ? tr('Codex local') : tr('Claude local'), permission: undefined, canMessage: false })));
  }
  return { rev, serverTime: now, rooms, agents, accounts: native?.accounts ?? [], meta: { demo: false, sources: [], startedAt: now, version: 'broker', terminal: false } };
}
