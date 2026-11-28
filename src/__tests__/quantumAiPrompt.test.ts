import { describe, it, expect } from 'vitest';
import {
  maskPII,
  formatCents,
  parseAiRequest,
  buildChatPrompt,
  buildAuditPrompt,
  buildCategorizePrompt,
  parseCategorizeResponse,
  sanitizeFinancialContext,
  todayInSaoPaulo,
  MAX_BATCH_SIZE,
  MAX_PROMPT_LEN,
  AI_CATEGORIES,
} from '../../supabase/functions/quantum-ai/prompt';
import { ALLOWED_CATEGORIES } from '../shared/schemas/financialSchemas';

const today = { year: 2026, month: 11, day: 10 };

describe('quantum-ai/prompt', () => {
  it('oferece à IA as mesmas categorias do app, menos Importado', () => {
    expect([...AI_CATEGORIES]).toEqual(ALLOWED_CATEGORIES.filter((c) => c !== 'Importado'));
  });

  it('mascara CPF, e-mail, telefone e chave PIX', () => {
    const out = maskPII('PIX para Maria Silva 123.456.789-00 maria@x.com 11 91234-5678 a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    expect(out).not.toMatch(/123\.456|maria@x\.com|91234|a1b2c3d4/);
    expect(maskPII(undefined)).toBe('');
  });

  it('formata centavos inteiros sem float', () => {
    expect(formatCents(123456)).toBe('1234.56');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(-250)).toBe('-2.50');
    expect(formatCents(1.5)).toBe('0.00');
  });

  it('valida as operações e os limites', () => {
    expect(parseAiRequest(null).ok).toBe(false);
    expect(parseAiRequest({ op: 'hack' }).ok).toBe(false);
    expect(parseAiRequest({ op: 'chat', prompt: '  ' }).ok).toBe(false);
    expect(parseAiRequest({ op: 'chat', prompt: 'x'.repeat(MAX_PROMPT_LEN + 1) }).ok).toBe(false);
    expect(parseAiRequest({ op: 'categorize', transactions: 'x' }).ok).toBe(false);
    expect(parseAiRequest({ op: 'categorize', transactions: new Array(MAX_BATCH_SIZE + 1).fill({}) }).ok).toBe(false);
    expect(parseAiRequest({ op: 'audit' })).toMatchObject({ ok: true, request: { op: 'audit' } });
  });

  it('ignora o campo legado value e limita o contexto a 50 linhas', () => {
    const ctx = sanitizeFinancialContext({
      saldo: 'x', currentMonth: 13,
      transactions: Array.from({ length: 60 }, () => ({ value: 10.5, description: 'Mercado' })),
    });
    expect(ctx.saldo).toBe(0);
    expect(ctx.currentMonth).toBeUndefined();
    expect(ctx.transactions).toHaveLength(50);
    expect(ctx.transactions[0]?.value_cents).toBe(0);
  });

  it('monta o prompt do chat com dados mascarados e burn rate em centavos', () => {
    const parsed = parseAiRequest({
      op: 'chat',
      prompt: 'Meu CPF é 123.456.789-00, estou bem?',
      financialContext: {
        saldo: 1000, entradas: 5000, saidas: 1200, currentMonth: 11, currentYear: 2026,
        transactions: [
          { type: 'saida', category: 'Alimentação', date: '2026-11-03', description: 'Mercado joao@x.com', value_cents: 30000 },
          { type: 'saida', category: 'Hack<script>', date: '2026-10-30', description: 'Antigo', value_cents: 99900 },
        ],
        recurringTasks: [{ type: 'saida', value_cents: 150000, active: true }],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.request.op !== 'chat') throw new Error('esperava chat');
    const prompt = buildChatPrompt(parsed.request.prompt, parsed.request.context, today);
    expect(prompt).toContain('PERGUNTA: Meu CPF é [CPF]');
    expect(prompt).not.toContain('joao@x.com');
    expect(prompt).toContain('Gasto atual: R$ 300.00 | Ritmo: R$ 30.00/dia');
    expect(prompt).toContain('Total fixo: R$ 1500.00 | Risco: 30.0% das receitas');
    expect(prompt).toContain('- Outros: R$ 999.00');
    expect(prompt).not.toContain('Hack<script>');
    expect(buildAuditPrompt(parsed.request.context, today)).toContain('RELATÓRIO DE AUDITORIA');
  });

  it('categoriza só com ids opacos e categorias permitidas', () => {
    const parsed = parseAiRequest({
      op: 'categorize',
      transactions: [
        { id: 'abc_1', description: 'Uber 11 91234-5678', value_cents: 2590 },
        { id: 'id com espaço', description: 'Netflix', value_cents: 3990 },
        { id: 5, description: 'sem id string' },
      ],
    });
    if (!parsed.ok || parsed.request.op !== 'categorize') throw new Error('esperava categorize');
    const rows = parsed.request.rows;
    expect(rows.map(r => r.promptId)).toEqual(['abc_1', 'tx_1']);
    const prompt = buildCategorizePrompt(rows);
    expect(prompt).toContain('ID: abc_1 | "Uber [FONE]" | R$ 25.90');
    expect(prompt).not.toContain('id com espaço');

    const out = parseCategorizeResponse('```json\n[{"id":"abc_1","category":"Transporte"},{"id":"tx_1","category":"Inventada"}]\n```', rows);
    expect(out).toEqual([
      { id: 'abc_1', category: 'Transporte' },
      { id: 'id com espaço', category: 'Outros' },
    ]);
    expect(parseCategorizeResponse('não é json', rows).every(r => r.category === 'Outros')).toBe(true);
  });

  it('calcula hoje no fuso de Brasília', () => {
    // 02:00 UTC de 1º/12 ainda é 30/11 em Brasília
    expect(todayInSaoPaulo(new Date('2026-12-01T02:00:00Z'))).toEqual({ year: 2026, month: 11, day: 30 });
  });
});
