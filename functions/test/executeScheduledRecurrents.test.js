/**
 * Unit tests for isTaskDueToday — exported pure helper in executeScheduledRecurrents.
 *
 * Runs via: npm --prefix functions test
 */

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

// isTaskDueToday is a named export compiled to lib/index.js
const { isTaskDueToday } = require('../lib/index.js');

const MONTH_KEY = '2026-06'; // arbitrary reference month

describe('isTaskDueToday', () => {
  // ─── Inactive task ──────────────────────────────────────────────────────────
  it('returns false for inactive task', () => {
    assert.equal(
      isTaskDueToday({ active: false, dueDay: 10 }, 10, 6, MONTH_KEY),
      false,
    );
  });

  // ─── Already executed this month ────────────────────────────────────────────
  it('returns false when lastExecutedMonth matches monthKey (mensal)', () => {
    assert.equal(
      isTaskDueToday({ active: true, dueDay: 10, lastExecutedMonth: MONTH_KEY }, 10, 6, MONTH_KEY),
      false,
    );
  });

  it('returns false when lastExecutedMonth matches monthKey (anual)', () => {
    assert.equal(
      isTaskDueToday(
        { active: true, frequency: 'anual', dueMonth: 6, dueDay: 10, lastExecutedMonth: MONTH_KEY },
        10, 6, MONTH_KEY,
      ),
      false,
    );
  });

  // ─── Monthly task ────────────────────────────────────────────────────────────
  it('returns true for monthly task when dayOfMonth === dueDay', () => {
    assert.equal(
      isTaskDueToday({ active: true, dueDay: 15 }, 15, 6, MONTH_KEY),
      true,
    );
  });

  it('returns false for monthly task BEFORE the due day', () => {
    assert.equal(
      isTaskDueToday({ active: true, dueDay: 15 }, 14, 6, MONTH_KEY),
      false,
    );
  });

  // F-07 — catch-up: dias APÓS o vencimento ainda materializam (se não executado no mês).
  it('catch-up: monthly task fires on a day AFTER the due day when not yet executed', () => {
    assert.equal(
      isTaskDueToday({ active: true, dueDay: 15 }, 20, 6, MONTH_KEY),
      true,
    );
  });

  it('catch-up: does NOT re-fire when already executed this month (idempotent)', () => {
    assert.equal(
      isTaskDueToday({ active: true, dueDay: 15, lastExecutedMonth: MONTH_KEY }, 20, 6, MONTH_KEY),
      false,
    );
  });

  it('catch-up: clamps due day to the last day of the month (dueDay 31 em fevereiro)', () => {
    // fev/2026 tem 28 dias; dueDay 31 → efetivo 28 → dia 28 dispara.
    assert.equal(
      isTaskDueToday({ active: true, dueDay: 31 }, 28, 2, '2026-02'),
      true,
    );
  });

  it('uses dueDay=1 as default for monthly task with no dueDay', () => {
    assert.equal(
      isTaskDueToday({ active: true }, 1, 6, MONTH_KEY),
      true,
    );
    // dia 2 com dueDay padrão 1 → catch-up (vencido, não executado).
    assert.equal(
      isTaskDueToday({ active: true }, 2, 6, MONTH_KEY),
      true,
    );
  });

  // ─── Annual task ─────────────────────────────────────────────────────────────
  it('returns true for annual task when currentMonth === dueMonth and dayOfMonth === dueDay', () => {
    assert.equal(
      isTaskDueToday(
        { active: true, frequency: 'anual', dueMonth: 6, dueDay: 10 },
        10, 6, MONTH_KEY,
      ),
      true,
    );
  });

  it('returns false for annual task when currentMonth !== dueMonth', () => {
    assert.equal(
      isTaskDueToday(
        { active: true, frequency: 'anual', dueMonth: 6, dueDay: 10 },
        10, 5, '2026-05',
      ),
      false,
    );
  });

  it('returns false for annual task when correct month but wrong day', () => {
    assert.equal(
      isTaskDueToday(
        { active: true, frequency: 'anual', dueMonth: 6, dueDay: 10 },
        9, 6, MONTH_KEY,
      ),
      false,
    );
  });

  it('uses dueMonth=1 and dueDay=1 as defaults for annual task with missing fields', () => {
    assert.equal(
      isTaskDueToday({ active: true, frequency: 'anual' }, 1, 1, '2026-01'),
      true,
    );
    assert.equal(
      isTaskDueToday({ active: true, frequency: 'anual' }, 1, 2, '2026-02'),
      false,
    );
  });
});
