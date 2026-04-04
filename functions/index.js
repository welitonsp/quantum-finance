const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Inicializa o Admin para termos acesso à base de dados na nuvem
admin.initializeApp();

// Instancia o Gemini (A Chave de API terá de ser configurada no Firebase)
// Usamos o modelo Flash por ser o mais rápido e barato para análise de texto
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Função Utilitária: Anonimização de Dados Sensíveis (LGPD)
 * Remove CPFs, CNPJs e padrões numéricos longos antes de enviar à IA
 */
function sanitizeData(text) {
    if (!text) return "";
    let sanitized = text;
    // Remove padrão de CPF (000.000.000-00 ou 00000000000)
    sanitized = sanitized.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF_REMOVIDO]");
    // Remove padrão de CNPJ
    sanitized = sanitized.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ_REMOVIDO]");
    // Remove números de telefone/contas bancárias longas
    sanitized = sanitized.replace(/\b\d{8,20}\b/g, "[NUM_REMOVIDO]");
    return sanitized;
}

/**
 * CLOUD FUNCTION: analyzeParetoInsights
 * Recebe os dados brutos do Pareto do Frontend, anonimiza e pede dicas ao Gemini.
 */
// Nota de Segurança: Adicionamos o array 'secrets' para garantir que a função acesse a sua chave
exports.analyzeParetoInsights = onCall({ cors: true, maxInstances: 10, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    // 1. BLOQUEIO DE SEGURANÇA: Só utilizadores autenticados podem usar
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Acesso negado: O utilizador não está autenticado.");
    }

    const uid = request.auth.uid;
    const { paretoData, top80Value, totalDespesas } = request.data;

    if (!paretoData || paretoData.length === 0) {
        throw new HttpsError("invalid-argument", "Dados do Pareto insuficientes para análise.");
    }

    try {
        // 2. RATE LIMITING (Proteção contra abuso/custos altos)
        // Regista a chamada na base de dados e verifica se não passou do limite (ex: 10 por hora)
        const db = admin.firestore();
        const callLogRef = db.collection("ai_usage_logs").doc(uid);
        const doc = await callLogRef.get();
        
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        
        if (doc.exists) {
            const data = doc.data();
            const recentCalls = (data.timestamps || []).filter(t => t > oneHourAgo);
            
            if (recentCalls.length >= 10) {
                throw new HttpsError("resource-exhausted", "Limite de 10 análises por hora atingido. O Cérebro Quântico precisa de arrefecer.");
            }
            // Atualiza os logs
            await callLogRef.update({ timestamps: [...recentCalls, now] });
        } else {
            await callLogRef.set({ timestamps: [now] });
        }

        // 3. ANONIMIZAÇÃO E PREPARAÇÃO DOS DADOS
        const safeDataString = sanitizeData(JSON.stringify(paretoData));

        // 4. CHAMADA AO GEMINI
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

        // Separa as dicas geradas pelo caractere pipe
        const insights = responseText.split('|').map(i => i.trim()).filter(i => i.length > 0);

        // 5. DEVOLVE OS DADOS SEGUROS AO FRONTEND
        return {
            success: true,
            insights: insights.length > 0 ? insights : ["Nenhum insight gerado. Tente novamente."]
        };

    } catch (error) {
        console.error("Erro na Análise Quântica:", error);
        throw new HttpsError("internal", "Falha na comunicação com o Motor Gemini.", error);
    }
});