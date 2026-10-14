import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Follow the OS / Zoom client theme for shadcn's `.dark` variant.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () =>
  document.documentElement.classList.toggle('dark', darkQuery.matches)
applyTheme()
darkQuery.addEventListener('change', applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
