import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseBrokerEvent } from '../../shared/broker';
import { tr } from '../../shared/i18n';
import { readJson, sendJson, HttpError } from '../http/app';
import { BrokerService } from './service';

export function brokerHandler(service: BrokerService) {
  return (req: IncomingMessage, res: ServerResponse, path: string): void => {
    const run = async () => {
      if (path === '/api/broker/stream' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        const send = () => { if (!res.destroyed) res.write(`event: snapshot\ndata: ${JSON.stringify(service.snapshot())}\n\n`); };
        const off = service.subscribe(send);
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20_000);
        res.on('close', () => { off(); clearInterval(heartbeat); });
        send();
        return;
      }
      if (path === '/api/broker/snapshot' && req.method === 'GET') return sendJson(res, 200, service.snapshot());
      if (req.method !== 'POST') return sendJson(res, 405, { error: tr('Método não permitido.') });
      const body = await readJson(req, 16 * 1024);
      if (path === '/api/broker/event') {
        service.apply(parseBrokerEvent(body));
        return sendJson(res, 202, { ok: true });
      }
      if (path === '/api/broker/simulation') {
        if (!body || typeof body !== 'object' || !('enabled' in body) || typeof body.enabled !== 'boolean') throw new Error(tr('Informe enabled: true ou false.'));
        service.simulate(body.enabled);
        return sendJson(res, 200, service.snapshot());
      }
      const match = /^\/api\/broker\/orders\/([\w-]+)\/decision$/.exec(path);
      if (match) {
        if (!body || typeof body !== 'object' || !('status' in body) || (body.status !== 'approved' && body.status !== 'rejected')) throw new Error(tr('Decisão inválida.'));
        return service.decide(match[1], body.status) ? sendJson(res, 200, { ok: true }) : sendJson(res, 409, { error: tr('Ordem inexistente ou já respondida. Atualize a lista.') });
      }
      sendJson(res, 404, { error: tr('Rota desconhecida.') });
    };
    void run().catch((err: unknown) => {
      if (res.headersSent) return res.destroy();
      sendJson(res, err instanceof HttpError ? err.status : 400, { error: err instanceof Error ? err.message : tr('Evento inválido.') });
    });
  };
}
