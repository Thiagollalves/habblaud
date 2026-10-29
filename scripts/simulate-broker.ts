import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { simulationEvents } from '../shared/broker';
import { tr } from '../shared/i18n';

const base = process.env.BROKER_URL ?? 'http://127.0.0.1:4747';
const url = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error(tr('O simulador só envia eventos ao servidor local.'));
const limit = Number(process.env.BROKER_SIM_STEPS ?? 60);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error(tr('BROKER_SIM_STEPS deve estar entre 1 e 500.'));
const run = randomUUID().slice(0, 8);
let stopped = false;
process.once('SIGINT', () => { stopped = true; });
console.log(tr('Simulação fictícia em {0}. Ctrl+C encerra; nenhuma ordem real será enviada.', [base]));
for (let tick = 0; tick < limit && !stopped; tick++) {
  for (const event of simulationEvents(tick, run)) {
    const response = await fetch(new URL('/api/broker/event', url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(tr('Servidor recusou evento: {0} {1}', [response.status, await response.text()]));
  }
  console.log(tr('Ciclo simulado {0}/{1}', [tick + 1, limit]));
  if (tick + 1 < limit) await delay(3500);
}
