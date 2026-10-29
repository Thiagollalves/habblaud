# Corretora de agentes de IA

## Mapeamento antes da implementação

| Responsabilidade | Arquivos atuais | Transformação |
| --- | --- | --- |
| Inicialização | `client/src/main.ts`, `app.ts` | Entrada da corretora; escritório original acessível por `?office=1`. |
| Geometria e salas | `client/src/world/layout/{core,room,building}.ts` | Tema opcional da corretora e setores próprios, preservando colisões. |
| Coordenadas, caminhos, poses | `client/src/world/sim/{sim,character,behavior}.ts`, `world/path/` | Reutilizar movimento por sala e mão levantada; aceitar destinos dentro de salas. |
| Etiquetas e contadores | `client/src/world/render/overlay.ts` | Rótulos do tema; contadores existentes de agentes e pendências. |
| HUD e atividades originais | `client/src/ui/{topbar,feed,index}.ts` | Preservar no escritório; nova interface em `client/src/broker/`. |
| Permissões de comandos | `client/src/ui/permission.ts`, `server/permissions/` | Preservar; autorização financeira tem contrato e rotas independentes. |
| Leituras locais | `server/sources/codex/{source,files,history}.ts`, `server/watcher/` | Preservar leitores do Codex/Claude. |
| Modelo e transporte | `server/model/office.ts`, `server/http/{app,sse}.ts`, `client/src/net/store.ts` | Acrescentar canal broker isolado do modelo nativo e do Habblaud World. |
| Supabase | novos `client/src/broker/cloud.ts`, `supabase/` | Auth, carga inicial, Realtime e UPDATE condicional de ordens. |

Decisão confirmada: **Codex local + Supabase + simulação local**. O fork Thiagollalves/habblaud partiu da mesma revisão da instalação. A biblioteca Meus agentes permanece disponível.

Os indicadores financeiros iniciais são demonstrativos. Aprovação registra uma decisão; não envia ordens a uma corretora. Eventos simulados ficam no canal broker e nunca alimentam o Habblaud World. As atividades originais do Codex conservam sua descrição real.

## Usar

1. `npm ci`, depois `npm run build`.
2. Inicie com `node --env-file=.env dist/server/index.js` ou use o atalho local já instalado. `npm run dev` inicia o ambiente de desenvolvimento.
3. Abra `http://127.0.0.1:4747/`. O nome visual **Nexus Capital** é provisório.
4. Clique em **Iniciar simulação**. Seis analistas fictícios ocupam as mesas e um pedido PETR4 aparece para revisão. Clique no pedido ou no avatar com a mão levantada.
5. **Pausar simulação** interrompe novos eventos e conserva os registros para revisão. Iniciar novamente substitui somente os dados simulados. Nenhuma ordem real é criada ou enviada.
6. Alternativa: `npm run simulate:broker` envia 60 ciclos a cada 3,5 segundos. `BROKER_SIM_STEPS` muda a quantidade, até 500. Ctrl+C encerra. Não rode os dois simuladores juntos.

O botão **Meus agentes** abre as skills e o histórico do Codex preservados no escritório original. Somente sessões realmente abertas aparecem como agentes locais. Skills salvas são instruções, não processos permanentemente em execução.

## Contrato REST local

`POST /api/broker/event`, Content-Type `application/json`. Exemplo de registro de um analista:

```json
{
  "id": "evento-001", "source": "integration", "type": "status",
  "agent": {
    "id": "quant-01", "name": "Analista Quant", "room_id": "equities",
    "state": "analyzing", "description": "Analisando relatório trimestral",
    "x": null, "y": null, "updated_at": 1793290000000
  }
}
```

Use `Date.now()` para timestamps em milissegundos. Mesas: `equities`, `macro`, `income`, `crypto`, `private`, `compliance`. Estados: `analyzing`, `reading`, `risk`, `executing`, `idle`, `offline`.

