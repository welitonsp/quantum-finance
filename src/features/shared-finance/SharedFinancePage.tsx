import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Users, Plus, Trash2, ChevronRight, ArrowRight,
  Check, Receipt, X, ChevronDown, Mail, UserPlus, Clock,
} from 'lucide-react';
import { useGroups, useGroupExpenses, useGroupInvites } from './hooks/useGroups';
import { splitIgual, splitProporcional, calcularBalancete } from '../../lib/sharedSplitEngine';
import { formatBRL, toCentavos } from '../../shared/types/money';
import type { SplitMethod, Group, SharedExpense, SharedExpenseCreatePayload, GroupInvite } from '../../shared/types/shared';
import type { Centavos } from '../../shared/types/money';
import type { SplitParticipant } from '../../lib/sharedSplitEngine';
import { ALLOWED_CATEGORIES } from '../../shared/schemas/financialSchemas';

interface Props {
  uid: string;
  displayName: string;
  email?: string;
}

export default function SharedFinancePage({ uid, displayName, email }: Props) {
  const {
    groups, loading: loadingGroups,
    createGroup, deleteGroup,
    createInvite, checkGroupInvite, acceptInvite, rejectInvite,
  } = useGroups(uid);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showCreateGroup) newGroupInputRef.current?.focus();
  }, [showCreateGroup]);

  // Estado do fluxo "Entrar em grupo por ID"
  const [joinGroupId, setJoinGroupId] = useState('');
  const [joinInvite, setJoinInvite] = useState<GroupInvite | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const id = await createGroup(name);
    setSelectedGroupId(id);
    setNewGroupName('');
    setShowCreateGroup(false);
  }

  async function handleCheckInvite() {
    if (!email || !joinGroupId.trim()) return;
    setJoinLoading(true);
    setJoinError('');
    setJoinInvite(null);
    setJoinSuccess('');
    try {
      const inv = await checkGroupInvite(joinGroupId.trim(), email);
      if (!inv) {
        setJoinError('Nenhum convite pendente encontrado para o seu e-mail neste grupo.');
      } else {
        setJoinInvite(inv);
      }
    } catch {
      setJoinError('Erro ao verificar convite. Tente novamente.');
    } finally {
      setJoinLoading(false);
    }
  }

  async function handleAcceptInvite() {
    if (!joinInvite || !email) return;
    setJoinLoading(true);
    try {
      await acceptInvite(joinInvite.groupId, joinInvite.id, displayName, email);
      setJoinSuccess(`Você entrou no grupo "${joinInvite.groupName}"!`);
      setJoinInvite(null);
      setJoinGroupId('');
      setSelectedGroupId(joinInvite.groupId);
    } catch {
      setJoinError('Erro ao aceitar convite. Tente novamente.');
    } finally {
      setJoinLoading(false);
    }
  }

  async function handleRejectInvite() {
    if (!joinInvite) return;
    setJoinLoading(true);
    try {
      await rejectInvite(joinInvite.groupId, joinInvite.id);
      setJoinInvite(null);
      setJoinGroupId('');
      setJoinError('Convite recusado.');
    } catch {
      setJoinError('Erro ao recusar convite.');
    } finally {
      setJoinLoading(false);
    }
  }

  if (loadingGroups) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Carregando grupos…
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-0 md:gap-4 h-full p-4 max-w-5xl mx-auto">
      {/* Painel lateral: lista de grupos */}
      <aside className="w-full md:w-64 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-900">Grupos</h1>
          </div>
          <button
            onClick={() => setShowCreateGroup((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-indigo-600"
            aria-label="Criar grupo"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showCreateGroup && (
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Nome do grupo"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              ref={newGroupInputRef}
            />
            <button
              onClick={handleCreateGroup}
              className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
            >
              Criar
            </button>
          </div>
        )}

        {groups.length === 0 ? (
          <p className="text-sm text-gray-400 px-1">Nenhum grupo ainda. Crie um para começar.</p>
        ) : (
          groups.map((g) => (
            <GroupItem
              key={g.id}
              group={g}
              selected={g.id === selectedGroupId}
              isOwner={g.ownerUid === uid}
              onSelect={() => setSelectedGroupId(g.id)}
              onDelete={() => { deleteGroup(g.id); if (selectedGroupId === g.id) setSelectedGroupId(null); }}
            />
          ))
        )}

        {/* Entrar em grupo via convite */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 font-medium mb-2 flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" />
            Entrar em grupo
          </p>

          {joinSuccess && (
            <p className="text-xs text-green-600 bg-green-50 px-2 py-1.5 rounded-lg mb-2">{joinSuccess}</p>
          )}

          {joinInvite ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
              <p className="text-xs text-indigo-800 font-medium">
                Convite para <strong>{joinInvite.groupName}</strong>
              </p>
              <p className="text-xs text-indigo-600">
                Convidado por {joinInvite.inviterDisplayName}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleAcceptInvite}
                  disabled={joinLoading}
                  className="flex-1 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Aceitar
                </button>
                <button
                  onClick={handleRejectInvite}
                  disabled={joinLoading}
                  className="flex-1 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Recusar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <input
                type="text"
                placeholder="ID do grupo"
                value={joinGroupId}
                onChange={(e) => { setJoinGroupId(e.target.value); setJoinError(''); setJoinSuccess(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleCheckInvite()}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <button
                onClick={handleCheckInvite}
                disabled={joinLoading || !joinGroupId.trim() || !email}
                className="w-full py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {joinLoading ? 'Verificando…' : 'Verificar convite'}
              </button>
              {joinError && <p className="text-xs text-red-500">{joinError}</p>}
              {!email && (
                <p className="text-xs text-amber-600">E-mail necessário para verificar convite.</p>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Área principal */}
      <div className="flex-1 min-w-0">
        {selectedGroup ? (
          <GroupDetail
            group={selectedGroup}
            uid={uid}
            displayName={displayName}
            {...(email !== undefined ? { email } : {})}
            onInvite={createInvite}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
            <Users className="w-10 h-10 opacity-30" />
            <p className="text-sm">Selecione um grupo para ver as despesas</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// GroupItem
// ──────────────────────────────────────────────

function GroupItem({
  group, selected, isOwner, onSelect, onDelete,
}: {
  group: Group;
  selected: boolean;
  isOwner: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
        selected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Users className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-800 truncate">{group.name}</span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-xs text-gray-400">{group.memberUids.length}</span>
        {isOwner && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
            aria-label="Excluir grupo"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// GroupDetail
// ──────────────────────────────────────────────

function GroupDetail({
  group, uid, displayName, onInvite,
}: {
  group: Group;
  uid: string;
  displayName: string;
  email?: string;
  onInvite: (groupId: string, groupName: string, inviteeEmail: string, inviterDisplayName: string) => Promise<void>;
}) {
  const isOwner = group.ownerUid === uid;
  const { expenses, loading, addExpense, markSharePaid, deleteExpense } = useGroupExpenses(group.id);
  const { invites } = useGroupInvites(isOwner ? group.id : null);
  const [showForm, setShowForm] = useState(false);
  const [showBalancete, setShowBalancete] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const inviteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInviteForm) inviteInputRef.current?.focus();
  }, [showInviteForm]);

  const allMembers: SplitParticipant[] = [
    { uid, displayName },
    ...group.members
      .filter((m) => m.uid !== uid)
      .map((m) => ({ uid: m.uid, displayName: m.displayName })),
  ];

  const balancete = useMemo(
    () => calcularBalancete(expenses.filter((e) => !e.shares.every((s) => s.paid))),
    [expenses],
  );

  const totalDespesas = expenses.reduce((a, e) => a + e.totalCents, 0) as Centavos;

  async function handleSendInvite() {
    const targetEmail = inviteEmail.trim();
    if (!targetEmail) return;
    setInviteLoading(true);
    setInviteMsg('');
    try {
      await onInvite(group.id, group.name, targetEmail, displayName);
      setInviteMsg(`Convite enviado para ${targetEmail}. Compartilhe o ID do grupo: ${group.id}`);
      setInviteEmail('');
      setShowInviteForm(false);
    } catch {
      setInviteMsg('Erro ao enviar convite. Tente novamente.');
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho do grupo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{group.name}</h2>
          <p className="text-xs text-gray-400">{group.memberUids.length} membros · {expenses.length} despesas</p>
          {isOwner && (
            <p className="text-xs text-gray-400 mt-0.5">
              ID do grupo: <span className="font-mono select-all">{group.id}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBalancete((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            Balancete
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {isOwner && (
            <button
              onClick={() => setShowInviteForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Convidar
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Despesa
          </button>
        </div>
      </div>

      {/* Formulário de convite */}
      {isOwner && showInviteForm && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-indigo-800">Convidar por e-mail</p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="email@exemplo.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendInvite()}
              className="flex-1 text-sm border border-indigo-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              ref={inviteInputRef}
            />
            <button
              onClick={handleSendInvite}
              disabled={inviteLoading || !inviteEmail.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {inviteLoading ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
          {inviteMsg && <p className="text-xs text-indigo-700">{inviteMsg}</p>}

          {/* Convites pendentes */}
          {invites.length > 0 && (
            <div className="pt-2 border-t border-indigo-200">
              <p className="text-xs text-indigo-600 font-medium mb-1.5">Convites pendentes</p>
              <div className="space-y-1">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2 text-xs text-indigo-700">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{inv.inviteeEmail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
          <p className="text-xs text-indigo-500 uppercase tracking-wide">Total despesas</p>
          <p className="text-xl font-bold text-indigo-700 mt-0.5">{formatBRL(totalDespesas)}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <p className="text-xs text-amber-500 uppercase tracking-wide">Pendentes</p>
          <p className="text-xl font-bold text-amber-700 mt-0.5">
            {expenses.filter((e) => e.shares.some((s) => !s.paid && s.uid === uid)).length}
          </p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3">
          <p className="text-xs text-green-500 uppercase tracking-wide">Quitadas</p>
          <p className="text-xl font-bold text-green-700 mt-0.5">
            {expenses.filter((e) => e.shares.every((s) => s.paid)).length}
          </p>
        </div>
      </div>

      {/* Balancete */}
      {showBalancete && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Quem deve para quem</h3>
          {balancete.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma dívida pendente.</p>
          ) : (
            <div className="space-y-2">
              {balancete.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-red-600">{item.devedorNome}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="font-medium text-green-600">{item.credorNome}</span>
                  <span className="ml-auto font-semibold text-gray-700">{formatBRL(item.valorCents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lista de despesas */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Carregando despesas…</p>
      ) : expenses.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma despesa ainda. Adicione a primeira!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((e) => (
            <ExpenseCard
              key={e.id}
              expense={e}
              currentUid={uid}
              onMarkPaid={(memberUid) => markSharePaid(group.id, e.id, memberUid)}
              onDelete={() => deleteExpense(group.id, e.id)}
            />
          ))}
        </div>
      )}

      {/* Modal de nova despesa */}
      {showForm && (
        <AddExpenseModal
          groupId={group.id}
          currentUid={uid}
          currentDisplayName={displayName}
          members={allMembers}
          onAdd={async (payload) => { await addExpense(group.id, payload); setShowForm(false); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// ExpenseCard
// ──────────────────────────────────────────────

function ExpenseCard({
  expense, currentUid, onMarkPaid, onDelete,
}: {
  expense: SharedExpense;
  currentUid: string;
  onMarkPaid: (uid: string) => void;
  onDelete: () => void;
}) {
  const allPaid = expense.shares.every((s) => s.paid);

  return (
    <div className={`bg-white border rounded-xl p-4 ${allPaid ? 'border-green-100 opacity-70' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{expense.description}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {expense.date} · {expense.category} · Pago por <strong>{expense.payerDisplayName}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm font-bold text-gray-700">{formatBRL(expense.totalCents)}</span>
          <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors" aria-label="Excluir despesa">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Shares */}
      <div className="mt-3 flex flex-wrap gap-2">
        {expense.shares.map((share) => (
          <div
            key={share.uid}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border ${
              share.paid
                ? 'bg-green-50 border-green-100 text-green-700'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            {share.paid ? <Check className="w-3 h-3" /> : null}
            <span>{share.displayName}</span>
            <span className="font-semibold">{formatBRL(share.amountCents)}</span>
            {!share.paid && share.uid === currentUid && (
              <button
                onClick={() => onMarkPaid(share.uid)}
                className="ml-1 text-indigo-500 hover:text-indigo-700 font-medium"
              >
                Pagar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// AddExpenseModal
// ──────────────────────────────────────────────

function AddExpenseModal({
  groupId: _groupId, currentUid, currentDisplayName, members, onAdd, onClose,
}: {
  groupId: string;
  currentUid: string;
  currentDisplayName: string;
  members: SplitParticipant[];
  onAdd: (payload: SharedExpenseCreatePayload) => Promise<void>;
  onClose: () => void;
}) {
  const [description, setDescription] = useState('');
  const [totalStr, setTotalStr] = useState('');
  const [category, setCategory] = useState<string>('Outros');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('igual');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    let totalCents = 0 as Centavos;
    try {
      totalCents = toCentavos(totalStr);
    } catch {
      // invalid input — totalCents remains 0, caught by validation below
    }
    if (!description.trim() || totalCents <= 0) {
      setError('Preencha descrição e valor válido.');
      return;
    }
    const effectiveMembers = members.length > 0 ? members : [{ uid: currentUid, displayName: currentDisplayName }];

    const splitResult = splitMethod === 'proporcional'
      ? splitProporcional(totalCents, effectiveMembers)
      : splitIgual(totalCents, effectiveMembers);

    setSubmitting(true);
    try {
      await onAdd({
        description: description.trim(),
        totalCents,
        category,
        date,
        payerUid: currentUid,
        payerDisplayName: currentDisplayName,
        splitMethod,
        shares: splitResult.shares,
      });
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-label="Adicionar despesa">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Nova Despesa Compartilhada</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Valor (R$)"
              value={totalStr}
              onChange={(e) => setTotalStr(e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
          >
            {ALLOWED_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Método de divisão</p>
            <div className="flex gap-2">
              {(['igual', 'proporcional'] as SplitMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setSplitMethod(m)}
                  className={`flex-1 text-sm py-2 rounded-lg border capitalize transition-colors ${
                    splitMethod === m
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Salvando…' : 'Salvar Despesa'}
        </button>
      </div>
    </div>
  );
}
