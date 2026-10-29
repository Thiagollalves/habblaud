import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBrokerEvent, simulationEvents } from '../../shared/broker';
import { BrokerService } from './service';

const service = new BrokerService();
afterEach(() => { service.simulate(false); service.clearSimulation(); vi.useRealTimers(); });
describe('corretora: contrato e decisões', () => {
  it('valida entrada e rejeita ordens pré-aprovadas, NaN e destinos inválidos', () => {
    const events = simulationEvents(0, 'test');
    expect(parseBrokerEvent(events[0])).toEqual(events[0]);
    expect(() => parseBrokerEvent({ ...events[2], order: { ...('order' in events[2] ? events[2].order : {}), status: 'approved' } })).toThrow();
    const status = events[0];
    if (status.type !== 'status') throw new Error('fixture');
    expect(() => parseBrokerEvent({ ...status, agent: { ...status.agent, x: NaN, y: 3 } })).toThrow();
    expect(() => parseBrokerEvent({ ...status, agent: { ...status.agent, state: '__proto__' } })).toThrow();
    expect(() => parseBrokerEvent({ ...status, agent: { ...status.agent, x: 2, y: null } })).toThrow();
  });
  it('deduplica eventos e aceita apenas a primeira decisão', () => {
    const events = simulationEvents(0, 'test');
    for (const e of [...events, ...events]) service.apply(parseBrokerEvent(e));
    const before = service.snapshot();
    expect(before.agents).toHaveLength(1); expect(before.orders).toHaveLength(1);
    expect(service.decide(before.orders[0].id, 'approved')).toBe(true);
    expect(service.decide(before.orders[0].id, 'rejected')).toBe(false);
    expect(service.snapshot().orders[0].status).toBe('approved');
    expect(service.snapshot().events.at(-1)?.description).toContain('aguardando');
  });
  it('não aceita uma ordem antes de registrar o agente', () => {
    expect(() => service.apply(simulationEvents(0, 'orphan')[2])).toThrow();
  });
  it('não permite que outra origem substitua um agente nem que eventos antigos regressem seu estado', () => {
    const e = simulationEvents(0, 'order')[0];
    if (e.type !== 'status') throw new Error('fixture');
    service.apply(e);
    expect(() => service.apply({ ...e, id: 'another', source: 'integration' })).toThrow();
    service.apply({ ...e, id: 'old', agent: { ...e.agent, name: 'Antigo', updated_at: e.agent.updated_at - 1 } });
    expect(service.snapshot().agents[0].name).toBe(e.agent.name);
  });
  it('simulação inicia e pausa sem apagar as decisões', () => {
    service.simulate(true);
    expect(service.snapshot().agents).toHaveLength(6);
    expect(service.snapshot().orders).toHaveLength(1);
    service.simulate(false);
    expect(service.snapshot().simulating).toBe(false);
    expect(service.snapshot().agents).toHaveLength(6);
  });
  it('somente ordens simuladas aprovadas geram uma conclusão fictícia', () => {
    vi.useFakeTimers();
    service.simulate(true);
    const order = service.snapshot().orders[0];
    service.decide(order.id, 'approved');
    vi.advanceTimersByTime(3500);
    expect(service.snapshot().events.filter(e => e.id === `${order.id}-complete`)).toHaveLength(1);
    expect(service.snapshot().agents.find(a => a.id === order.agent_id)?.state).toBe('executing');
    vi.advanceTimersByTime(7000);
    expect(service.snapshot().events.filter(e => e.id === `${order.id}-complete`)).toHaveLength(1);
  });
});
