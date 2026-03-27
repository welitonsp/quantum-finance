// src/utils/autoCategory.js

// Regras de base para cobrir os gastos mais comuns imediatamente
const regrasBase = [
  {
    categoria: 'Alimentação',
    palavrasChave: ['supermercado', 'mercado', 'atacadao', 'mc donalds', 'ifood', 'sol', 'padaria', 'pizza', 'lanches']
  },
  {
    categoria: 'Assinaturas',
    palavrasChave: ['amazon br', 'google one', 'apple.com', 'netflix', 'spotify']
  },
  {
    categoria: 'Transporte',
    palavrasChave: ['uber', '99app', 'posto', 'combustivel', 'estacionamento']
  },
  {
    categoria: 'Educação',
    palavrasChave: ['escola', 'colegio', 'faculdade', 'curso', 'udemy']
  },
  {
    categoria: 'Impostos/Taxas',
    palavrasChave: ['iof', 'juros', 'tarifa', 'anuidade', 'multa']
  }
];

/**
 * Motor de categorização automática.
 * @param {string} descricaoBanco - O texto original que vem do extrato.
 * @param {Array} regrasUsuario - Regras criadas pelo utilizador (vindas do Firebase).
 * @returns {string} - A categoria correspondente ou "Diversos".
 */
export function autoCategorize(descricaoBanco, regrasUsuario = []) {
  if (!descricaoBanco) return 'Diversos';

  // Normalizamos o texto para minúsculas para não falhar por causa de maiúsculas (ex: "UBER" vs "Uber")
  const textoLimpo = descricaoBanco.toLowerCase();

  // 1. Prioridade Máxima: Regras personalizadas do utilizador (Firebase)
  if (regrasUsuario && regrasUsuario.length > 0) {
    for (const regra of regrasUsuario) {
      if (regra.keywords && regra.keywords.some(kw => textoLimpo.includes(kw.toLowerCase().trim()))) {
        return regra.category; 
      }
    }
  }

  // 2. Prioridade Secundária: Regras base do sistema
  for (const regra of regrasBase) {
    if (regra.palavrasChave.some(kw => textoLimpo.includes(kw.toLowerCase().trim()))) {
      return regra.categoria;
    }
  }

  // 3. Fallback: Se não encontrar nenhuma palavra-chave, agrupa em Diversos
  return 'Diversos';
}