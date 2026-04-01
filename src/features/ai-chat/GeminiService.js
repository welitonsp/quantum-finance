// src/features/ai-chat/GeminiService.js
import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔐 Procura a chave no seu ficheiro .env
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

export class GeminiService {
  /**
   * 🤖 MOTOR 1: Categorização Automática
   * Transforma descrições de extratos em categorias financeiras.
   */
  static async categorizeTransactionsBatch(transactions) {
    if (!transactions || transactions.length === 0) return [];

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      });
      
      const prompt = `Você é um analista financeiro sênior. 
Classifique estas transações em: Alimentação, Transporte, Assinaturas, Educação, Saúde, Moradia, Impostos/Taxas, Lazer, Vestuário, Salário, Freelance, Investimento, Diversos, Outros.
Responda APENAS um array JSON: [{"id": "id", "category": "Categoria"}].
Transações:
${transactions.map(t => `ID: ${t.id} | Descrição: "${t.description}" | Valor: R$ ${t.value}`).join('\n')}`;

      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    } catch (error) {
      console.error("Erro na Categorização IA:", error);
      return [];
    }
  }

  /**
   * 🧠 MOTOR 2: Consultor de Património
   * Responde a perguntas baseadas no saldo real do utilizador.
   */
  static async getFinancialAdvice(message, financialContext) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Você é o Quantum, um Gestor de Patrimônio de elite.
Contexto do Utilizador: Saldo R$ ${financialContext.saldo}, Entradas R$ ${financialContext.entradas}, Saídas R$ ${financialContext.saidas}.
Pergunta: "${message}"
Dê conselhos profissionais e diretos usando Markdown.`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      return "Lamento, Comandante. Ocorreu uma interferência quântica. Tente novamente.";
    }
  }
}