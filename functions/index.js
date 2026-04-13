const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

exports.categorizeTransactionsBatch = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Acesso Negado.');
  
  const { transactions } = data;
  if (!transactions || !Array.isArray(transactions)) return [];

  try {
    return []; 
  } catch (error) {
    console.error("Erro na categorização:", error);
    throw new functions.https.HttpsError('internal', 'Falha no motor quântico.');
  }
});

// 🌟 O Motor Seguro do Chat AI
exports.chatWithQuantumAI = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Intrusão detetada. Acesso Negado.');
  }

  const { prompt, history, financialContext } = data;
  
  // 🚀 ATUALIZAÇÃO: Lê a chave diretamente do novo sistema .env do Firebase
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'Chave de Ignição da IA não configurada no cofre do backend.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const systemInstruction = `
      Você é a Quantum AI, uma inteligência artificial financeira de elite.
      Analise os seguintes dados financeiros do utilizador para dar contexto às suas respostas:
      ${JSON.stringify(financialContext || {})}
      
      Responda de forma direta, profissional, em português, e nunca invente dados que não estejam no contexto financeiro.
    `;

    const fullPrompt = `${systemInstruction}\n\nPergunta do utilizador: ${prompt}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    return { reply: text };
  } catch (error) {
    console.error("Erro no Gemini:", error);
    throw new functions.https.HttpsError('internal', 'O núcleo de IA falhou ao processar a resposta.');
  }
});