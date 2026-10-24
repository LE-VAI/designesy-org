// Monitor alert email: the switch and the escaping.
//
// /api/monitor can mail a drift alert to the address a request names. The
// address comes from the request, and nothing confirms that its owner asked
// for the mail, so the server sends none unless MONITOR_EMAIL_ENABLED is
// exactly "true" (RESEND_API_KEY is needed as well). Off is the default: a
// deploy that never sets the variable sends no alert mail, and /monitor shows
// no email field.

export function monitorEmailOn(): boolean {
  return process.env.MONITOR_EMAIL_ENABLED === 'true';
}

// Text for an element body or a quoted attribute in the alert email. Every
// value the HTML body interpolates passes through here, numbers included: the
// history snapshots come from the request body, so a "score" can be any JSON.
// The subject is plain text: the scanned host, the grade and the score.
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
