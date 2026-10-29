import '@fontsource/pixelify-sans/500.css';
import './style.css';
import { h } from '../ui/dom';
import { OfficeStore } from '../net/store';
import { createWorld } from '../world';
import { emptyBroker, DESKS, type BrokerSnapshot } from '../../../shared/broker';
import { tr } from '../../../shared/i18n';
import { BrokerCloud } from './cloud';
import { brokerProjection, orderViews, type OrderView } from './projection';

const money = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(n);
const label = (text: string) => h('span', { class: 'b-label', text });
const button = (text: string, click: () => void, cls = '') => h('button', { class: `b-button ${cls}`, type: 'button', text, on: { click } });
const sourceName = (s: string) => s === 'simulation' ? tr('SIMULAÇÃO') : s === 'cloud' ? tr('SUPABASE') : s === 'integration' ? tr('INTEGRAÇÃO LOCAL') : s === 'claude' || s === 'Claude local' ? tr('CLAUDE LOCAL') : tr('CODEX LOCAL');
async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const result = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error ?? tr('Erro {0}', [res.status]));
  }
}

export function start(): void {
  document.title = tr('Nexus Capital • Corretora de agentes');
  document.documentElement.lang = 'pt-BR';
  const root = document.getElementById('ui')!;
  root.classList.add('broker-ui');
  const native = new OfficeStore();
  const view = new OfficeStore();
  const world = createWorld(document.getElementById('world') as HTMLCanvasElement, view, { brokerage: true });
  world.setOptions({ brokerage: true, theme: 'none', daylight: 'day', liveliness: 'calm', bubbles: 'all' });
  let local = emptyBroker();
  let rev = 0;
  let selected: string | null = null;
  let queued = false;
  let currentOrder: OrderView | null = null;
  let submitting = false;
  let brokerConnected = false;
  let listSignature = '';
  let orderSignature = '';
  let logSignature = '';
  const cloud = new BrokerCloud(schedule);
  const alert = h('p', { class: 'b-alert', role: 'status', attrs: { 'aria-live': 'polite' }, hidden: true });
  const showError = (error: unknown) => {
    alert.hidden = false;
    alert.textContent = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  };
  const nativeStatus = h('span', { class: 'b-source', text: tr('Codex: conectando') });
  const cloudStatus = h('span', { class: 'b-source', text: cloud.status });
  const apiStatus = h('span', { class: 'b-source', text: tr('Eventos: conectando') });
  const simButton = button(tr('Iniciar simulação'), () => {
    simButton.disabled = true;
    void post('/api/broker/simulation', { enabled: !local.simulating }).catch(showError).finally(() => { simButton.disabled = false; });
  }, 'b-button--primary');
  const cloudButton = button(tr('Conectar Supabase'), () => loginDialog.showModal());
  const header = h('header', { class: 'b-header' },
    h('a', { class: 'b-brand', attrs: { href: '/', 'aria-label': tr('Voltar ao escritório Codex') } }, h('span', { class: 'b-mark', text: 'N' }), h('span', {}, h('strong', { text: 'NEXUS CAPITAL' }), h('small', { text: tr('CORRETORA DE AGENTES · LAB') }))),
    h('nav', { class: 'b-actions', attrs: { 'aria-label': tr('Controles da corretora') } },
      h('a', { class: 'b-link', text: tr('Escritório Codex ↗'), attrs: { href: '/' } }),
      h('a', { class: 'b-link', text: tr('Meus agentes ↗'), attrs: { href: '/?office=1#meus-agentes' } }), cloudButton, simButton));
  const metric = (title: string, value: string, note: string, cls = '') => h('div', { class: `b-metric ${cls}` }, label(title), h('strong', { text: value }), h('small', { text: note }));
  const agentCount = h('strong', { text: '0' });
  const pendingCount = h('strong', { text: '0' });
  const kpis = h('section', { class: 'b-kpis', attrs: { 'aria-label': tr('Indicadores demonstrativos') } },
    metric(tr('PATRIMÔNIO SOB GESTÃO'), money(10_500_000), tr('Carteira demonstrativa')),
    metric(tr('P&L DIÁRIO'), `+ ${money(24_850)}`, tr('+0,24% · exemplo, sem cotação ao vivo'), 'b-positive'),
    metric(tr('RISCO DA CARTEIRA'), tr('Moderado'), tr('Exposição ilustrativa: 42%'), 'b-risk'),
    h('div', { class: 'b-metric b-metric--small' }, label(tr('AGENTES PRESENTES')), agentCount, h('small', { text: tr('Origens identificadas abaixo') })),
    h('div', { class: 'b-metric b-metric--small' }, label(tr('AUTORIZAÇÕES')), pendingCount, h('small', { text: tr('Aguardando sua decisão') })));
  const desks = h('div', { class: 'b-desks' });
  const agents = h('div', { class: 'b-agents' });
  const left = h('aside', { class: 'b-panel b-left' }, label(tr('OPERAÇÃO')), h('h2', { text: tr('Mesas & analistas') }), desks,
    h('div', { class: 'b-divider' }), label(tr('EQUIPE PRESENTE')), agents);
  const orders = h('div', { class: 'b-orders' });
  const detail = h('div', { class: 'b-detail' });
  const right = h('aside', { class: 'b-panel b-right' }, label(tr('HUMANO NO CONTROLE')), h('h2', { text: tr('Autorizações') }),
    button(tr('Fechar painel'), () => right.classList.remove('b-panel-open'), 'b-mobile-close'),
    h('p', { class: 'b-muted', text: tr('Revise a tese antes de liberar uma operação.') }), orders, h('div', { class: 'b-divider' }), label(tr('ANALISTA SELECIONADO')), detail,
    h('p', { class: 'b-disclaimer', text: tr('Aprovar registra uma decisão. Este laboratório não envia ordens à bolsa.') }));
  const mapTools = h('section', { class: 'b-map-tools' }, h('div', {}, label(tr('TRADING FLOOR')), h('h1', { text: tr('Sua inteligência, em movimento.') })),
    h('div', { class: 'b-camera' }, button(tr('Ordens'), () => right.classList.toggle('b-panel-open'), 'b-mobile-orders'), button('−', () => world.zoomBy(0.8)), button(tr('Enquadrar'), () => world.overview()), button('+', () => world.zoomBy(1.25))));
  const logs = h('div', { class: 'b-logs', attrs: { 'aria-label': tr('Eventos recentes do terminal') } });
  const footer = h('footer', { class: 'b-terminal' }, h('div', { class: 'b-terminal-head' }, label(tr('TERMINAL DE EVENTOS')), h('div', { class: 'b-sources' }, nativeStatus, apiStatus, cloudStatus)), logs);
  const modalBody = h('div');
  const modalError = h('p', { class: 'b-error', role: 'alert' });
  const decision = (status: 'approved' | 'rejected') => {
    if (!currentOrder || submitting) return;
    const order = currentOrder;
    submitting = true;
    approve.disabled = reject.disabled = true;
    modalError.textContent = '';
    const request = order.origin === 'cloud' ? cloud.decide(order.id, status) : post(`/api/broker/orders/${encodeURIComponent(order.id)}/decision`, { status });
    void request.then(() => { modal.close(); currentOrder = null; }).catch(error => {
      modalError.textContent = error instanceof Error ? error.message : String(error?.message ?? error);
    }).finally(() => { submitting = false; schedule(); });
  };
  const approve = button(tr('Aprovar Ordem'), () => decision('approved'), 'b-button--primary');
  const reject = button(tr('Rejeitar Operação'), () => decision('rejected'), 'b-button--danger');
  const modal = h('dialog', { class: 'b-modal', attrs: { 'aria-labelledby': 'order-title' } },
    h('div', { class: 'b-modal-top' }, label(tr('AUTORIZAÇÃO DE OPERAÇÃO')), button(tr('Fechar'), () => modal.close())),
    h('h2', { text: tr('Revisar ordem'), attrs: { id: 'order-title' } }), modalBody, modalError,
    h('div', { class: 'b-modal-actions' }, reject, approve));
  const email = h('input', { type: 'email', attrs: { required: true, autocomplete: 'username', id: 'broker-email', placeholder: 'voce@exemplo.com' } });
  const password = h('input', { type: 'password', attrs: { required: true, autocomplete: 'current-password', id: 'broker-password' } });
  const authError = h('p', { class: 'b-error', role: 'alert' });
  const login = h('button', { class: 'b-button b-button--primary', type: 'submit', text: tr('Entrar') });
  const signup = button(tr('Criar meu acesso'), () => {
    if (!form.reportValidity()) return;
    signup.disabled = true;
    void cloud.register(email.value, password.value).then(() => {
      password.value = '';
      authError.textContent = tr('Confira seu e-mail para confirmar o cadastro. Depois, volte a esta tela e entre com sua senha.');
    }).catch(error => { authError.textContent = String(error?.message ?? error); }).finally(() => { signup.disabled = false; });
  });
  const form = h('form', { class: 'b-auth', on: { submit: event => {
    event.preventDefault(); login.disabled = true; authError.textContent = '';
    void cloud.login(email.value, password.value).then(() => { password.value = ''; loginDialog.close(); }).catch(error => { authError.textContent = String(error?.message ?? error); }).finally(() => { login.disabled = false; });
  } } }, h('label', { text: tr('E-mail'), attrs: { for: 'broker-email' } }), email, h('label', { text: tr('Senha'), attrs: { for: 'broker-password' } }), password, login, signup);
  const loginDialog = h('dialog', { class: 'b-modal', attrs: { 'aria-labelledby': 'cloud-title' } },
    h('div', { class: 'b-modal-top' }, label('SUPABASE'), button(tr('Fechar'), () => loginDialog.close())),
    h('h2', { text: tr('Sua corretora na nuvem'), attrs: { id: 'cloud-title' } }),
    h('p', { class: 'b-muted', text: cloud.client ? tr('Use uma conta autorizada do projeto da corretora. Cada conta visualiza e aprova apenas seus próprios registros.') : tr('Conexão ainda não configurada. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env e refaça o build. A simulação local já pode ser usada.') }),
    ...(cloud.client ? [form, button(tr('Sair da conta'), () => { void cloud.logout().then(() => loginDialog.close()).catch(showError); })] : []), authError);
  root.append(header, kpis, left, right, mapTools, footer, alert, modal, loginDialog);

  function openOrder(order: OrderView): void {
    currentOrder = order;
    modalError.textContent = '';
    approve.disabled = reject.disabled = order.status !== 'pending';
    modalBody.replaceChildren(h('span', { class: `b-origin b-origin--${order.origin}`, text: sourceName(order.origin) }),
      h('h3', { class: 'b-order-asset', text: `${order.ticker} · ${order.side === 'buy' ? tr('Compra') : tr('Venda')}` }),
      h('dl', { class: 'b-order-data' }, h('dt', { text: tr('Analista') }), h('dd', { text: order.agentName }),
        h('dt', { text: tr('Volume') }), h('dd', { text: order.quantity.toLocaleString('pt-BR') }),
        h('dt', { text: tr('Valor total') }), h('dd', { text: money(order.value) })),
      label(tr('TESE RESUMIDA')), h('p', { class: 'b-thesis', text: order.thesis }),
      h('p', { class: 'b-muted', text: order.origin === 'simulation' ? tr('Ordem fictícia. A decisão fica apenas no ambiente de teste.') : tr('A decisão será disponibilizada ao agente responsável. A execução depende do backend desse agente.') }));
    modal.showModal();
  }
  function schedule(): void {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }
  function render(): void {
    const snapshot = brokerProjection(local, cloud.snapshot, native.snapshot, ++rev);
    view.publishView(snapshot);
    const active = snapshot.agents.filter(a => a.status !== 'offline' && a.status !== 'done');
    const allOrders = orderViews(local, cloud.snapshot);
    const pending = allOrders.filter(o => o.status === 'pending').sort((a, b) => a.created_at - b.created_at);
    agentCount.textContent = String(active.length);
    pendingCount.textContent = String(pending.length);
    simButton.textContent = local.simulating ? tr('Pausar simulação') : tr('Iniciar simulação');
    nativeStatus.textContent = native.connection === 'open' ? tr('● Codex conectado') : tr('○ Codex desconectado');
    apiStatus.textContent = brokerConnected ? tr('● Eventos locais') : tr('○ Eventos desconectados');
    cloudStatus.textContent = cloud.status;
    cloudButton.textContent = cloud.email ? tr('Conta Supabase') : tr('Conectar Supabase');
    const signature = JSON.stringify(active.map(a => [a.id, a.name, a.status, a.activity?.text, a.roomId]));
    if (signature !== listSignature) {
      listSignature = signature;
      desks.replaceChildren(...snapshot.rooms.map(d => {
        const team = active.filter(a => a.roomId === d.id);
        const waiting = team.filter(a => a.status === 'waiting').length;
        return h('button', { class: 'b-desk', type: 'button', on: { click: () => world.focusRoom(d.id) } }, h('span', { text: d.name }), h('span', { class: 'b-desk-count', text: `${team.length}${waiting ? ` · ✋${waiting}` : ''}` }));
      }));
      agents.replaceChildren(...(active.length ? active.map(a => h('button', { class: 'b-agent', type: 'button', on: { click: () => { selected = a.id; world.select({ type: 'agent', id: a.id }, { focus: true }); schedule(); } } },
        h('span', { class: `b-avatar ${a.status === 'waiting' ? 'is-waiting' : ''}`, text: a.status === 'waiting' ? '✋' : a.name.slice(0, 2).toUpperCase() }),
        h('span', {}, h('strong', { text: a.name }), h('small', { text: a.activity?.text ?? a.role })),
        h('span', { class: 'b-dot', title: a.role, text: '●' }))) : [h('p', { class: 'b-muted', text: tr('Inicie a simulação ou conecte seus agentes para preencher as mesas.') })]));
    }
    const orderKey = JSON.stringify(allOrders);
    if (orderKey !== orderSignature) {
      orderSignature = orderKey;
      orders.replaceChildren(...(pending.length ? pending.map(o => h('button', { class: 'b-order', type: 'button', on: { click: () => openOrder(o) } },
        h('span', { class: 'b-order-line' }, h('strong', { text: o.ticker }), h('span', { class: o.side === 'buy' ? 'b-buy' : 'b-sell', text: o.side === 'buy' ? tr('COMPRA') : tr('VENDA') })),
        h('span', { text: `${o.quantity.toLocaleString('pt-BR')} · ${money(o.value)}` }), h('small', { text: o.agentName }),
        h('span', { class: `b-origin b-origin--${o.origin}`, text: sourceName(o.origin) }), h('span', { class: 'b-order-review', text: tr('Revisar operação →') }))) : [h('div', { class: 'b-empty' }, h('span', { text: '✓' }), h('strong', { text: tr('Nenhuma ordem pendente') }), h('p', { text: tr('Pedidos de autorização aparecerão aqui e no avatar do analista.') }))]));
    }
    if (currentOrder && modal.open) {
      const liveOrder = allOrders.find(o => o.id === currentOrder!.id && o.origin === currentOrder!.origin);
      approve.disabled = reject.disabled = submitting || liveOrder?.status !== 'pending';
      if (!submitting && liveOrder?.status !== 'pending') modalError.textContent = tr('Esta ordem já foi respondida ou removida.');
    }
    const agent = active.find(a => a.id === selected);
    detail.replaceChildren(...(agent ? [h('h3', { text: agent.name }), h('span', { class: 'b-origin', text: sourceName(agent.role) }), h('p', { text: agent.activity?.detail ?? agent.activity?.text ?? '' }),
      ...(agent.id.startsWith('native:') ? [h('a', { class: 'b-link', text: tr('Abrir no escritório Codex ↗'), attrs: { href: `/?office=1&agent=${encodeURIComponent(agent.id.slice(7))}` } })] : [])] : [h('p', { class: 'b-muted', text: tr('Clique em um personagem para acompanhar seu trabalho.') })]));
    const events = [...local.events.map(e => ({ ...e, origin: e.source, name: local.agents.find(a => a.id === e.agent_id)?.name ?? e.agent_id })),
      ...cloud.snapshot.events.map(e => ({ ...e, origin: 'cloud', name: cloud.snapshot.agents.find(a => a.id === e.agent_id)?.name ?? e.agent_id })),
      ...native.feed.slice(-30).map(e => ({ id: e.id, origin: native.agent(e.agentId)?.provider === 'codex' ? 'codex' : 'claude', at: e.activity.at, description: e.activity.text, name: e.agentName }))].sort((a, b) => b.at - a.at).slice(0, 40);
    const logKey = JSON.stringify(events);
    if (logKey !== logSignature) {
      logSignature = logKey;
      logs.replaceChildren(...(events.length ? events.map(e => h('div', { class: 'b-log' }, h('time', { text: new Date(e.at).toLocaleTimeString('pt-BR') }), h('span', { class: 'b-log-origin', text: sourceName(e.origin) }), h('strong', { text: e.name }), h('span', { text: e.description }))) : [h('p', { class: 'b-muted', text: tr('Terminal pronto. Aguardando eventos dos agentes.') })]));
    }
  }
  world.onSelect(sel => {
    selected = sel?.type === 'agent' ? sel.id : null;
    if (selected && !selected.startsWith('native:')) {
      const isCloud = selected.startsWith('cloud:');
      const agentId = selected.slice(selected.indexOf(':') + 1);
      const order = orderViews(local, cloud.snapshot).find(o => o.agent_id === agentId && o.status === 'pending' && (o.origin === 'cloud') === isCloud);
      if (order && !modal.open) openOrder(order);
    }
    schedule();
  });
  native.on('snapshot', schedule); native.on('feed', schedule); native.on('connection', schedule);
  native.connect();
  const stream = new EventSource('/api/broker/stream');
  stream.addEventListener('snapshot', event => {
    try { local = JSON.parse((event as MessageEvent<string>).data) as BrokerSnapshot; brokerConnected = true; schedule(); } catch { showError(new Error(tr('Evento local inválido.'))); }
  });
  stream.onopen = () => { brokerConnected = true; schedule(); };
  stream.onerror = () => { brokerConnected = false; schedule(); };
  void cloud.start().catch(showError);
  const resize = () => {
    world.setViewInsets?.({ top: kpis.getBoundingClientRect().bottom + 64, bottom: footer.getBoundingClientRect().height + 18,
      left: innerWidth > 1000 ? 266 : 12, right: innerWidth > 1000 ? 300 : 12 });
  };
  window.addEventListener('resize', resize);
  resize(); render();
  window.addEventListener('pagehide', event => { if (event.persisted) return; stream.close(); native.disconnect(); cloud.dispose(); world.destroy(); window.removeEventListener('resize', resize); });
}
