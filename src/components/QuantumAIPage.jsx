import React from 'react';
import QuantumPredictions from './QuantumPredictions';

export default function QuantumAIPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative z-10">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Central Quantum AI</h1>
        <p className="text-sm text-quantum-fgMuted">O seu conselheiro financeiro alimentado por Inteligência Artificial.</p>
      </div>
      <QuantumPredictions />
    </div>
  );
}