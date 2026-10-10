// In production VITE_API_URL is the Render backend (e.g. https://your-service.onrender.com), set at build time.
// In dev it is empty: requests go to /api and /ws on the same host and Vite proxies them to localhost:8000.
const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '')

/** URL for an HTTP endpoint on the backend, e.g. apiUrl('/tts'). */
export function apiUrl(path: string): string {
  return API_BASE ? API_BASE + path : '/api' + path
}

/** URL for the room WebSocket. */
export function wsUrl(): string {
  if (API_BASE) return API_BASE.replace(/^http/, 'ws') + '/ws'
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}
