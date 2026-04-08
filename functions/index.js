const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Inicializa o Admin para termos acesso à base de dados na nuvem
admin.initializeApp();

// Instancia o Gemini (A Chave de API terá de ser configurada no Firebase)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Função Utilitária: Anonimização de Dados Sensíveis (LGPD)
 */
function sanitizeData(text) {
    if (!text) return "";
    let sanitized = text;
    sanitized = sanitized.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF_REMOVIDO]");
    sanitized = sanitized.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ_REMOVIDO]");
    sanitized = sanitized.replace(/\b\d{8,20}\b/g, "[NUM_REMOVIDO]");
    return sanitized;
}

// ============================================================================
// 1. MOTOR QUÂNTICO: Análise de Pareto (O seu código original mantido)
// ============================================================================
exports.analyzeParetoInsights = onCall({ cors: true, maxInstances: 10, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acesso negado: O utilizador não está autenticado.");

    const uid = request.auth.uid;
    const { paretoData, top80Value, totalDespesas } = request.data;

    if (!paretoData || paretoData.length === 0) {
        throw new HttpsError("invalid-argument", "Dados do Pareto insuficientes para análise.");
    }

    try {
        const db = admin.firestore();
        const callLogRef = db.collection("ai_usage_logs").doc(uid);
        const doc = await callLogRef.get();
        
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        
        if (doc.exists) {
            const data = doc.data();
            const recentCalls = (data.timestamps || []).filter(t => t > oneHourAgo);
            
            if (recentCalls.length >= 10) {
                throw new HttpsError("resource-exhausted", "Limite de 10 análises por hora atingido.");
            }
            await callLogRef.update({ timestamps: [...recentCalls, now] });
        } else {
            await callLogRef.set({ timestamps: [now] });
        }

        const safeDataString = sanitizeData(JSON.stringify(paretoData));
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `
        Você é o Cérebro Quântico, um conselheiro financeiro de elite ultra-objetivo.
        Analise os seguintes dados do Princípio de Pareto (Regra 80/20) de um usuário.
        Total Gasto: R$ ${totalDespesas}
        Valor nos Top 80%: R$ ${top80Value}
        Dados das Categorias: ${safeDataString}
        
        Forneça exatamente 3 dicas táticas curtas (máximo de 2 linhas cada) focadas em redução de danos e alocação inteligente.
        Não use saudações. Seja direto e use tom de consultor de negócios.
        Retorne as 3 dicas separadas pelo caractere pipe (|).
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const insights = responseText.split('|').map(i => i.trim()).filter(i => i.length > 0);

        return { success: true, insights: insights.length > 0 ? insights : ["Nenhum insight gerado. Tente novamente."] };
    } catch (error) {
        console.error("Erro na Análise Quântica:", error);
        throw new HttpsError("internal", "Falha na comunicação com o Motor Gemini.", error);
    }
});

// ============================================================================
// 2. MOTOR QUÂNTICO: Categorização em Lote (Para importar Extratos)
// ============================================================================
exports.categorizeTransactionsBatch = onCall({ cors: true, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acesso negado.");

    const { transactions } = request.data;
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
        throw new HttpsError("invalid-argument", "Nenhuma transação fornecida para análise.");
    }

    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
        });

        const txListString = transactions.map(t => 
            `ID: ${t.id} | Descrição: "${t.description}" | Valor: R$ ${t.value}`
        ).join('\n');
        
        const prompt = `Você é um sistema financeiro sênior de alta precisão. 
Sua tarefa é ler o extrato bancário abaixo e classificar CADA transação em uma destas categorias estritas:
[Alimentação, Transporte, Assinaturas, Educação, Saúde, Moradia, Impostos/Taxas, Lazer, Vestuário, Salário, Freelance, Investimento, Diversos, Outros].

Responda APENAS com um array JSON válido neste formato: [{"id": "ID_DA_TRANSAÇÃO", "category": "NOME_DA_CATEGORIA"}].

Extrato:
${txListString}`;

        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text());

    } catch (error) {
        console.error("Falha no Motor Quântico (Gemini):", error);
        throw new HttpsError("internal", "Interferência na comunicação com a IA.", error);
    }
});

// ============================================================================
// 3. MOTOR QUÂNTICO: Chat Advisor (Assistente Flutuante)
// ============================================================================
exports.quantumChatAdvisor = onCall({ cors: true, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acesso negado.");

    const { message, financialContext } = request.data;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Você é o Quantum, um Gestor de Patrimônio de elite, objetivo e direto.
Contexto do Utilizador este mês: 
Saldo Atual: R$ ${financialContext.saldo}
Total Entradas: R$ ${financialContext.entradas}
Total Saídas: R$ ${financialContext.saidas}

Pergunta do Comandante: "${message}"

Responda de forma profissional e tática usando Markdown. Seja conciso. Não use saudações longas.`;

        const result = await model.generateContent(prompt);
        return { reply: result.response.text() };

    } catch (error) {
        console.error("Erro no Chat:", error);
        throw new HttpsError("internal", "Erro de IA.");
    }
});