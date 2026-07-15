import { describe, it, expect } from 'vitest';
import {
  INTENT_REGISTRY,
  AGENT_TOOLS,
  isActionIntent,
} from '../intentRegistry';
import { AGENT_INTENTS } from '../../../shared/schemas/agentSchemas';

describe('INTENT_REGISTRY', () => {
  it('has an entry for every AgentIntent in AGENT_INTENTS', () => {
    for (const intent of AGENT_INTENTS) {
      expect(INTENT_REGISTRY[intent]).toBeDefined();
      expect(INTENT_REGISTRY[intent].id).toBe(intent);
    }
  });

  it('has exactly AGENT_INTENTS.length keys (no extra, no missing)', () => {
    expect(Object.keys(INTENT_REGISTRY)).toHaveLength(AGENT_INTENTS.length);
  });

  it('gives every entry a non-empty label', () => {
    for (const intent of AGENT_INTENTS) {
      const def = INTENT_REGISTRY[intent];
      expect(typeof def.label).toBe('string');
      expect(def.label.length).toBeGreaterThan(0);
    }
  });

  it('gives every entry at least one tool', () => {
    for (const intent of AGENT_INTENTS) {
      expect(INTENT_REGISTRY[intent].tools.length).toBeGreaterThan(0);
    }
  });

  it('only references tool names that exist in AGENT_TOOLS', () => {
    for (const intent of AGENT_INTENTS) {
      for (const tool of INTENT_REGISTRY[intent].tools) {
        expect(AGENT_TOOLS).toContain(tool);
      }
    }
  });

  it('gives every action intent (kind !== undefined) a non-empty requiredSlots array', () => {
    for (const intent of AGENT_INTENTS) {
      const def = INTENT_REGISTRY[intent];
      if (def.kind !== undefined) {
        expect(Array.isArray(def.requiredSlots)).toBe(true);
        expect(def.requiredSlots?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

describe('isActionIntent', () => {
  const actionIntents = [
    'simulate_purchase',
    'plan_debt_payment',
    'create_budget_proposal',
    'contribute_to_goal_proposal',
    'register_income_proposal',
    'register_transfer_proposal',
  ] as const;

  const answerIntents = [
    'get_balances',
    'get_invoice',
    'explain_month',
    'cashflow_briefing',
  ] as const;

  it('returns true for action intents', () => {
    for (const intent of actionIntents) {
      expect(isActionIntent(intent)).toBe(true);
    }
  });

  it('returns false for answer-only intents', () => {
    for (const intent of answerIntents) {
      expect(isActionIntent(intent)).toBe(false);
    }
  });
});
