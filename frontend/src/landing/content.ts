// All landing-page copy lives here so the page and the SEO data (FAQ structured data) stay in sync.
// Only factual claims about what the product does: no invented user counts or testimonials.

export const STEPS = [
  { icon: 'sparkles', title: 'Pick a topic', body: 'Choose a suggested topic, type your own, or let the magic wand surprise you. Set the panel size, format and language.' },
  { icon: 'mic', title: 'Speak in a live GD', body: 'A moderator opens the round. Talk naturally: the AI panel waits for your pause, answers you and each other, and stops the moment you jump in.' },
  { icon: 'chart', title: 'Get a report with proof', body: 'See who spoke how much and a score for six skills. Every point links to the exact words you said, with a timestamp.' },
]

export const FEATURES = [
  { icon: 'mic', title: 'Voice-first, like the real round', body: 'Speak out loud and watch live captions. Interrupt an AI mid-sentence and it stops, just like in a real group discussion.' },
  { icon: 'users', title: 'Five distinct personalities', body: 'A dominator, a data-driven analyst, a quiet sharp thinker, an off-topic drifter and a diplomat. Each has their own voice and style.' },
  { icon: 'quote', title: 'Feedback tied to your words', body: 'No vague advice. Each point quotes you verbatim, and a click jumps to that exact line in the transcript. Made-up quotes are caught and dropped.' },
  { icon: 'clock', title: 'Real structure and timing', body: 'Moderator opening, a countdown timer, and a one-minute closing round where everyone gives a final statement.' },
  { icon: 'globe', title: 'English and Hinglish', body: 'Practise in clear English or in the mixed Hindi-English way you actually talk, with matching voices.' },
  { icon: 'shield', title: 'Clearly all AI', body: 'Every other participant is an AI and is labelled that way everywhere. Practise freely without pressure.' },
]

export const PERSONAS = [
  { name: 'Arjun', role: 'The Dominator', color: '#C4553A', body: 'Loud and certain. Cuts in and pushes one view. Practise holding your ground.' },
  { name: 'Meera', role: 'The Data-driven', color: '#6A9A2F', body: 'Backs everything with numbers and examples. Practise being specific.' },
  { name: 'Kavya', role: 'Quiet but sharp', color: '#3B66C0', body: 'Speaks rarely and lands one insight that reframes the room.' },
  { name: 'Rohan', role: 'The Drifter', color: '#D08A1F', body: 'Friendly tangents and odd analogies. Practise steering back to the point.' },
  { name: 'Sana', role: 'The Diplomat', color: '#9150B8', body: 'Bridges views and invites others in. Practise building on ideas.' },
]

export const FAQ = [
  { q: 'What is a group discussion (GD) round?', a: 'A group discussion is a placement or admissions round where several candidates discuss a topic while evaluators watch how they communicate, think, listen and lead. GD Arena lets you practise that round on your own, any time.' },
  { q: 'How does GD Arena work?', a: 'You choose a topic, then join a live spoken discussion with a moderator and three to five AI participants. After the round you get a report with your speaking share, scores for six skills, and feedback that quotes your own words.' },
  { q: 'Is GD Arena free?', a: 'Yes. It runs on free services and needs no sign-up.' },
  { q: 'Are the other participants real people?', a: 'No. Every other participant is an AI, and each one is labelled "AI" on the setup screen, in the room and in the report.' },
  { q: 'Do I need a microphone?', a: 'A microphone is best because the round is spoken. If your microphone is blocked or missing, you can type your answers instead and everything else works the same.' },
  { q: 'Which languages and browsers are supported?', a: 'English and Hinglish. Google Chrome on a laptop or desktop gives the best experience, including live captions. Use headphones so the AI voices do not leak into your microphone.' },
  { q: 'How is the feedback generated?', a: 'An AI model reads your transcript and scores six areas: opening the discussion, quality of ideas, building on others, listening, handling interruptions and ending strongly. Every point must include a verbatim quote from the transcript, and quotes that cannot be found in what you said are discarded.' },
  { q: 'What happens to my voice and data?', a: 'Your speech is converted to text by your browser and, when needed, by the Whisper speech service. Recordings are not saved. Your past session summaries are stored only in your own browser and you can clear them any time.' },
]

export const NAV = [
  { id: 'how', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'panel', label: 'The panel' },
  { id: 'faq', label: 'FAQ' },
]
