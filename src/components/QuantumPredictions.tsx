// src/components/QuantumPredictions.tsx
import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, WandSparkles } from 'lucide-react';

interface Prediction {
  asset: string;
  signal: string;
  confidence: number;
  target: string;
  timeline: string;
  bullish: boolean | null;
}

interface QuantumPredictionsProps {
  predictions?: Prediction[];
}

const defaultPredictions: Prediction[] = [
  { asset: 'BTC',   signal: 'COMPRA FORTE', confidence: 94, target: 'R$ 380.000', timeline: '7 dias',  bullish: true  },
  { asset: 'ETH',   signal: 'COMPRA',       confidence: 87, target: 'R$ 22.500',  timeline: '14 dias', bullish: true  },
  { asset: 'PETR4', signal: 'NEUTRO',       confidence: 62, target: 'R$ 39.50',   timeline: '30 dias', bullish: null  },
  { asset: 'VALE3', signal: 'VENDA',        confidence: 78, target: 'R$ 56.00',   timeline: '10 dias', bullish: false },
];

export default function QuantumPredictions({ predictions = defaultPredictions }: QuantumPredictionsProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="glass-card-quantum p-6 relative overflow-hidden">
      <div className="absolute w-64 h-64 bg-purple-500/20 rounded-full blur-[80px] -top-20 -right-20 pointer-events-none" />
      <div className="absolute w-48 h-48 bg-emerald-500/10 rounded-full blur-[80px] bottom-0 left-0 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-quantum-purpleDim text-quantum-purple flex items-center justify-center animate-quantumPulse">
            <WandSparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Previsões Quantum AI</h3>
            <p className="text-xs text-quantum-fgMuted">Modelos preditivos baseados em computação quântica</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {predictions.map((p) => {
            const signalColor = p.bullish === true ? '#00E68A' : p.bullish === false ? '#FF4757' : '#FFB800';
            const signalBg    = p.bullish === true ? 'bg-quantum-accentDim' : p.bullish === false ? 'bg-quantum-redDim' : 'bg-quantum-goldDim';
            const Icon        = p.bullish === true ? TrendingUp : p.bullish === false ? TrendingDown : Minus;

            return (
              <div
                key={p.asset}
                className="bg-quantum-bgSecondary border border-quantum-border rounded-xl p-4 transition-all hover:border-quantum-accent/40 hover:shadow-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-bold text-white">{p.asset}</span>
                  <span className={`${signalBg} text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1`} style={{ color: signalColor }}>
                    <Icon className="w-3 h-3" /> {p.signal}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <p className="text-quantum-fgMuted text-xs">Confiança</p>
                    <p className="font-mono font-bold" style={{ color: signalColor }}>{p.confidence}%</p>
                  </div>
                  <div>
                    <p className="text-quantum-fgMuted text-xs">Alvo</p>
                    <p className="font-mono font-bold text-white">{p.target}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-quantum-fgMuted text-xs">Prazo</p>
                    <p className="text-white font-medium">{p.timeline}</p>
                  </div>
                </div>

                <div
                  className="w-full h-1.5 bg-quantum-bg rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={p.confidence}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{
                      width: animated ? `${p.confidence}%` : '0%',
                      background: `linear-gradient(90deg, ${signalColor}, #A855F7)`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
