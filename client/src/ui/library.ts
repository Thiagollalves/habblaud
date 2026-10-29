import { tr } from '../../../shared/i18n';
import type { RecentSession } from '../../../shared/types';
import { h } from './dom';
import { normalizeSearch, shortPath } from './format';
import { parseRecentSessions } from './history';
import type { TerminalControl } from './terminal';

interface Skill { name: string; description: string; account: string }

/** Biblioteca local. Não cria agentes nem muda o status das sessões no escritório. */
export class AgentLibrary {
  readonly button: HTMLButtonElement;
  readonly el: HTMLDialogElement;
  private search = h('input', { type: 'search', attrs: { placeholder: tr('Buscar agente, chat ou projeto'), 'aria-label': tr('Buscar agente, chat ou projeto') } });
  private status = h('p', { role: 'status', text: tr('Carregando…') });
  private list = h('div', { class: 'ui-library__list' });
  private skills: Skill[] = [];
  private sessions: RecentSession[] = [];
  private request = 0;

  constructor(private terminal: Pick<TerminalControl, 'openSession'>) {
    this.button = h('button', { type: 'button', class: 'ui-link-btn', text: tr('Meus agentes'), on: { click: () => void this.open() } });
    const quick = (label: string, query: string) => h('button', { type: 'button', class: 'ui-link-btn', text: label, on: { click: () => { this.search.value = query; this.draw(); } } });
    this.search.addEventListener('input', () => this.draw());
    this.el = h('dialog', { class: 'ui-library', attrs: { 'aria-label': tr('Meus agentes e projetos') } },
      h('div', { class: 'ui-library__head' }, h('h2', { text: tr('Meus agentes e projetos') }), h('button', { type: 'button', text: tr('Fechar'), on: { click: () => this.el.close() } })),
      h('p', { text: tr('Suas skills pessoais e os chats do Codex disponíveis neste computador. Somente sessões abertas aparecem como personagens no escritório.') }),
      this.search,
      h('nav', { class: 'ui-library__filters', attrs: { 'aria-label': tr('Filtros dos agentes') } }, quick(tr('Todos'), ''), quick(tr('Trading'), 'trading'), quick(tr('Supervisão'), 'supervisor')),
      this.status, this.list,
      h('p', { class: 'ui-library__note', text: tr('Conversas somente na nuvem não estão disponíveis aqui. Copiar uma chamada de skill não inicia uma tarefa. Para usar, cole a chamada em um chat do Codex e descreva o trabalho.') }),
    );
  }

  async open(): Promise<void> {
    if (!this.el.open) this.el.showModal();
    this.search.focus();
    this.status.textContent = tr('Carregando…');
    const request = ++this.request;
    try {
      const [skills, sessions] = await Promise.all(['/api/codex/skills', '/api/sessions/recent'].map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error();
        return response.json();
      }));
      if (request !== this.request) return;
      this.skills = Array.isArray(skills.skills) ? skills.skills.filter((s: Skill) => typeof s?.name === 'string' && typeof s.description === 'string') : [];
      this.sessions = parseRecentSessions(sessions).filter((s) => s.provider === 'codex');
      this.draw();
    } catch {
      if (request === this.request) this.status.textContent = tr('Não foi possível carregar. Feche e abra novamente para tentar de novo.');
    }
  }

  private draw(): void {
    const query = normalizeSearch(this.search.value);
    const matches = (text: string) => query.split(/\s+/).every((part) => normalizeSearch(text).includes(part));
    const skills = this.skills.filter((s) => matches(`${s.name} ${s.description}`));
    const sessions = this.sessions.filter((s) => matches(`${s.title || ''} ${s.project || ''}`));
    const projects = new Set(this.sessions.map((s) => s.project).filter(Boolean));
    this.status.textContent = tr('{0} skills pessoais · {1} chats · {2} projetos · {3} sessões abertas', [this.skills.length, this.sessions.length, projects.size, this.sessions.filter((s) => s.open).length]);
    const fragment = document.createDocumentFragment();
    fragment.append(h('h3', { text: tr('Agentes personalizados — skills') }));
    for (const skill of skills) {
      const copy = h('button', { type: 'button', text: tr('Copiar chamada'), on: { click: async () => {
        try { await navigator.clipboard.writeText(`$${skill.name}`); copy.textContent = tr('Copiado'); }
        catch { copy.textContent = `$${skill.name}`; }
      } } });
      fragment.append(h('article', { class: 'ui-library__card' }, h('h4', { text: skill.name }), h('span', { class: 'ui-library__badge', text: tr('Skill salva') }), h('p', { text: skill.description }), copy));
    }
    if (!skills.length) fragment.append(h('p', { text: tr('Nenhuma skill encontrada para esta busca.') }));
    fragment.append(h('h3', { text: tr('Chats e projetos do Codex') }));
    for (const session of sessions) {
      const actions = h('div', { class: 'ui-library__actions' }, h('button', { type: 'button', text: tr('Ler conversa'), on: { click: () => { this.el.close(); this.terminal.openSession(session); } } }));
      if (/^[a-f0-9-]{36}$/i.test(session.sessionId)) actions.append(h('a', { text: tr('Abrir no Codex'), attrs: { href: `codex://threads/${session.sessionId}` } }));
      fragment.append(h('article', { class: 'ui-library__card' },
        h('h4', { text: session.title || tr('Sessão sem título') }),
        h('span', { class: 'ui-library__badge', text: session.open ? tr('Sessão aberta') : tr('No histórico') }),
        h('p', { text: shortPath(session.project || session.projectDir) }),
        h('p', { text: new Date(session.lastAt).toLocaleString() }), actions));
    }
    if (!sessions.length) fragment.append(h('p', { text: tr('Nenhum chat encontrado para esta busca.') }));
    this.list.replaceChildren(fragment);
  }
}
