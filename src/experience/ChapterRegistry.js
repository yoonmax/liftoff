// The seven narrative stages. Ranges are fractions of the single global progress value.
export const CHAPTERS = [
  { id: 'prelaunch', n: '01', name: 'prelaunch', start: 0.0, end: 0.1, still: 0.0, summary: 'a white rocket stands on a wet launchpad before dawn, floodlit, breathing vapor.' },
  { id: 'ignition', n: '02', name: 'ignition', start: 0.1, end: 0.2, still: 0.186, summary: 'the lights dim, the engines light, and fire and smoke flood the pad.' },
  { id: 'ascent', n: '03', name: 'ascent', start: 0.2, end: 0.37, still: 0.346, summary: 'the rocket climbs through cloud; the sky darkens and the sun rises over the curve of the Earth.' },
  { id: 'orbit', n: '04', name: 'orbit', start: 0.37, end: 0.5, still: 0.47, summary: 'the first stage falls away, the fairing opens, a gold probe spreads its wings above a vast blue planet.' },
  { id: 'lunar', n: '05', name: 'lunar passage', start: 0.5, end: 0.63, still: 0.595, summary: 'a low pass over cratered ground at the terminator, as a small Earth rises over the horizon.' },
  { id: 'beyond', n: '06', name: 'beyond', start: 0.63, end: 0.85, still: 0.72, summary: 'an asteroid field, the rings of a giant planet seen from inside their plane, and a nebula lit from within.' },
  { id: 'arrival', n: '07', name: 'arrival', start: 0.85, end: 1.0, still: 0.915, summary: 'vast rings of dark monoliths unfold above a world of molten lines, around an opening that turns to white.' },
];

/** Scroll position a chapter link lands on: slightly inside the chapter, so its shot has settled. */
export const chapterEntry = (c) => (c.start === 0 ? 0 : c.start + (c.end - c.start) * 0.06);

export function chapterAt(p) {
  for (const c of CHAPTERS) if (p < c.end) return c;
  return CHAPTERS[CHAPTERS.length - 1];
}
export const chapterById = (id) => CHAPTERS.find((c) => c.id === id);
