/**
 * Minimal HTML escape for use in email templates. User-typed strings
 * (name, message, etc.) MUST be passed through this before landing in
 * an HTML email body, otherwise a malicious lead can land arbitrary
 * markup (and links) in the staff inbox.
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: unknown): string {
  if (input == null) return '';
  return String(input).replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] || c);
}

/** Single-line, length-capped variant for headers / subject lines. */
export function escapeSubject(input: unknown, maxLen = 120): string {
  return escapeHtml(input).replace(/[\r\n]+/g, ' ').slice(0, maxLen);
}
