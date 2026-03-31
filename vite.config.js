import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    host: true // Permite testar no telemóvel usando o IP da rede local
  },
  build: {
    outDir: 'dist',
    sourcemap: true, // Essencial para caçar bugs em produção
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separa bibliotecas pesadas em ficheiros de cache independentes
          vendor: ['react', 'react-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          ui: ['lucide-react', 'react-hot-toast', 'recharts']
        }
      }
    }
  },
  resolve: {
    alias: {
      // Permite importar ficheiros usando '@/' em vez de '../../../'
      '@': path.resolve(__dirname, './src'),
    },
  }
});