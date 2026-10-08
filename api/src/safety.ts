/**
 * Crude first pass: flags posts that may signal someone is struggling.
 * A flagged post is still published, but it is never auto-featured and the API
 * tells the front end to show supportive, locally relevant resources to the author.
 * REPLACE with a proper classifier plus a human review queue before launch.
 */
const PATTERNS = [
  /\bsuicid/i,
  /\b(kill|hurt|harm)\s+myself\b/i,
  /\bend\s+(it\s+all|my\s+life)\b/i,
  /\bdon'?t\s+want\s+to\s+(live|be\s+here)\b/i,
];

export function flagSensitive(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}
