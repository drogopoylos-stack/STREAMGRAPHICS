// The graphic type of a PNG file, from the name that the program gives it (render.js, Render all).
const PATTERNS = [
  ['social-schedule', /social[-_ ]?schedule/i],
  ['social-versus', /social[-_ ]?(versus|vs|poster|match)/i],
  ['social-roster', /social[-_ ]?(roster|lineup)/i],
  ['simple-vs', /simple[-_ ]?vs|logo[-_ ]?vs|^vs[-_]/i],
  ['roster', /roster/i],
  ['versus', /versus|lineups?|[-_]vs[-_]/i],
  ['schedule', /schedule/i],
  ['matchup', /matchup/i],
  ['bracket', /bracket/i],
  ['sponsors', /sponsor/i],
  ['format', /format|how[-_]it[-_]works/i],
  ['waiting', /waiting|starting[-_]?soon/i],
];

export function guessScene(name) {
  return PATTERNS.find(([, pattern]) => pattern.test(name))?.[0] ?? 'other';
}
