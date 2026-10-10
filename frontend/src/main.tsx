import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode is intentionally off: its double-mount collides with drei <Html> roots in the 3D scene.
createRoot(document.getElementById('root')!).render(<App />)
