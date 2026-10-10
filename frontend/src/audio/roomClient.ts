export type Connection = 'connecting' | 'open' | 'reconnecting' | 'closed'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServerMsg = { type: string } & Record<string, any>

/** WebSocket to the room. Reconnects with backoff and resumes the same session. */
export class RoomClient {
  private ws: WebSocket | null = null
  private sessionId: string | null = null
  private closedByUs = false
  private attempt = 0
  private retryTimer = 0

  private startMsg: object
  private onMsg: (m: ServerMsg) => void
  private onStatus: (c: Connection) => void

  constructor(startMsg: object, onMsg: (m: ServerMsg) => void, onStatus: (c: Connection) => void) {
    this.startMsg = startMsg
    this.onMsg = onMsg
    this.onStatus = onStatus
  }

  connect() {
    // In production VITE_API_URL is the Render backend (e.g. https://codex-backend.onrender.com).
    // In dev, VITE_API_URL is empty so we use the same host (Vite proxies /ws → localhost:8000).
    const apiUrl = import.meta.env.VITE_API_URL as string | undefined
    let wsUrl: string
    if (apiUrl) {
      wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws'
    } else {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      wsUrl = `${proto}://${location.host}/ws`
    }
    this.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting')
    const ws = new WebSocket(wsUrl)
    this.ws = ws
    ws.onopen = () => {
      this.attempt = 0
      ws.send(JSON.stringify(this.sessionId ? { type: 'resume', session_id: this.sessionId } : this.startMsg))
      this.onStatus('open')
    }
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data) as ServerMsg
      if (m.type === 'snapshot') this.sessionId = m.session_id
      this.onMsg(m)
    }
    ws.onclose = () => {
      if (this.closedByUs) return this.onStatus('closed')
      this.onStatus('reconnecting')
      const delay = Math.min(8000, 500 * 2 ** this.attempt++)
      this.retryTimer = window.setTimeout(() => this.connect(), delay)
    }
    ws.onerror = () => ws.close()
  }

  send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  /** Test hook: behaves like a network drop, so the normal reconnect-and-resume path runs. */
  dropForTest() {
    this.ws?.close()
  }

  close() {
    this.closedByUs = true
    clearTimeout(this.retryTimer)
    this.ws?.close()
  }
}
