// Branded HTML shell shared by every outbound email — notification alerts and
// campaign messages alike. Extracted from notification.service.ts in stage 0 so
// the two cannot drift apart.

// Company details shown in the footer (helps deliverability + trust).
export const BRAND = {
  name: 'Kratos Sustainability',
  website: 'https://www.kratos-energy.com',
  websiteLabel: 'kratos-energy.com',
  phone: '1300 089 547',
  phoneHref: '1300089547',
  green: '#6abf2e',
  teal: '#175c4c',
};

export interface ShellCta {
  text: string;
  url: string | null;
}

export interface ShellOptions {
  /** Footer line explaining why this email arrived. Internal alerts and
   *  customer mail need different wording, and customer mail also needs an
   *  unsubscribe link (added in stage 2). */
  footerNote?: string;
  /** Appended under the footer note as raw HTML, e.g. an unsubscribe link. */
  footerHtml?: string;
}

const INTERNAL_NOTE = `You're receiving this because you're a user of the ${BRAND.name} CRM. This is an internal notification.`;

/**
 * Email-client-safe HTML: branded header, content paragraphs, optional CTA,
 * and a footer with real contact details and a "why you got this" line.
 *
 * `lines` are raw HTML fragments — callers are responsible for escaping any
 * user-supplied text they interpolate.
 */
export function emailShell(
  title: string,
  lines: string[],
  cta?: ShellCta,
  options: ShellOptions = {},
): string {
  const body = lines
    .map((l) => `<p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.6">${l}</p>`)
    .join('');
  const button = cta?.url
    ? `<div style="margin-top:20px"><a href="${cta.url}" style="display:inline-block;background:${BRAND.teal};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">${cta.text}</a></div>`
    : '';
  const note = options.footerNote ?? INTERNAL_NOTE;
  const extra = options.footerHtml ? `<p style="margin:8px 0 0;color:#94a3b8;font-size:11px">${options.footerHtml}</p>` : '';

  return `<div style="background:#f1f5f9;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
      <div style="background:${BRAND.teal};padding:16px 24px">
        <span style="color:#ffffff;font-size:16px;font-weight:700">Kratos</span><span style="color:${BRAND.green};font-size:16px;font-weight:700"> Sustainability</span>
      </div>
      <div style="padding:24px">
        <h1 style="margin:0 0 16px;color:#0f172a;font-size:18px">${title}</h1>
        ${body}
        ${button}
      </div>
      <div style="border-top:1px solid #e2e8f0;padding:16px 24px;background:#f8fafc">
        <p style="margin:0 0 4px;color:#64748b;font-size:12px">
          <a href="${BRAND.website}" style="color:${BRAND.teal};text-decoration:none;font-weight:600">${BRAND.websiteLabel}</a>
          &nbsp;·&nbsp; <a href="tel:${BRAND.phoneHref}" style="color:#64748b;text-decoration:none">${BRAND.phone}</a>
        </p>
        <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.5">${note}</p>
        ${extra}
      </div>
    </div>
  </div>`;
}

/** Escape text that came from a lead, template merge field or form answer
 *  before putting it inside the shell. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
