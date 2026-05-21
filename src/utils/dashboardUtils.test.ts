import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAVINGS_GOAL_PERCENT,
  calcStatus,
  resolveSavingsGoalPercent,
} from './dashboardUtils';

describe('resolveSavingsGoalPercent', () => {
  it('usa a meta percentual numerica salva no app', () => {
    expect(resolveSavingsGoalPercent(35)).toBe(35);
  });

  it('usa a meta percentual vinda de objeto', () => {
    expect(resolveSavingsGoalPercent({ percent: 15 })).toBe(15);
  });

  it('mantem fallback explicito quando a meta esta ausente ou fora da faixa percentual', () => {
    expect(resolveSavingsGoalPercent(null)).toBe(DEFAULT_SAVINGS_GOAL_PERCENT);
    expect(resolveSavingsGoalPercent(0)).toBe(DEFAULT_SAVINGS_GOAL_PERCENT);
    expect(resolveSavingsGoalPercent(3500)).toBe(DEFAULT_SAVINGS_GOAL_PERCENT);
  });
});

describe('calcStatus', () => {
  it('calcula progresso usando a meta real recebida pelo Dashboard', () => {
    const defaultGoal = calcStatus(200, 1000, 800, 200, 0, 20);
    const realGoal = calcStatus(200, 1000, 800, 200, 0, 40);

    expect(defaultGoal.savingsRate).toBe(20);
    expect(defaultGoal.goalProgress).toBe(100);
    expect(realGoal.goalProgress).toBe(50);
  });

  it('mantem base vazia estavel sem NaN ou Infinity', () => {
    const status = calcStatus(0, 0, 0, 0, 0, DEFAULT_SAVINGS_GOAL_PERCENT);

    expect(status.savingsRate).toBe(0);
    expect(status.debtRatio).toBe(0);
    expect(status.goalProgress).toBe(0);
    expect(Number.isFinite(status.score)).toBe(true);
    expect(Number.isFinite(status.patrimonyRisk)).toBe(true);
  });
});
