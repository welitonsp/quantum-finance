import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './client';

/**
 * Canal de tempo real compartilhado por nome.
 *
 * O supabase-js devolve o MESMO canal quando dois `channel(nome)` usam o mesmo
 * nome, e não aceita `.on(...)` depois do `subscribe()`. Duas telas montando o
 * mesmo hook ao mesmo tempo (ex.: categorias no painel e no formulário) faziam a
 * segunda quebrar o app inteiro ("cannot add postgres_changes callbacks ... after
 * subscribe()"). Quem usa o mesmo nome precisa observar as mesmas tabelas.
 * Aqui o primeiro assinante abre o canal com UM `.on` que repassa
 * o evento a todos; os demais só entram na lista. O último a sair fecha o canal.
 */
export interface TableWatch {
  table: string;
  filter?: string | undefined;
  /** Só INSERT/UPDATE (o Realtime não aplica RLS ao DELETE; ver useGroupsSupabase). */
  insertUpdateOnly?: boolean | undefined;
}

interface Entry {
  channel: RealtimeChannel;
  onChange: Set<() => void>;
  onSubscribed: Set<() => void>;
}

const registry = new Map<string, Entry>();

export function subscribeSharedChannel(
  name: string,
  watches: readonly TableWatch[],
  onChange: () => void,
  onSubscribed?: () => void,
): () => void {
  let entry = registry.get(name);
  if (!entry) {
    const created: Entry = { channel: undefined as unknown as RealtimeChannel, onChange: new Set(), onSubscribed: new Set() };
    let channel = getSupabase().channel(name);
    const fire = () => { created.onChange.forEach((fn) => fn()); };
    for (const w of watches) {
      const where = { schema: 'public', table: w.table, ...(w.filter ? { filter: w.filter } : {}) };
      channel = w.insertUpdateOnly
        ? channel
          .on('postgres_changes', { event: 'INSERT', ...where }, fire)
          .on('postgres_changes', { event: 'UPDATE', ...where }, fire)
        : channel.on('postgres_changes', { event: '*', ...where }, fire);
    }
    created.channel = channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') created.onSubscribed.forEach((fn) => fn());
    });
    registry.set(name, created);
    entry = created;
  }
  const current = entry;
  // cópias próprias: o mesmo callback de duas telas conta como dois assinantes
  const change = () => onChange();
  const subscribed = onSubscribed ? () => onSubscribed() : undefined;
  current.onChange.add(change);
  if (subscribed) current.onSubscribed.add(subscribed);

  return () => {
    current.onChange.delete(change);
    if (subscribed) current.onSubscribed.delete(subscribed);
    if (current.onChange.size === 0 && registry.get(name) === current) {
      registry.delete(name);
      void getSupabase().removeChannel(current.channel);
    }
  };
}
