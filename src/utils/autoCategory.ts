// src/utils/autoCategory.ts

interface BaseRule {
  categoria: string;
  palavrasChave: string[];
}

interface UserRule {
  keywords: string[];
  category: string;
}

const regrasBase: BaseRule[] = [
  { categoria: 'Alimentação',    palavrasChave: ['supermercado', 'mercado', 'atacadao', 'mc donalds', 'ifood', 'sol', 'padaria', 'pizza', 'lanches'] },
  { categoria: 'Assinaturas',    palavrasChave: ['amazon br', 'google one', 'apple.com', 'netflix', 'spotify'] },
  { categoria: 'Transporte',     palavrasChave: ['uber', '99app', 'posto', 'combustivel', 'estacionamento'] },
  { categoria: 'Educação',       palavrasChave: ['escola', 'colegio', 'faculdade', 'curso', 'udemy'] },
  { categoria: 'Impostos/Taxas', palavrasChave: ['iof', 'juros', 'tarifa', 'anuidade', 'multa'] },
];

export function autoCategorize(descricaoBanco: string, regrasUsuario: UserRule[] = []): string {
  if (!descricaoBanco) return 'Diversos';
  const textoLimpo = descricaoBanco.toLowerCase();

  if (regrasUsuario.length > 0) {
    for (const regra of regrasUsuario) {
      if (regra.keywords?.some(kw => textoLimpo.includes(kw.toLowerCase().trim()))) {
        return regra.category;
      }
    }
  }

  for (const regra of regrasBase) {
    if (regra.palavrasChave.some(kw => textoLimpo.includes(kw))) return regra.categoria;
  }

  return 'Diversos';
}
