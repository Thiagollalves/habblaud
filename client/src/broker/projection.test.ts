import { describe, expect, it } from 'vitest';
import { emptyBroker, simulationEvents } from '../../../shared/broker';
import { brokerProjection, orderViews } from './projection';

describe('projeção da corretora', () => {
  it('levanta a mão enquanto a ordem está pendente, sem criar permissão de shell', () => {
    const local = emptyBroker();
    for (const e of simulationEvents(0, 'projection')) {
      if (e.type === 'status') local.agents.push({ ...e.agent, source: e.source });
      if (e.type === 'order') local.orders.push({ ...e.order, source: e.source });
    }
    const cloud = { agents: [], orders: [], events: [] };
    let snap = brokerProjection(local, cloud, null, 1);
    expect(snap.agents[0].status).toBe('waiting');
    expect(snap.agents[0].permission).toBeUndefined();
    local.orders[0].status = 'rejected';
    snap = brokerProjection(local, cloud, null, 2);
    expect(snap.agents[0].status).toBe('working');
    expect(snap.meta.world).toBeUndefined();
    expect(orderViews(local, cloud)[0].origin).toBe('simulation');
  });
  it('mantém mesas vazias e separa identidades da nuvem e da máquina', () => {
    const event = simulationEvents(0, 'same')[0];
    if (event.type !== 'status') throw new Error('fixture');
    const local = emptyBroker(); local.agents.push({ ...event.agent, source: 'simulation' });
    const snap = brokerProjection(local, { agents: [event.agent], orders: [], events: [] }, null, 1);
    expect(snap.rooms).toHaveLength(6);
    expect(new Set(snap.agents.map(a => a.id)).size).toBe(2);
  });
  it('preserva as salas de cada projeto Codex e o vínculo entre agente e subagente', () => {
    const event = simulationEvents(0, 'native')[0];
    if (event.type !== 'status') throw new Error('fixture');
    const local = emptyBroker(); local.agents.push({ ...event.agent, source: 'simulation' });
    const cloud = { agents: [], orders: [], events: [] };
    const native = brokerProjection(local, cloud, null, 1);
    const base = native.agents[0];
    native.rooms = [
      { id: '/trading', name: 'Trading', path: '/trading', slot: 2, seed: 1, createdAt: 1 },
      { id: '/supervisor', name: 'Supervisão', path: '/supervisor', slot: 5, seed: 2, createdAt: 1 },
    ];
    native.agents = [
      { ...base, id: 'codex:main', provider: 'codex', roomId: '/trading', canMessage: true },
      { ...base, id: 'codex:sub', provider: 'codex', kind: 'sub', parentId: 'codex:main', roomId: '/supervisor' },
    ];
    const result = brokerProjection(emptyBroker(), cloud, native, 2);
    expect(result.rooms.slice(-2).map(r => [r.id, r.name])).toEqual([['native:/trading', 'Trading'], ['native:/supervisor', 'Supervisão']]);
    expect(result.agents.map(a => a.roomId)).toEqual(['native:/trading', 'native:/supervisor']);
    expect(result.agents[1].parentId).toBe('native:codex:main');
    expect(native.agents[0].id).toBe('codex:main');
    expect(native.agents[0].canMessage).toBe(true);
  });
});
