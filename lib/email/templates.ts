interface ActionEmailArgs {
    title: string
    greeting?: string
    bodyHtml: string
    ctaLabel: string
    ctaUrl: string
    footerNote?: string
}

const FONT_STACK =
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export function renderActionEmail(args: ActionEmailArgs): string {
    const { title, greeting, bodyHtml, ctaLabel, ctaUrl, footerNote } = args

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0b1218;font-family:${FONT_STACK};color:#e2e8f0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b1218;padding:40px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden">
          <tr>
            <td style="padding:32px 32px 0">
              <div style="display:inline-flex;align-items:center;gap:8px">
                <span style="display:inline-block;width:10px;height:10px;background:#13b6ec;border-radius:50%;box-shadow:0 0 12px #13b6ec"></span>
                <span style="font-size:13px;font-weight:700;letter-spacing:.12em;color:#13b6ec;text-transform:uppercase">
                  Ordem na Mesa
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px">
              <h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:700;color:#f8fafc;letter-spacing:-0.01em">
                ${title}
              </h1>
            </td>
          </tr>
          ${greeting ? `<tr><td style="padding:0 32px"><p style="margin:0;font-size:15px;color:#cbd5e1">${greeting}</p></td></tr>` : ''}
          <tr>
            <td style="padding:16px 32px 0">
              <div style="font-size:15px;line-height:1.6;color:#cbd5e1">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td align="left" style="padding:28px 32px 8px">
              <a href="${ctaUrl}"
                 style="display:inline-block;background:#13b6ec;color:#ffffff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.01em">
                ${ctaLabel}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0">
              <p style="margin:0 0 6px;font-size:12px;color:#64748b">
                Se o botão não funcionar, copie e cole este link no navegador:
              </p>
              <p style="margin:0;font-size:12px;word-break:break-all">
                <a href="${ctaUrl}" style="color:#13b6ec;text-decoration:underline">${ctaUrl}</a>
              </p>
            </td>
          </tr>
          ${footerNote ? `<tr><td style="padding:24px 32px 0"><p style="margin:0;font-size:12px;color:#64748b;line-height:1.5">${footerNote}</p></td></tr>` : ''}
          <tr>
            <td style="padding:28px 32px 28px">
              <div style="height:1px;background:#1e293b;margin-bottom:16px"></div>
              <p style="margin:0;font-size:12px;color:#64748b">
                Equipe <strong style="color:#cbd5e1">Ordem na Mesa</strong>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#475569">
          © Ordem na Mesa · <a href="https://ordemnamesa.com.br" style="color:#475569;text-decoration:none">ordemnamesa.com.br</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}
