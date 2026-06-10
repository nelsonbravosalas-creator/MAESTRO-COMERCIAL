import { calcCat, calcTotals, fmtCLP } from '../stores/maestro-store'
import type { MasterClient, MasterQuotation } from '../types'

const fmtDateLong = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function downloadHtml(params: {
  q:               MasterQuotation
  client:          MasterClient | undefined
  sessionUserName: string
}): void {
  const { q, client, sessionUserName } = params
  const totals = calcTotals(q)
  const iva    = totals.venta * (q.iva / 100)
  const conIva = totals.venta + iva
  const enUF   = q.uf > 0 ? totals.venta / q.uf : 0

  const valRows = q.categories.map((cat, i) => {
    const r = calcCat(cat.id, q.categories, q.items)
    if (r.venta === 0) return ''
    return `        <tr>
          <td class="cn">${i + 1}</td>
          <td>${esc(cat.label)}</td>
          <td class="cm">${fmtCLP.format(r.venta)}</td>
        </tr>`
  }).join('\n')

  const listRows = (items: string[]) =>
    items.map((item, i) => `      <li><span class="n">${i + 1}.</span>${esc(item)}</li>`).join('\n')

  const css = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111;background:#c8cdd6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{width:216mm;min-height:279mm;margin:24px auto;background:#fff;padding:22mm 20mm 18mm;box-shadow:0 4px 24px rgba(0,0,0,.18)}
    /* letterhead */
    .lh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
    .lh-l .co{font-size:16pt;font-weight:900;color:#0f172a;letter-spacing:-.5px}
    .lh-l .cs{font-size:8.5pt;color:#64748b;margin-top:3px}
    .lh-r{text-align:right}
    .lh-r .dt{font-size:10pt;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:.05em}
    .lh-r .dn{font-family:'Courier New',monospace;font-size:14pt;font-weight:900;color:#2563eb;margin-top:2px}
    .lh-r .dd{font-size:9pt;color:#64748b;margin-top:3px}
    .rule{border:none;border-top:3px solid #1e3a8a;margin:12px 0 20px}
    /* client */
    .sg{margin-bottom:22px}
    .gt{font-size:7.5pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#1e3a8a;border-left:3px solid #1e3a8a;padding-left:9px;margin-bottom:8px}
    .ct{width:100%;border-collapse:collapse}
    .ct th{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;background:#f1f5f9;padding:5px 8px;width:110px;text-align:left;border-bottom:1px solid #e2e8f0;white-space:nowrap}
    .ct td{font-size:10pt;color:#111;padding:5px 10px;border-bottom:1px solid #e2e8f0}
    .ct .re th,.ct .re td{border-top:1px dashed #cbd5e1;border-bottom:none;font-style:italic;color:#475569}
    /* sections */
    .sec{margin-bottom:22px;break-inside:avoid-page;page-break-inside:avoid}
    .st{font-size:7.5pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#1e3a8a;border-left:3px solid #1e3a8a;padding-left:9px;margin-bottom:12px}
    /* lists */
    ol.dl{list-style:none;padding:0;margin:0}
    ol.dl li{display:flex;gap:7px;align-items:flex-start;margin-bottom:6px;font-size:10pt;color:#1e293b;line-height:1.55;break-inside:avoid;page-break-inside:avoid}
    ol.dl li .n{flex-shrink:0;width:20px;text-align:right;font-weight:700;color:#1e3a8a;font-size:9pt;padding-top:1px}
    /* valuation */
    .vt{width:100%;border-collapse:collapse}
    .vt thead th{background:#0f172a;color:#94a3b8;padding:8px 12px;font-size:8pt;text-transform:uppercase;letter-spacing:.07em;font-weight:600;text-align:left}
    .vt .cm,.vt .cn{text-align:right}.vt .cn{text-align:center;color:#94a3b8;width:40px}
    .vt tbody td{padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:10pt;color:#334155}
    .vt .cm{font-family:'Courier New',monospace;white-space:nowrap}
    .sub td{background:#f8fafc;font-weight:600;border-top:2px solid #e2e8f0!important}
    .sub .cm{color:#1e3a8a}
    .riv td{color:#64748b;font-size:9.5pt;background:#f8fafc}
    .tot td{background:#0f172a;color:#f8fafc;font-weight:700;font-size:12pt;padding:10px 12px;border:none}
    .ruf td{background:#1e293b;color:#64748b;font-size:9pt;padding:5px 12px}
    /* footer */
    .ft{margin-top:30px;padding-top:14px;border-top:2px solid #e2e8f0;display:flex;justify-content:space-between;align-items:flex-end}
    .ft-t p{font-size:8pt;color:#94a3b8;margin-bottom:3px}
    .ft-s{text-align:center;width:160px}
    .ft-sl{border-top:1px solid #cbd5e1;margin-bottom:5px}
    .ft-s p{font-size:8pt;color:#94a3b8;line-height:1.5}
    /* print */
    @media print{
      @page{size:letter portrait;margin:20mm 18mm}
      body{background:#fff}
      .page{width:100%;margin:0;padding:0;box-shadow:none;min-height:auto}
      .sec,ol.dl li,.vt tr{break-inside:avoid;page-break-inside:avoid}
    }
  `

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Cotización ${esc(q.correlative)}</title>
<style>${css}</style>
</head>
<body>
<div class="page">

  <div class="lh">
    <div class="lh-l">
      <div class="co">N&beta;yB</div>
      <div class="cs"><strong>Ingeniería y Servicios Bravo SPA</strong></div>
      <div class="cs">RUT: 77.175.319-1 &nbsp;·&nbsp; Tel. +56 (9) 90943080</div>
    </div>
    <div class="lh-r">
      <div class="dt">Cotización de Servicios</div>
      <div class="dn">${esc(q.correlative)}</div>
      <div class="dd">Fecha: ${fmtDateLong(q.date)}</div>
    </div>
  </div>
  <hr class="rule">

  <div class="sg">
    <div class="gt">Datos del Cliente</div>
    <table class="ct">
      <tbody>
        <tr><th>Empresa</th><td>${esc(q.client_name || '—')}</td><th>RUT</th><td>${esc(client?.rut || '—')}</td></tr>
        <tr><th>Contacto</th><td>${esc(q.contact || '—')}</td><th>Cargo</th><td>${esc(client?.cargo || '—')}</td></tr>
        <tr><th>Referencia</th><td colspan="3">${esc(q.ref || '—')}</td></tr>
        ${q.enduser ? `<tr><th>Usuario Final</th><td colspan="3">${esc(q.enduser)}</td></tr>` : ''}
        <tr class="re"><th>Elaborado por</th><td colspan="3">${esc(sessionUserName)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="sec">
    <div class="st">I. Alcance de los Trabajos</div>
    <ol class="dl">
${listRows(q.scope)}
    </ol>
  </div>

  <div class="sec">
    <div class="st">II. Valorización de Trabajos</div>
    <table class="vt">
      <thead><tr><th class="cn">N°</th><th>Descripción</th><th class="cm">Valor Neto CLP</th></tr></thead>
      <tbody>
${valRows}
        <tr class="sub"><td colspan="2" style="text-align:right">Subtotal Neto</td><td class="cm">${fmtCLP.format(totals.venta)}</td></tr>
        <tr class="riv"><td colspan="2" style="text-align:right">IVA (${q.iva}%)</td><td class="cm">${fmtCLP.format(iva)}</td></tr>
        <tr class="tot"><td colspan="2" style="text-align:right">TOTAL CON IVA</td><td class="cm">${fmtCLP.format(conIva)}</td></tr>
        ${q.uf > 0 ? `<tr class="ruf"><td colspan="2" style="text-align:right">Equivalente en UF (ref. ${fmtCLP.format(q.uf)}/UF)</td><td class="cm">${enUF.toFixed(2)} UF</td></tr>` : ''}
      </tbody>
    </table>
  </div>

  <div class="sec">
    <div class="st">III. Exclusiones</div>
    <ol class="dl">
${listRows(q.exclusions)}
    </ol>
  </div>

  <div class="sec">
    <div class="st">IV. Condiciones Comerciales</div>
    <ol class="dl">
${listRows(q.commercial)}
    </ol>
  </div>

  <div class="ft">
    <div class="ft-t">
      <p>Esta cotización es válida según las condiciones indicadas en el punto IV.</p>
      <p>Documento: ${esc(q.correlative)} &nbsp;·&nbsp; Ingeniería y Servicios Bravo SPA</p>
    </div>
    <div class="ft-s">
      <div class="ft-sl"></div>
      <p>Firma y Timbre</p>
      <p>Representante Autorizado</p>
    </div>
  </div>

</div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `Cotizacion-${q.correlative}-${q.date}.html`
  a.click()
  URL.revokeObjectURL(url)
}
