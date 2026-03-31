// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

// A chave será lida das variáveis de ambiente seguras do Firebase (nunca exposta no código)
const apiKey = process.env.GEMINI_API_KEY || functions.config().gemini?.key;
const genAI = new GoogleGenerativeAI(apiKey);

exports.categorizeTransactionsBatch = functions.https.onCall(async (data, context) => {
  // BARREIRA DE SEGURANÇA: Só aceita utilizadores que fizeram login na tua App
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Acesso negado à IA. Faça login primeiro.');
  }

  const transactions = data.transactions;
  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  try {
    // Configuração do modelo com as tuas regras exatas de precisão
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { 
        temperature: 0.1, 
        responseMimeType: "application/json" 
      }
    });
    
    // A TUA ENGENHARIA DE PROMPT EXATA (Agora blindada no servidor)
    const prompt = `Você é um analista financeiro sênior especializado em Open Finance brasileiro.
Sua missão é ler as descrições de extratos bancários e classificá-las ESTRITAMENTE em UMA das categorias exatas da lista permitida.

CATEGORIAS PERMITIDAS:
Alimentação, Transporte, Assinaturas, Educação, Saúde, Moradia, Impostos/Taxas, Lazer, Vestuário, Salário, Freelance, Investimento, Diversos, Outros

REGRAS RÍGIDAS:
1. Responda APENAS com um array JSON válido. NENHUM texto adicional.
2. Se a sigla for PIX, TED ou DOC, analise o nome do recebedor/pagador para deduzir a categoria. Se for impossível deduzir, use "Diversos".
3. Lanches, iFood, padaria e mercado são "Alimentação".
4. Uber, 99, posto, gasolina são "Transporte".
5. Netflix, Spotify, Amazon são "Assinaturas".

O formato EXATO da sua resposta deve ser um array JSON como este:
[{"id": "id-da-transacao", "category": "Categoria Exata"}]

TRANSAÇÕES A CLASSIFICAR:
${transactions.map(t => `ID: ${t.id} | Descrição: "${t.description}" | Valor: R$ ${t.value} | Tipo: ${t.type}`).join('\n')}
`;

    // Chama o Gemini a partir do servidor
    const result = await model.generateContent(prompt);
    const responseText = await result.response.text();
    
    // Converte a string JSON que o Gemini devolve num objeto JavaScript e devolve ao Frontend
    return JSON.parse(responseText.trim());

  } catch (error) {
    console.error("Erro na API do Gemini:", error);
    throw new functions.https.HttpsError('internal', 'Falha ao categorizar transações na nuvem.');
  }
});