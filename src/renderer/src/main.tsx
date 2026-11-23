import { createRoot } from 'react-dom/client'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import './estilos.css'
import { App } from './App'
import { aplicarTema, lerTema } from './tema'
import { instalarRodaSliders } from './rodaSliders'

// Antes da primeira renderização, para não piscar o tema claro
aplicarTema(lerTema())
instalarRodaSliders()

createRoot(document.getElementById('raiz') as HTMLElement).render(<App />)
