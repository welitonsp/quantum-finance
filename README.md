# 🌌 Quantum Finance

Um sistema de gestão financeira pessoal de alta precisão, orientado a dados, com uso de Inteligência Artificial (Google Gemini), projetado para entregar análises de nível institucional (Pareto, Burn Rate, Evolução Patrimonial).

## 🚀 Stack Tecnológica
- **Frontend:** React 19 + Vite 7 + Tailwind CSS 3 (Glassmorphism)
- **Backend/BaaS:** Firebase (Auth, Firestore, Cloud Functions)
- **Inteligência Artificial:** Google Gemini API (gemini-1.5-flash)
- **Precisão Financeira:** `decimal.js` (Cálculo em centavos)
- **Gráficos:** Recharts & Chart.js
- **Validação:** Zod

## 🛡️ Arquitetura e Segurança (Regras de Ouro)
1. **Precisão Bancária:** Todos os valores no banco de dados são armazenados como inteiros (centavos) para evitar erros de ponto flutuante. Use `toCentavos` e `fromCentavos` (`src/shared/schemas/financialSchemas.js`).
2. **Isolamento de Dados:** Toda a informação sensível reside obrigatoriamente sob o path `users/{uid}/...`. **É estritamente proibido** salvar dados financeiros na raiz do Firestore.
3. **Segurança do Cliente (Zero-Knowledge):** O parser de extratos (OFX, PDF com senha, CSV) ocorre 100% na memória do navegador do utilizador. O ficheiro nunca é enviado para a nuvem.

## ⚙️ Configuração do Ambiente

### 1. Clonar e Instalar
\`\`\`bash
git clone https://github.com/seu-usuario/quantum-finance.git
cd quantum-finance
npm install
\`\`\`

### 2. Variáveis de Ambiente
Crie um ficheiro `.env.local` na raiz do projeto copiando a estrutura do `.env.example`:
\`\`\`env
VITE_FIREBASE_API_KEY="sua_api_key"
VITE_FIREBASE_AUTH_DOMAIN="seu_projeto.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="seu_projeto"
VITE_FIREBASE_STORAGE_BUCKET="seu_projeto.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123456789:web:abcdef"
VITE_GEMINI_API_KEY="sua_chave_gemini_aqui"
\`\`\`

### 3. Executar o Servidor de Desenvolvimento
\`\`\`bash
npm run dev
\`\`\`

## 📦 Estrutura de Pastas (FSD - Feature-Sliced Design)
- `/src/components` - Componentes UI globais e de layout (Dashboard, Header, Sidebar).
- `/src/contexts` - Contextos globais (Theme, Privacy, Navigation).
- `/src/features` - Módulos de negócio isolados (ai-chat, reports, transactions).
- `/src/hooks` - Hooks de ligação ao Firestore (`useTransactions`, `useAccounts`).
- `/src/shared` - Schemas Zod, APIs do Firebase, parsers de ficheiros e serviços globais.
- `/src/utils` - Formatadores e motores matemáticos independentes de UI.

---
*Desenvolvido com rigor militar e arquitetura de elite.*