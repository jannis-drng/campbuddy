import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Inter liegt jetzt bei uns, nicht bei Google. Der Unterschied ist nicht nur
// Datenschutz: das Stylesheet von fonts.googleapis.com blockierte das Rendern
// und kostete zwei zusätzliche Verbindungen zu einem fremden Host, bevor das
// erste Zeichen auf dem Schirm war. Die unicode-range-Regeln sorgen dafür,
// dass der Browser nur die lateinische Schnittmenge holt.
import '@fontsource-variable/inter/opsz.css'
import './index.css'
import Root from './Root.tsx'
import { serviceWorkerAnmelden } from './services/sw'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

serviceWorkerAnmelden()
