// src/utils/autoCategory.js

/**
 * Motor de Categorização Automática (Dinâmico)
 * Recebe a descrição crua e as regras do utilizador vindas da base de dados.
 */
export function autoCategorize(rawDescription, customRules = []) {
  if (!rawDescription) return "Diversos";
  
  const desc = rawDescription.toLowerCase();

  // O sistema varre as regras dinâmicas do utilizador
  for (const rule of customRules) {
    if (!rule.keywords) continue;
    
    // Verifica se alguma palavra-chave da regra está contida na descrição do banco
    const match = rule.keywords.some(keyword => 
      desc.includes(keyword.toLowerCase().trim())
    );

    if (match) {
      return rule.category; // Encontrou! Devolve a categoria correta
    }
  }

  // Se o sistema não conhecer a palavra, cai na categoria padrão
  return "Diversos";
}