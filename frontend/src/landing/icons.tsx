const PATHS: Record<string, React.ReactNode> = {
  mic: (<><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
  users: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.6c2.6.2 4.5 2 4.5 4.9" /></>),
  quote: (<><path d="M7 7h4v5c0 3-1.5 4.7-4 5M14 7h4v5c0 3-1.5 4.7-4 5" /></>),
  chart: (<><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>),
  clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  globe: (<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.4 3.6 5.2 3.6 8.5S14.5 18.1 12 20.5C9.5 18.1 8.4 15.3 8.4 12S9.5 5.9 12 3.5z" /></>),
  shield: (<><path d="M12 3l7 3v5.5c0 4.2-2.8 7.6-7 9.5-4.2-1.9-7-5.3-7-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>),
  sparkles: (<><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5 16l.6 1.4L7 18l-1.4.6L5 20l-.6-1.4L3 18l1.4-.6z" /></>),
  wand: (<><path d="M5 19L16 8M14.5 4.5l1-2 1 2 2 1-2 1-1 2-1-2-2-1zM19 11l.7-1.4.7 1.4 1.4.7-1.4.7-.7 1.4-.7-1.4-1.4-.7z" /></>),
  play: (<path d="M8 5.5v13l11-6.5z" />),
  arrow: (<path d="M5 12h14M13 6l6 6-6 6" />),
  check: (<path d="M5 12.5l4.5 4.5L19 7.5" />),
  plus: (<path d="M12 5v14M5 12h14" />),
  back: (<path d="M19 12H5M11 6l-6 6 6 6" />),
  trophy: (<><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></>),
}

export default function Icon({ name, size = 22, stroke = 1.7 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}
