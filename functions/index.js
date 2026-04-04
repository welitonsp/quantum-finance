// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

const apiKey = process.env.GEMINI_API_KEY || functions.config().gemini?.key;
const genAI = new GoogleGenerativeAI(apiKey);

// ============================================================================
// 🛡️ SISTEMA DE PROTEÇÃO: RATE LIMITING
// ============================================================================
async function checkRateLimit(uid, functionName, maxCallsPerHour = 30) {
  const db = admin.firestore();
  const ref = db.collection('rate_limits').doc(`${uid}_${functionName}`);
  
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : { calls: [], lastReset: now };
  
  const recentCalls = (data.calls || []).filter(ts => ts > oneHourAgo);
  
  if (recentCalls.length >= maxCallsPerHour) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Limite de ${maxCallsPerHour} consultas por hora atingido. Proteção de custos ativada.`
    );
  }
  
  await ref.set({ calls: [...recentCalls, now] }, { merge: true });
}

// ============================================================================
// 🛡️ SISTEMA DE PROTEÇÃO: ANONIMIZAÇÃO DE DADOS (LGPD)
// ============================================================================
const anonimizarDescricao = (desc) => {
  if (!desc) return "";
  return desc
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[CPF]')
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '[CNPJ]')
    .replace(/ag[eê]ncia?\s*\d+/gi, 'ag [NUM]')
    .replace(/conta\s*\d+/gi, 'cc [NUM]')
    .trim()
    .substring(0, 80);
};

// ============================================================================
// 🤖 MOTOR IA 1.0: CATEGORIZADOR DE TRANSAÇÕES
// ============================================================================
exports.categorizeTransactionsBatch = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acesso negado.');
    await checkRateLimit(context.auth.uid, 'categorize', 50); // Máx 50 chamadas por hora

    const transactions = data.transactions;
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) return [];

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      });
      
      const prompt = `Você é um analista financeiro sênior especializado em Open Finance brasileiro.
Sua missão é ler as descrições de extratos bancários e classificá-las ESTRITAMENTE em UMA das categorias exatas.

CATEGORIAS PERMITIDAS:
Alimentação, Transporte, Assinaturas, Educação, Saúde, Moradia, Impostos/Taxas, Lazer, Vestuário, Salário, Freelance, Investimento, Diversos, Outros

REGRAS RÍGIDAS:
1. Responda APENAS com um array JSON válido. NENHUM texto adicional.
2. Se a sigla for PIX, TED ou DOC, analise a string para deduzir a categoria.
3. Lanches, iFood, padaria e mercado são "Alimentação".
4. Uber, 99, posto, gasolina são "Transporte".
5. Netflix, Spotify, Amazon são "Assinaturas".

O formato EXATO da sua resposta deve ser um array JSON:
[{"id": "id-da-transacao", "category": "Categoria Exata"}]

TRANSAÇÕES A CLASSIFICAR:
${transactions.map(t => `ID: ${t.id} | "${anonimizarDescricao(t.description)}" | Tipo: ${t.type}`).join('\n')}
`;

      const result = await model.generateContent(prompt);
      return JSON.parse((await result.response.text()).trim());

    } catch (error) {
      console.error("Erro na API do Gemini:", error);
      throw new functions.https.HttpsError('internal', 'Falha ao categorizar.');
    }
});

// ============================================================================
// 🧠 MOTOR IA 2.0: GESTOR DE PATRIMÓNIO (CHAT ANONIMIZADO)
// ============================================================================
exports.quantumChatAdvisor = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acesso negado.');
    await checkRateLimit(context.auth.uid, 'quantumChat', 30); // Máx 30 mensagens por hora

    const { message, financialContext } = data;
    if (!message) throw new functions.https.HttpsError('invalid-argument', 'Mensagem vazia.');

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { temperature: 0.5 }
      });

      // Cálculo de métricas relativas (anonimizadas) no servidor
      const entradas = financialContext?.entradas || 0;
      const saidas = financialContext?.saidas || 0;
      const saldo = entradas - saidas;
      const situacao = saldo >= 0 ? 'POSITIVA' : 'NEGATIVA';
      const taxaPoupanca = entradas > 0 ? ((saldo / entradas) * 100).toFixed(1) + '%' : '0%';

      const systemPrompt = `Você é o Quantum, um Gestor de Patrimônio de elite especializado no Brasil.

PERFIL FINANCEIRO DO UTILIZADOR (Dados Anonimizados/Relativos):
- Situação do Mês: ${situacao}
- Taxa de Poupança de Receitas: ${taxaPoupanca}
- Volume de Transações Ativas: ${financialContext?.totalTransacoes || 0}

REGRAS DE CONDUTA:
1. Dê conselhos baseados nos padrões acima, sem mencionar valores exatos.
2. Se a situação for negativa, sugira cortes agressivos de gastos invisíveis. 
3. Se for positiva, sugira investimentos do mercado brasileiro (Selic, CDB, Tesouro Direto).
4. Use formatação Markdown (negritos, listas) para facilitar a leitura.
5. Recuse responder sobre temas que não sejam finanças ou carreira.

PERGUNTA: "${message}"`;

      const result = await model.generateContent(systemPrompt);
      return { reply: (await result.response.text()) };

    } catch (error) {
      console.error("Erro no Chat do Gemini:", error);
      throw new functions.https.HttpsError('internal', 'O Gestor Quântico está temporariamente indisponível.');
    }
});

// ============================================================================
// 🛡️ MOTOR DE AUDITORIA: REGISTO IMUTÁVEL SANEADO (LGPD)
// ============================================================================
const sanitizeForAudit = (data) => {
  if (!data) return null;
  return {
    value: data.value,
    type: data.type,
    category: data.category,
    date: data.date,
    account: data.accountId || data.account,
    // EXCLUÍDOS: description (evitar fuga de CPF) e metadados pesados
  };
};

exports.auditTransactionChanges = functions.firestore
  .document('users/{userId}/transactions/{transactionId}')
  .onWrite(async (change, context) => {
    const { userId, transactionId } = context.params;

    let operation = 'UPDATE';
    if (!change.before.exists) operation = 'CREATE';
    else if (!change.after.exists) operation = 'DELETE';

    const auditRecord = {
      userId,
      transactionId,
      operation,
      timestamp: admin.firestore.FieldValue.serverTimestamp(), 
      eventId: context.eventId,
    };

    if (operation === 'CREATE' || operation === 'UPDATE') {
      auditRecord.newData = sanitizeForAudit(change.after.data());
    }
    if (operation === 'DELETE' || operation === 'UPDATE') {
      auditRecord.oldData = sanitizeForAudit(change.before.data());
    }

    try {
      await admin.firestore().collection('audit_logs').add(auditRecord);
    } catch (error) {
      console.error('[AUDIT ERROR]', error);
    }
  });