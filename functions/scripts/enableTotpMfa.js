/**
 * enableTotpMfa.js — habilita APENAS o provider TOTP de MFA no projeto
 * (Identity Platform), via Admin SDK oficial (projectConfigManager).
 *
 * GARANTIAS (por construção):
 * - NÃO ativa SMS: o campo `factorIds` (que controla o provider "phone")
 *   nunca é enviado no update — permanece exatamente como está no projeto.
 * - NÃO altera providers de login (Google etc.): o update envia SOMENTE
 *   `multiFactorConfig`; nenhum outro campo do config do projeto é tocado.
 * - NÃO imprime secrets: a saída é restrita ao bloco MFA (state, providers,
 *   adjacentIntervals) — o config completo do projeto nunca é logado.
 * - Fail-closed: `--execute` é obrigatório para escrever; sem ele, o script
 *   apenas lê. `--check` valida e retorna exit code utilizável em CI:
 *   0 = TOTP ENABLED · 2 = TOTP não habilitado · 1 = erro.
 *
 * USO (credenciais: ADC via `gcloud auth application-default login`, ou
 * GOOGLE_APPLICATION_CREDENTIALS apontando para service account com papel
 * "Firebase Authentication Admin"):
 *
 *   # 1. Ver estado atual (read-only):
 *   FIREBASE_PROJECT_ID=quantum-finance-39235 node scripts/enableTotpMfa.js --check
 *
 *   # 2. Habilitar TOTP (adjacentIntervals default = 5, faixa aceita 1..10):
 *   FIREBASE_PROJECT_ID=quantum-finance-39235 node scripts/enableTotpMfa.js --execute
 *
 *   # 3. Confirmar que ficou ENABLED:
 *   FIREBASE_PROJECT_ID=quantum-finance-39235 node scripts/enableTotpMfa.js --check
 *
 * Procedimento registrado em docs/security/ENABLE_TOTP_MFA_2026-07-04.md.
 */

const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');

const DEFAULT_ADJACENT_INTERVALS = 5;
const EMULATOR_PROJECT_IDS = new Set(['demo-quantum-finance', 'fake-project']);

function resolveProjectId(env = process.env) {
  const explicit = [env.FIREBASE_PROJECT_ID, env.GCLOUD_PROJECT, env.GOOGLE_CLOUD_PROJECT]
    .find((v) => typeof v === 'string' && v.trim().length > 0);
  if (!explicit) {
    throw new Error('missing_project_id: defina FIREBASE_PROJECT_ID explicitamente.');
  }
  const projectId = explicit.trim();
  if (EMULATOR_PROJECT_IDS.has(projectId)) {
    throw new Error('emulator_project_refused: este script é só para o projeto real.');
  }
  return projectId;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { check: false, execute: false, adjacentIntervals: DEFAULT_ADJACENT_INTERVALS };
  for (const arg of argv) {
    if (arg === '--check') args.check = true;
    else if (arg === '--execute') args.execute = true;
    else if (arg.startsWith('--adjacent-intervals=')) {
      const n = Number(arg.split('=')[1]);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        throw new Error('invalid_adjacent_intervals: use um inteiro entre 1 e 10.');
      }
      args.adjacentIntervals = n;
    } else {
      throw new Error(`unknown_arg: ${arg}`);
    }
  }
  if (args.check === args.execute) {
    throw new Error('usage: passe exatamente um de --check ou --execute.');
  }
  return args;
}

/** Resumo sanitizado do bloco MFA — nunca loga o config completo do projeto. */
function summarizeMfa(config) {
  const mfa = config.multiFactorConfig ?? {};
  const providerConfigs = mfa.providerConfigs ?? [];
  const totp = providerConfigs.find((p) => p.totpProviderConfig !== undefined);
  return {
    mfaState: mfa.state ?? 'DISABLED',
    smsFactorEnabled: Array.isArray(mfa.factorIds) && mfa.factorIds.includes('phone'),
    totpState: totp?.state ?? 'ABSENT',
    totpAdjacentIntervals: totp?.totpProviderConfig?.adjacentIntervals ?? null,
  };
}

function printSummary(label, summary) {
  console.log(`\n${label}`);
  console.log(`  MFA (projeto):        ${summary.mfaState}`);
  console.log(`  Provider TOTP:        ${summary.totpState}`);
  console.log(`  adjacentIntervals:    ${summary.totpAdjacentIntervals ?? '—'}`);
  console.log(`  Provider SMS (phone): ${summary.smsFactorEnabled ? 'ATIVO' : 'inativo'}`);
}

async function main() {
  const args = parseArgs();
  const projectId = resolveProjectId();

  if (admin.apps.length === 0) admin.initializeApp({ projectId });
  const manager = getAuth().projectConfigManager();

  console.log(`Projeto: ${projectId}`);
  const before = summarizeMfa(await manager.getProjectConfig());
  printSummary('Estado atual do MFA:', before);

  if (args.check) {
    if (before.totpState === 'ENABLED') {
      console.log('\n✔ TOTP está ENABLED.');
      return;
    }
    console.log('\n✖ TOTP NÃO está habilitado. Rode com --execute para habilitar.');
    process.exitCode = 2;
    return;
  }

  // --execute: envia SOMENTE multiFactorConfig; factorIds (SMS) fica de fora
  // de propósito — o que não é enviado não é alterado.
  console.log(`\nHabilitando TOTP (adjacentIntervals=${args.adjacentIntervals})...`);
  const updated = await manager.updateProjectConfig({
    multiFactorConfig: {
      state: 'ENABLED',
      providerConfigs: [
        {
          state: 'ENABLED',
          totpProviderConfig: { adjacentIntervals: args.adjacentIntervals },
        },
      ],
    },
  });

  const after = summarizeMfa(updated);
  printSummary('Estado após o update:', after);

  if (after.totpState !== 'ENABLED') {
    console.error('\n✖ Update aplicado mas TOTP não retornou ENABLED — investigar no console.');
    process.exitCode = 1;
    return;
  }
  if (after.smsFactorEnabled && !before.smsFactorEnabled) {
    console.error('\n✖ ALERTA: SMS aparece ativo após o update (não deveria). Reverter no console.');
    process.exitCode = 1;
    return;
  }
  console.log('\n✔ TOTP habilitado com sucesso. SMS permanece inalterado.');
  console.log('  Valide com: node scripts/enableTotpMfa.js --check');
}

if (require.main === module) {
  main().catch((error) => {
    // Sem stack/objeto bruto: só a mensagem curta (pode conter código gRPC, nunca secret).
    console.error(`\nErro: ${error instanceof Error ? error.message : 'desconhecido'}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, resolveProjectId, summarizeMfa, DEFAULT_ADJACENT_INTERVALS };