- `type: "activity"`: objeto `activity` com `id`, `agent_id`, `description`, `at`.
- `type: "order"`: objeto `order` com `id`, `agent_id`, `ticker`, `side` (`buy`/`sell`), `quantity`, `value` (total em BRL), `thesis`, `status: "pending"`, `created_at`, `decided_at: null`.
- Registre o analista antes das atividades e ordens. IDs devem ser únicos; retransmitir o mesmo ID de evento é idempotente dentro da janela de deduplicação (5.000 eventos).
- Coordenadas `x,y` são tiles inteiros relativos à sala (x de 1 a 14, y de 2 a 10). Ambos podem ser null; destinos bloqueados por mobiliário são ignorados e o motor escolhe uma mesa.
- Consulte `GET /api/broker/snapshot` ou assine `GET /api/broker/stream` (SSE). `POST /api/broker/orders/:id/decision` recebe `{ "status": "approved" }` ou `rejected`; segunda decisão retorna 409.
- O endpoint é restrito ao loopback, com validação de Host, Origin e JSON. Webhooks externos devem usar o Supabase ou um backend autenticado, não expor esta porta por túnel.

O canal local fica **em memória**: reiniciar o servidor apaga esses eventos/decisões. Limites: 300 agentes, 1.000 ordens e 200 eventos recentes. Para persistência, use o Supabase. A API local não replica automaticamente dados privados do Codex para a nuvem.

## Supabase

Schema versionado em `supabase/migrations/`. Tabelas: `agents_status`, `agent_events` e `order_approvals`, com Realtime habilitado.

Acrescente `VITE_SUPABASE_URL` e uma chave **publicável** em `VITE_SUPABASE_ANON_KEY` ao `.env` da raiz (exemplo em `.env.broker.example`). Nunca use uma chave secreta/service_role no frontend. Refaça o build após mudar essas variáveis.

No aplicativo, **Conectar Supabase → Criar meu acesso** cria uma conta mediante ação do usuário. Confirme o e-mail e entre com sua senha. No Dashboard Supabase → Authentication → URL Configuration, configure Site URL e Redirect URLs para a URL usada pelo aplicativo. Se a confirmação redirecionar para outra porta, volte manualmente à corretora e faça login.

Cada registro contém `owner_id`, que deve ser o UUID da conta do usuário em Authentication. O backend confiável do agente insere/atualiza os registros com essa propriedade. A chave privilegiada fica exclusivamente nesse backend.

O navegador lê apenas os registros do próprio usuário (RLS). Nas ordens, só pode alterar `status` e `decided_at`, uma única vez a partir de `pending`. `owner_id`, ativo, quantidade, valor e tese não podem ser modificados pelo navegador. A carga inicial é refeita após reconexão ao Realtime; sair da conta limpa a visão cloud.

O backend do agente deve observar a decisão e implementar sua própria execução e reconciliação. Este projeto não integra nenhuma API de envio de ordens financeiras.

Referência consultada: [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) e [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Verificação desta implementação

- TypeScript estrito e build Vite/servidor validados.
- Fluxo HTTP real de eventos → SSE → decisão, deduplicação, rejeição de segunda decisão e isolamento do Office nativo cobertos por testes.
- Poses e destinos caminháveis do Canvas testados sem navegador.
- Supabase: testes transacionais de RLS com duas identidades confirmaram isolamento, decisão única, campos financeiros imutáveis e bloqueio de leitura anônima. Fixtures revertidas; sem usuários/ordens de teste persistidos.
- Suíte completa no Windows: 1.860 passaram, 18 ignorados e 17 falharam. As mesmas 17 falhas foram reproduzidas nos nove arquivos correspondentes do código original (caminhos, permissões POSIX, executáveis e CRLF). Um teste adicional de conclusão simulada foi incluído depois dessa execução.
- Inspeção visual pendente: o controle de navegador estava desativado nas configurações do Work. Não há captura ou alegação de validação visual.
- A conexão Realtime autenticada com um usuário real depende de cadastro/login no aplicativo; o schema, as políticas e a chave pública já podem ser configurados independentemente disso.
