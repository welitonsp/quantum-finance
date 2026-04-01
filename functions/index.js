// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

// A chave será lida das variáveis de ambiente seguras do Firebase (nunca exposta no código frontend)
const apiKey = process.env.GEMINI_API_KEY || functions.config().gemini?.key;
const genAI = new GoogleGenerativeAI(apiKey);

// ============================================================================
// 🤖 MOTOR IA 1.0: CATEGORIZADOR DE TRANSAÇÕES (JSON ESTRITO)
// ============================================================================
exports.categorizeTransactionsBatch = functions.https.onCall(async (data, context) => {
  // BARREIRA DE SEGURANÇA: Só aceita utilizadores autenticados
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Acesso negado à IA. Faça login primeiro.');
  }

  const transactions = data.transactions;
  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  try {
    // Configuração do modelo com regras exatas de precisão para JSON
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { 
        temperature: 0.1, // Temperatura baixa para respostas lógicas e determinísticas
        responseMimeType: "application/json" 
      }
    });
    
    // ENGENHARIA DE PROMPT EXATA DO COMANDANTE
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
    
    // Converte a string JSON num objeto JavaScript e devolve ao Frontend
    return JSON.parse(responseText.trim());

  } catch (error) {
    console.error("Erro na API do Gemini (Categorização):", error);
    throw new functions.https.HttpsError('internal', 'Falha ao categorizar transações na nuvem.');
  }
});


// ============================================================================
// 🧠 MOTOR IA 2.0: GESTOR DE PATRIMÓNIO (CHAT CONVERSACIONAL)
// ============================================================================
exports.quantumChatAdvisor = functions.https.onCall(async (data, context) => {
  // BARREIRA DE SEGURANÇA
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Acesso negado ao chat quântico.');
  }

  const { message, financialContext } = data;
  if (!message) {
    throw new functions.https.HttpsError('invalid-argument', 'Mensagem vazia.');
  }

  try {
    // Para o chat, usamos o modelo normal (texto livre) com temperatura ligeiramente maior para ser mais natural
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.5
      }
    });

    const systemPrompt = `Você é o Quantum, um Gestor de Patrimônio de elite e analista financeiro sênior especializado no mercado brasileiro.
O utilizador está a falar consigo a partir do seu dashboard financeiro pessoal.

DADOS REAIS DO UTILIZADOR NESTE MÊS (Contexto Atual):
- Total de Entradas: R$ ${financialContext?.entradas?.toFixed(2) || '0.00'}
- Total de Saídas: R$ ${financialContext?.saidas?.toFixed(2) || '0.00'}
- Saldo do Mês: R$ ${financialContext?.saldo?.toFixed(2) || '0.00'}
- Quantidade de Transações: ${financialContext?.totalTransacoes || 0}

REGRAS DE CONDUTA:
1. Seja altamente analítico, direto e aja como um consultor financeiro profissional.
2. Dê conselhos baseados ESTRITAMENTE nos números reais fornecidos acima.
3. Se o saldo for negativo, sugira cortes agressivos e revisão de gastos invisíveis. Se for positivo, sugira investimentos seguros do mercado brasileiro (Selic, CDB de liquidez diária, Tesouro Direto).
4. Use formatação Markdown (negritos, listas com bullet points) para tornar a leitura visualmente agradável.
5. Nunca responda a perguntas que não sejam sobre finanças, negócios, economia ou carreira do utilizador. Se perguntarem outra coisa, recuse educadamente e volte ao tema financeiro.

PERGUNTA DO UTILIZADOR: "${message}"`;

    const result = await model.generateContent(systemPrompt);
    const responseText = await result.response.text();

    return { reply: responseText };

  } catch (error) {
    console.error("Erro no Chat do Gemini (Quantum Advisor):", error);
    throw new functions.https.HttpsError('internal', 'O Gestor Quântico está temporariamente indisponível devido a anomalias de rede.');
  }
});