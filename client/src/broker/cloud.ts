import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import { parseBrokerAgent, parseBrokerOrder, parseBrokerActivity, type BrokerAgent, type BrokerOrder, type BrokerActivity } from '../../../shared/broker';
import { tr } from '../../../shared/i18n';

export interface CloudSnapshot { agents: BrokerAgent[]; orders: BrokerOrder[]; events: BrokerActivity[] }
const empty = (): CloudSnapshot => ({ agents: [], orders: [], events: [] });

export class BrokerCloud {
  readonly client: SupabaseClient | null;
  snapshot = empty();
  status = tr('Supabase não configurado');
  email = '';
  private channel: RealtimeChannel | undefined;
  private unsubscribe: (() => void) | undefined;
  private generation = 0;
  private dirty = false;
  private loading = false;
  private disposed = false;
  constructor(private readonly changed: () => void) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    this.client = url && key ? createClient(url, key) : null;
  }
  async start(): Promise<void> {
    if (!this.client) return;
    // onAuthStateChange entrega INITIAL_SESSION, login, logout e renovação.
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        if (this.disposed) return;
        this.generation++;
        this.email = session?.user.email ?? '';
        this.snapshot = empty();
        this.status = session ? tr('Conectando ao Supabase...') : tr('Supabase: entre na sua conta');
        if (this.channel) void this.client!.removeChannel(this.channel);
        this.channel = undefined;
        this.changed();
        if (!session) return;
        const user = session.user.id;
        this.channel = this.client!.channel(`broker-${user}`);
        for (const table of ['agents_status', 'agent_events', 'order_approvals']) {
          this.channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `owner_id=eq.${user}` }, () => this.refresh());
        }
        this.channel.subscribe(state => {
          if (state === 'SUBSCRIBED') { this.status = tr('Supabase conectado'); this.refresh(); }
          else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') this.status = tr('Supabase desconectado; tentando reconectar');
          this.changed();
        });
      });
    });
    this.unsubscribe = () => data.subscription.unsubscribe();
  }
  refresh(): void {
    this.dirty = true;
    if (!this.loading) void this.load();
  }
  private async load(): Promise<void> {
    if (!this.client || !this.email || this.disposed) return;
    this.loading = true;
    this.dirty = false;
    const generation = this.generation;
    try {
      const [agents, orders, events] = await Promise.all([
        this.client.from('agents_status').select('*').order('updated_at', { ascending: false }).limit(300),
        this.client.from('order_approvals').select('*').order('created_at', { ascending: false }).limit(1000),
        this.client.from('agent_events').select('*').order('at', { ascending: false }).limit(200),
      ]);
      for (const result of [agents, orders, events]) if (result.error) throw result.error;
      if (generation !== this.generation || this.disposed) return;
      this.snapshot = { agents: (agents.data ?? []).map(parseBrokerAgent), orders: (orders.data ?? []).map(parseBrokerOrder), events: (events.data ?? []).map(parseBrokerActivity).reverse() };
      this.status = tr('Supabase conectado');
    } catch (err) {
      if (generation === this.generation) this.status = tr('Falha no Supabase: {0}', [err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err)]);
    } finally {
      this.loading = false;
      this.changed();
      if (this.dirty) void this.load();
    }
  }
  async decide(id: string, status: 'approved' | 'rejected'): Promise<void> {
    if (!this.client || !this.email) throw new Error(tr('Entre no Supabase antes de responder.'));
    const { data, error } = await this.client.from('order_approvals').update({ status, decided_at: Date.now() }).eq('id', id).eq('status', 'pending').select('id');
    if (error) throw error;
    if (!data?.length) throw new Error(tr('Ordem já respondida ou sem permissão.'));
    this.refresh();
  }
  async login(email: string, password: string): Promise<void> {
    if (!this.client) throw new Error(tr('Configure as variáveis do Supabase.'));
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  async logout(): Promise<void> {
    const result = await this.client?.auth.signOut();
    if (result?.error) throw result.error;
  }
  async register(email: string, password: string): Promise<void> {
    if (!this.client) throw new Error(tr('Configure as variáveis do Supabase.'));
    const { error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
  }
  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.unsubscribe?.();
    if (this.channel) void this.client?.removeChannel(this.channel);
  }
}
