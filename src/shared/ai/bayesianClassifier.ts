// src/shared/ai/bayesianClassifier.ts

interface TrainingDoc {
  description: string;
  category: string;
}

export interface ClassifyResult {
  category: string;
  confidence: number;
}

export class BayesianClassifier {
  private wordCounts: Record<string, Record<string, number>> = {};
  private categoryCounts: Record<string, number> = {};
  private totalDocs = 0;
  private vocabulary = new Set<string>();

  private tokenize(text: string): string[] {
    return text
      .toUpperCase()
      .replace(/[^A-ZÀ-Ú0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  train(docs: TrainingDoc[]): void {
    for (const { description, category } of docs) {
      if (!description || !category) continue;
      const tokens = this.tokenize(description);

      this.categoryCounts[category] = (this.categoryCounts[category] || 0) + 1;
      this.totalDocs++;

      if (!this.wordCounts[category]) this.wordCounts[category] = {};
      for (const token of tokens) {
        this.vocabulary.add(token);
        this.wordCounts[category][token] = (this.wordCounts[category][token] || 0) + 1;
      }
    }
  }

  classify(description: string): ClassifyResult {
    const categories = Object.keys(this.categoryCounts);
    if (categories.length === 0) return { category: 'Outros', confidence: 0 };

    const tokens = this.tokenize(description);
    if (tokens.length === 0) return { category: 'Outros', confidence: 0 };

    const vocabSize = this.vocabulary.size || 1;
    const logScores: Record<string, number> = {};

    for (const cat of categories) {
      const catWords = this.wordCounts[cat] || {};
      const totalCatWords = Object.values(catWords).reduce((a, b) => a + b, 0);

      let logScore = Math.log(this.categoryCounts[cat] / this.totalDocs);
      for (const token of tokens) {
        logScore += Math.log(((catWords[token] || 0) + 1) / (totalCatWords + vocabSize));
      }
      logScores[cat] = logScore;
    }

    // Softmax para converter log-scores em probabilidades
    const maxScore = Math.max(...Object.values(logScores));
    let sumExp = 0;
    const expScores: Record<string, number> = {};
    for (const cat of categories) {
      expScores[cat] = Math.exp(logScores[cat] - maxScore);
      sumExp += expScores[cat];
    }

    let bestCat = categories[0];
    let bestConf = 0;
    for (const cat of categories) {
      const prob = expScores[cat] / sumExp;
      if (prob > bestConf) { bestConf = prob; bestCat = cat; }
    }

    return { category: bestCat, confidence: bestConf };
  }
}
