const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Utilitário: Anonimização de Dados (LGPD / GDPR)
 */
function sanitizeData(text) {
    if (!text) return "";
    let sanitized = text;
    sanitized = sanitized.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF_REMOVIDO]");
    sanitized = sanitized.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ_REMOVIDO]");
    sanitized = sanitized.replace(/\b\d{8,20}\b/g, "[NUM_REMOVIDO]");
    return sanitized;
}

/**
 * Utilitário: Rate Limiter Universal (Previne abuso da API e custos altos)
 */
async function checkRateLimit(uid, limitPoints, timeWindowHours = 1) {
    const db = admin.firestore();
    const callLogRef = db.collection("ai_usage_logs").doc(uid);
    const doc = await callLogRef.get();
    const now = Date.now();
    const windowStart = now - (timeWindowHours * 60 * 60 * 1000);
    
    if (doc.exists) {
        const data = doc.data();
        const recentCalls = (data.timestamps || []).filter(t => t > windowStart);
        if (recentCalls.length >= limitPoints) {
            throw new HttpsError("resource-exhausted", `Limite de segurança ativado: Atingiu o máximo de comandos à IA por hora.`);
        }
        await callLogRef.update({ timestamps: [...recentCalls, now] });
    } else {
        await callLogRef.set({ timestamps: [now] });
    }
}

// ============================================================================
// 1. MOTOR QUÂNTICO: Análise de Pareto (Regra 80/20)
// ============================================================================
exports.analyzeParetoInsights = onCall({ cors: true, timeoutSeconds: 60, maxInstances: 10, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acesso negado.");
    
    const { paretoData, top80Value, totalDespesas } = request.data;
    if (!paretoData || paretoData.length === 0) throw new HttpsError("invalid-argument", "Dados insuficientes.");

    try {
        await checkRateLimit(request.auth.uid, 15); // Máximo 15 análises por hora

        const safeDataString = sanitizeData(JSON.stringify(paretoData));
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `Você é o Cérebro Quântico, conselheiro financeiro ultra-objetivo.
Total Gasto: R$ ${totalDespesas} | Top 80%: R$ ${top80Value} | Dados: ${safeDataString}
Forneça 3 dicas táticas curtas (máximo 2 linhas) de alocação inteligente. Separe as dicas por pipe (|).`;

        const result = await model.generateContent(prompt);
        const insights = result.response.text().split('|').map(i => i.trim()).filter(i => i.length > 0);
        return { success: true, insights: insights.length > 0 ? insights : ["Nenhum insight gerado."] };
    } catch (error) {
        console.error("Erro Quântico:", error);
        throw new HttpsError(error.code || "internal", error.message || "Falha no Motor.");
    }
});

// ============================================================================
// 2. MOTOR QUÂNTICO: Categorização em Lote (Importação)
// ============================================================================
exports.categorizeTransactionsBatch = onCall({ cors: true, timeoutSeconds: 180, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acesso negado.");
    
    const { transactions } = request.data;
    if (!transactions || transactions.length === 0) throw new HttpsError("invalid-argument", "Lote vazio.");

    try {
        await checkRateLimit(request.auth.uid, 20); // Limite de 20 importações por hora

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
        });

        const txListString = transactions.map(t => `ID:${t.id} | Desc:${t.description} | R$${t.value}`).join('\n');
        
        const prompt = `Analise este lote de transações bancárias e retorne APENAS um JSON:
[{"id": "ID_AQUI", "category": "CATEGORIA", "tag": "Fixa|Variável|Endividamento|Receita"}]
Extrato:\n${txListString}`;

        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text());
    } catch (error) {
        console.error("Falha no Batch:", error);
        throw new HttpsError("internal", "Interferência na comunicação com a IA.");
    }
});

// ============================================================================
// 3. MOTOR QUÂNTICO: Chat Advisor
// ============================================================================
exports.quantumChatAdvisor = onCall({ cors: true, timeoutSeconds: 60, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acesso negado.");

    const { message, financialContext } = request.data;

    try {
        await checkRateLimit(request.auth.uid, 30); // 30 mensagens por hora

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Você é o Quantum, Gestor de Patrimônio de elite.
Contexto: Saldo R$${financialContext.saldo} | Entradas R$${financialContext.entradas} | Saídas R$${financialContext.saidas}.
Pergunta: "${sanitizeData(message)}"
Responda de forma profissional e tática usando Markdown.`;

        const result = await model.generateContent(prompt);
        return { reply: result.response.text() };
    } catch (error) {
        console.error("Erro no Chat:", error);
        throw new HttpsError(error.code || "internal", error.message || "Erro de IA.");
    }
});