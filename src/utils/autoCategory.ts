import { CATEGORY_KEYWORDS } from '../shared/data/categoryKeywords';

interface UserRule {
  keywords: string[];
  category: string;
}


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

  for (const [categoria, palavrasChave] of Object.entries(CATEGORY_KEYWORDS)) {
    if (palavrasChave.some(kw => textoLimpo.includes(kw.toLowerCase().trim()))) {
      return categoria;
    }
  }

  return 'Diversos';
}
