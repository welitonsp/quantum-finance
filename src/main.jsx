import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // Importação essencial para carregar o Tailwind
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)