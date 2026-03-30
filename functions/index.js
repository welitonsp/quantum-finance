// functions/index.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Inicializa o SDK do Gemini com a chave do ficheiro .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.categorizeTransactions = onCall(async (request) => {
  // 1. PROTEÇÃO DE SEGURANÇA: Só utilizadores logados podem chamar esta função
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Acesso negado: O utilizador não está autenticado.');
  }

  const transactions = request.data.transactions;
  if (!transactions || transactions.length === 0) {
    return [];
  }

  // 2. ENGENHARIA DE PROMPT (No Servidor)
  const promptSystem = `Você é um analista financeiro sênior especializado em Open Finance brasileiro.
Sua missão é ler as descrições de extratos bancários e classificá-las ESTRITAMENTE em UMA das categorias exatas da lista permitida.

CATEGORIAS PERMITIDAS:
Alimentação, Transporte, Assinaturas, Educação, Saúde, Moradia, Impostos/Taxas, Lazer, Vestuário, Salário, Freelance, Investimento, Diversos, Outros

REGRAS RÍGIDAS:
1. Responda APENAS com um array JSON válido. NENHUM texto adicional.
2. Se a sigla for PIX, TED ou DOC, analise o nome para deduzir a categoria. Se impossível, use "Diversos".
3. Lanches, iFood, padaria e mercado são "Alimentação". Uber, 99, gasolina são "Transporte".

O formato EXATO da resposta deve ser:
[{"id": "id-da-transacao", "category": "Categoria Exata"}]`;

  const promptUser = `TRANSAÇÕES:\n${transactions.map(t => 
    `ID: ${t.id} | Descrição: "${t.description}" | Valor: R$ ${t.value}`
  ).join('\n')}`;

  try {
    // 3. CHAMADA AO MODELO
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.1, // Quase zero alucinações
        responseMimeType: "application/json", // Força saída em JSON
      }
    });

    const result = await model.generateContent([promptSystem, promptUser]);
    const responseText = result.response.text();

    // 4. RETORNO LIMPO
    return JSON.parse(responseText);

  } catch (error) {
    console.error("Erro na Rede Neural:", error);
    throw new HttpsError('internal', 'Falha ao processar a classificação quântica.');
  }
});