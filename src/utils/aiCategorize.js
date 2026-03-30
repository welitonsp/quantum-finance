// src/utils/aiCategorize.js
import toast from "react-hot-toast";

// Lemos a chave gratuita do Google Gemini diretamente do ambiente local
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export async function classifyWithAI(transactions) {
  if (!API_KEY) {
    toast.error("Chave de API do Gemini não configurada no .env.local!");
    return transactions;
  }
  if (transactions.length === 0) return transactions;

  // 🧠 ENGENHARIA DE PROMPT (Otimizada para o Frontend)
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

  try {
    // Chamada REST direta à API gratuita do Gemini 1.5 Flash
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
            temperature: 0.1, // Zero alucinações para precisão financeira
            responseMimeType: "application/json" // Força o Gemini a não usar Markdown
        }
      }),
    });

    if (!response.ok) throw new Error(`Falha na API: ${response.status}`);

    const data = await response.json();
    
    // Extrai o texto da resposta do Gemini e transforma em objeto JS
    const content = data.candidates[0].content.parts[0].text.trim();
    const aiResults = JSON.parse(content);

    // Mapeia os resultados de volta para as transações originais
    return transactions.map(tx => {
      const result = aiResults.find(r => r.id === tx.id);
      return result ? { ...tx, category: result.category } : tx;
    });

  } catch (err) {
    console.error("Falha Quântica (Gemini):", err);
    toast.error("A rede neural falhou. Verifique se a chave no .env.local está correta.");
    return transactions; // Retorna o array original intacto em caso de erro
  }
}