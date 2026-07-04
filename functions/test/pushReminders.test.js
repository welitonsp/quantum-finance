const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  buildReminderBody,
  buildReminderSummary,
  formatCentsBRL,
  isTaskDueOn,
} = require('../lib/pushReminders');

describe('isTaskDueOn', () => {
  it('mensal: vence quando dueDay bate com o dia', () => {
    assert.equal(isTaskDueOn({ value_cents: 5000, dueDay: 15 }, 15, 7), true);
    assert.equal(isTaskDueOn({ value_cents: 5000, dueDay: 15 }, 14, 7), false);
  });

  it('anual: exige dueMonth E dueDay', () => {
    assert.equal(isTaskDueOn({ value_cents: 5000, dueDay: 15, dueMonth: 7 }, 15, 7), true);
    assert.equal(isTaskDueOn({ value_cents: 5000, dueDay: 15, dueMonth: 8 }, 15, 7), false);
  });

  it('fail-closed: value_cents ausente/inválido ou dueDay inválido', () => {
    assert.equal(isTaskDueOn({ dueDay: 15 }, 15, 7), false);
    assert.equal(isTaskDueOn({ value_cents: 0, dueDay: 15 }, 15, 7), false);
    assert.equal(isTaskDueOn({ value_cents: 10.5, dueDay: 15 }, 15, 7), false);
    assert.equal(isTaskDueOn({ value_cents: 5000, dueDay: '15' }, 15, 7), false);
    assert.equal(isTaskDueOn({ value_cents: 5000 }, 15, 7), false);
  });
});

describe('buildReminderSummary', () => {
  it('soma recorrentes de hoje e conta cartões que fecham hoje', () => {
    const summary = buildReminderSummary(
      [
        { value_cents: 12000, dueDay: 4 },
        { value_cents: 8000, dueDay: 4 },
        { value_cents: 99900, dueDay: 20 },      // outro dia
        { value_cents: 5000, dueDay: 4, dueMonth: 12 }, // anual, outro mês
      ],
      [{ closingDay: 4 }, { closingDay: 10 }, { closingDay: '4' }],
      4,
      7,
    );
    assert.deepEqual(summary, {
      dueTasksCount: 2,
      dueTasksTotalCents: 20000,
      closingCardsCount: 1,
    });
  });
});

describe('formatCentsBRL — aritmética inteira', () => {
  it('formata com separador de milhar e centavos', () => {
    assert.equal(formatCentsBRL(20000), 'R$ 200,00');
    assert.equal(formatCentsBRL(123456789), 'R$ 1.234.567,89');
    assert.equal(formatCentsBRL(5), 'R$ 0,05');
    assert.equal(formatCentsBRL(-990), '-R$ 9,90');
  });
});

describe('buildReminderBody — payload minimizado (sem PII)', () => {
  it('null quando não há nada a informar (não enviar push)', () => {
    assert.equal(buildReminderBody({ dueTasksCount: 0, dueTasksTotalCents: 0, closingCardsCount: 0 }), null);
  });

  it('só recorrentes, singular e plural', () => {
    assert.equal(
      buildReminderBody({ dueTasksCount: 1, dueTasksTotalCents: 12000, closingCardsCount: 0 }),
      'Hoje: 1 recorrente vence hoje (R$ 120,00).',
    );
    assert.equal(
      buildReminderBody({ dueTasksCount: 2, dueTasksTotalCents: 20000, closingCardsCount: 0 }),
      'Hoje: 2 recorrentes vencem hoje (R$ 200,00).',
    );
  });

  it('recorrentes + fatura combinados', () => {
    assert.equal(
      buildReminderBody({ dueTasksCount: 2, dueTasksTotalCents: 20000, closingCardsCount: 1 }),
      'Hoje: 2 recorrentes vencem hoje (R$ 200,00) · 1 fatura de cartão fecha hoje.',
    );
  });

  it('nunca contém texto do usuário — só números e rótulos fixos', () => {
    const body = buildReminderBody({ dueTasksCount: 3, dueTasksTotalCents: 150000, closingCardsCount: 2 });
    assert.match(body, /^Hoje: [0-9]+ recorrentes vencem hoje \(R\$ [0-9.,]+\) · [0-9]+ faturas de cartão fecham hoje\.$/);
  });
});
