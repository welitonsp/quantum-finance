/**
 * Fonte única de palavras-chave para categorização automática.
 * Consumida por ImportButton, autoCategorize e aiCategorize.
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Alimentação':    ['ifood', 'mcdonalds', 'mc donalds', 'burger', 'supermercado', 'carrefour', 'extra', 'mercado', 'atacadao', 'padaria', 'pizza', 'lanches', 'sol'],
  'Transporte':     ['uber', '99app', 'posto', 'shell', 'gasolina', 'combustivel', 'estacionamento'],
  'Assinaturas':    ['netflix', 'spotify', 'amazon br', 'amazon', 'google one', 'apple.com'],
  'Saúde':          ['farmacia', 'drogasil', 'hospital'],
  'Educação':       ['escola', 'colegio', 'faculdade', 'curso', 'udemy'],
  'Impostos/Taxas': ['iof', 'juros', 'tarifa', 'anuidade', 'multa'],
  'Salário':        ['salario', 'pagto salario'],
  'Investimento':   ['rendimento', 'dividendo'],
};
