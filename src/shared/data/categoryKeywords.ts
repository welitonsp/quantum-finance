/**
 * Fonte única de palavras-chave para categorização automática.
 * Consumida por ImportButton, autoCategorize e aiCategorize.
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Alimentação':    ['supermercado', 'carrefour', 'extra', 'mercado', 'atacadao', 'assai', 'padaria', 'hortifruti', 'acougue'],
  'Restaurantes':   ['ifood', 'rappi', 'mcdonalds', 'mc donalds', 'burger', 'pizza', 'lanches', 'restaurante', 'churrascaria'],
  'Transporte':     ['uber', '99app', 'posto', 'shell', 'ipiranga', 'gasolina', 'combustivel', 'estacionamento', 'sem parar', 'pedagio'],
  'Contas da Casa': ['energia', 'enel', 'cemig', 'copel', 'sabesp', 'saneamento', 'agua', 'comgas', 'internet', 'vivo fibra', 'claro net', 'oi fibra'],
  'Assinaturas':    ['netflix', 'spotify', 'amazon prime', 'disney', 'hbo max', 'globoplay', 'google one', 'apple.com', 'youtube premium'],
  'Saúde':          ['farmacia', 'drogasil', 'drogaria', 'droga raia', 'pague menos', 'hospital', 'laboratorio', 'clinica', 'unimed'],
  'Educação':       ['escola', 'colegio', 'faculdade', 'curso', 'udemy', 'alura', 'livraria'],
  'Impostos/Taxas': ['ipva', 'iptu', 'darf', 'multa', 'detran'],
  'Tarifas Bancárias': ['iof', 'juros', 'tarifa', 'anuidade', 'cesta de servicos', 'encargos'],
  'Seguros':        ['seguro', 'porto seguro', 'mapfre', 'sulamerica'],
  'Pets':           ['petz', 'cobasi', 'pet shop', 'petshop', 'veterinario'],
  'Viagem':         ['latam', 'gol linhas', 'azul linhas', 'booking', 'airbnb', 'hotel', 'decolar'],
  'Salário':        ['salario', 'pagto salario', 'folha de pagamento'],
  'Investimento':   ['rendimento', 'dividendo', 'jcp', 'resgate'],
  'Reembolso':      ['reembolso', 'estorno', 'cashback'],
};
