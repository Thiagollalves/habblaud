import { randomUUID } from 'node:crypto';
import { emptyBroker, simulationEvents, type BrokerEvent, type BrokerSnapshot } from '../../shared/broker';
import { tr } from '../../shared/i18n';

/** Canal independente: não escreve no Office, históricos do Codex ou uplink do World. */
export class BrokerService {
  private state = emptyBroker();
  private seen = new Set<string>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  snapshot(): BrokerSnapshot { return structuredClone(this.state); }
  subscribe(cb: () => void): () => void { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private emit(): void { for (const cb of this.listeners) cb(); }
  apply(e: BrokerEvent): void {
    const key = `${e.source}:${e.id}`;
    if (this.seen.has(key)) return;
    if (e.type === 'status') {
      const old = this.state.agents.find(a => a.id === e.agent.id);
      if (old && old.source !== e.source) throw new Error(tr('Identificador já pertence a outra origem.'));
      if (!old && this.state.agents.length >= 300) throw new Error(tr('Limite de analistas atingido.'));
      if (!old || old.updated_at <= e.agent.updated_at) this.state.agents = [...this.state.agents.filter(a => a.id !== e.agent.id), { ...e.agent, source: e.source }];
    } else {
      const agentId = e.type === 'order' ? e.order.agent_id : e.activity.agent_id;
      if (!this.state.agents.some(a => a.id === agentId && a.source === e.source)) throw new Error(tr('Registre o analista antes do evento.'));
      if (e.type === 'order') {
        if (this.state.orders.some(o => o.id === e.order.id)) throw new Error(tr('Ordem já registrada.'));
        if (this.state.orders.length >= 1000) throw new Error(tr('Limite de ordens atingido.'));
        this.state.orders.push({ ...e.order, source: e.source });
      } else if (!this.state.events.some(a => a.id === e.activity.id && a.source === e.source)) this.state.events = [...this.state.events, { ...e.activity, source: e.source }].slice(-200);
    }
    this.seen.add(key);
    if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value!);
    this.emit();
  }
  decide(id: string, status: 'approved' | 'rejected'): boolean {
    const order = this.state.orders.find(o => o.id === id);
    if (!order || order.status !== 'pending') return false;
    order.status = status;
    order.decided_at = Date.now();
    this.state.events = [...this.state.events, { id: randomUUID(), agent_id: order.agent_id, source: order.source, at: Date.now(), description: status === 'approved' ? tr('{0}: autorização registrada; aguardando o agente.', [order.ticker]) : tr('{0}: operação rejeitada.', [order.ticker]) }].slice(-200);
    this.emit();
    return true;
  }
  simulate(enabled: boolean): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.state.simulating = enabled;
    if (enabled) {
      this.clearSimulation();
      const run = randomUUID().slice(0, 8);
      let tick = 0;
      const completed = new Set<string>();
      const step = () => {
        for (const e of simulationEvents(tick++, run)) this.apply(e);
        for (const order of this.state.orders) {
          if (order.source !== 'simulation' || order.status !== 'approved' || completed.has(order.id)) continue;
          const agent = this.state.agents.find(a => a.id === order.agent_id);
          if (!agent) continue;
          completed.add(order.id);
          const at = Date.now();
          this.apply({ id: `${order.id}-execute`, source: 'simulation', type: 'status', agent: { ...agent, state: 'executing', updated_at: at, description: tr('Execução fictícia para testar o fluxo visual.') } });
          this.apply({ id: `${order.id}-complete`, source: 'simulation', type: 'activity', activity: { id: `${order.id}-complete`, agent_id: agent.id, at, description: tr('Simulação: ordem {0} concluída. Nenhuma negociação realizada.', [order.ticker]) } });
        }
      };
      for (let i = 0; i < 6; i++) step();
      this.timer = setInterval(() => { try { step(); } catch { this.simulate(false); } }, 3500);
      this.timer.unref();
    }
    this.emit();
  }
  clearSimulation(): void {
    this.state.agents = this.state.agents.filter(a => a.source !== 'simulation');
    this.state.orders = this.state.orders.filter(a => a.source !== 'simulation');
    this.state.events = this.state.events.filter(a => a.source !== 'simulation');
    for (const key of this.seen) if (key.startsWith('simulation:')) this.seen.delete(key);
  }
  dispose(): void { if (this.timer) clearInterval(this.timer); this.listeners.clear(); }
}
