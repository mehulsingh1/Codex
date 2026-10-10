export interface Persona {
  id: string
  name: string
  role: string
  color: string
  style: string
}

export interface RoomConfig {
  topic: string
  panel: number // number of AI participants besides the moderator (3 to 5)
  format: 'standard' | 'fishbowl'
  lang: 'en' | 'hi'
}

export interface TranscriptLine {
  id: number
  speaker: string
  text: string
  t: number // seconds since session start
  tEnd?: number | null
  interrupted?: boolean
}

/** Everything the room UI needs. The simulator and the real WebSocket client both produce this shape. */
export interface RoomState {
  speaker: string | null // persona id, 'student', or null
  thinking: string | null
  interrupts: number // increments each time the student barges in
  caption: { speaker: string; text: string } | null
  transcript: TranscriptLine[]
  remaining: number // seconds
}

export type MicStatus = 'starting' | 'on' | 'denied' | 'unavailable'

/** What the dock needs besides the room state. The simulator returns inert versions of these. */
export interface RoomControls {
  micOn: boolean
  setMicOn: (on: boolean) => void
  micStatus: MicStatus
  sendText: (text: string) => void
  setPatience: (ms: number) => void
  end: () => void
  connection: 'connecting' | 'open' | 'reconnecting' | 'closed'
  toast: string | null
  observing: boolean // fishbowl: the student is watching and cannot speak yet
}
