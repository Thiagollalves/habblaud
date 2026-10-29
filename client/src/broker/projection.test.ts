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
});
