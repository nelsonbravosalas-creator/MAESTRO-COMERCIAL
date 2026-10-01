import { Pool } from 'pg'
import fs from 'fs'
import dotenv from 'dotenv'
import { logger } from '../utils/logger'
import { getMailer } from '../services/mailer'

dotenv.config()

const RECIPIENTS = ['nbravo.nbyb@gmail.com', 'hmeza.nbyb@gmail.com']

interface GlobalKpis {
  total_quoted_uf: number
  total_quoted_count: number
  total_won_uf: number
  total_won_count: number
  projects_count: number
  maintenance_count: number
}

interface WonQuotation {
  correlative: string
  client_name: string
  uf_value: number
  oc_number: string | null
  oc_date: string | null
}

interface AlertQuotation {
  correlative: string
  client_name: string
  uf_value: number
  status: string
  valid_until: string | null
  days_without_activity: number
}

interface TopClient {
  client_name: string
  total_uf: number
  quotes_count: number
}

interface ExecutivePerformance {
  user_name: string
  quotes_created: number
  activities_count: number
  calls: number
  meetings: number
  emails: number
  notes: number
}

export async function generateWeeklyCommercialSummary() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada en las variables de entorno.')
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const todayStr = new Date().toLocaleDateString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

    console.log('====================================================')
    console.log(`📊 GENERANDO REPORTE COMERCIAL (${todayStr})`)
    console.log('====================================================\n')

    // 1. KPIs Globales de los últimos 7 días
    const kpisRes = await pool.query<GlobalKpis>(`
      SELECT 
        COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN uf_value ELSE 0 END), 0)::numeric(14,2) AS total_quoted_uf,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END)::int AS total_quoted_count,
        COALESCE(SUM(CASE WHEN status = 'Adjudicada' AND updated_at >= NOW() - INTERVAL '7 days' THEN uf_value ELSE 0 END), 0)::numeric(14,2) AS total_won_uf,
        COUNT(CASE WHEN status = 'Adjudicada' AND updated_at >= NOW() - INTERVAL '7 days' THEN 1 END)::int AS total_won_count,
        COUNT(CASE WHEN kind = 'project' AND created_at >= NOW() - INTERVAL '7 days' THEN 1 END)::int AS projects_count,
        COUNT(CASE WHEN kind = 'maintenance' AND created_at >= NOW() - INTERVAL '7 days' THEN 1 END)::int AS maintenance_count
      FROM quotations
      WHERE deleted_at IS NULL;
    `)
    const kpis = kpisRes.rows[0]
    const conversionRate =
      kpis.total_quoted_count > 0
        ? ((kpis.total_won_count / kpis.total_quoted_count) * 100).toFixed(1)
        : '0.0'

    // 2. Cotizaciones Adjudicadas (Ventas cerradas con OC)
    const wonRes = await pool.query<WonQuotation>(`
      SELECT 
        q.correlative,
        c.name AS client_name,
        q.uf_value::numeric(14,2) AS uf_value,
        q.oc_number,
        TO_CHAR(q.oc_date, 'DD-MM-YYYY') AS oc_date
      FROM quotations q
      JOIN clients c ON c.id = q.client_id
      WHERE q.status = 'Adjudicada' 
        AND q.updated_at >= NOW() - INTERVAL '7 days'
        AND q.deleted_at IS NULL
      ORDER BY q.uf_value DESC;
    `)
    const wonQuotes = wonRes.rows

    // 3. Alertas de Riesgo / Seguimiento Urgente
    const alertsRes = await pool.query<AlertQuotation>(`
      SELECT 
        q.correlative,
        c.name AS client_name,
        q.uf_value::numeric(14,2) AS uf_value,
        q.status,
        TO_CHAR(q.valid_until, 'DD-MM-YYYY') AS valid_until,
        COALESCE(EXTRACT(DAY FROM (NOW() - MAX(qa.created_at)))::int, 99) AS days_without_activity
      FROM quotations q
      JOIN clients c ON c.id = q.client_id
      LEFT JOIN quotation_activities qa ON qa.quotation_id = q.id
      WHERE q.status IN ('Emitida', 'Enviada')
        AND q.deleted_at IS NULL
      GROUP BY q.id, q.correlative, c.name, q.uf_value, q.status, q.valid_until
      HAVING (MAX(qa.created_at) IS NULL OR MAX(qa.created_at) < NOW() - INTERVAL '7 days')
         OR (q.valid_until IS NOT NULL AND q.valid_until <= CURRENT_DATE + INTERVAL '5 days')
      ORDER BY q.uf_value DESC
      LIMIT 10;
    `)
    const alertQuotes = alertsRes.rows

    // 4. Top Clientes con mayor volumen cotizado
    const topClientsRes = await pool.query<TopClient>(`
      SELECT 
        c.name AS client_name,
        SUM(q.uf_value)::numeric(14,2) AS total_uf,
        COUNT(q.id)::int AS quotes_count
      FROM quotations q
      JOIN clients c ON c.id = q.client_id
      WHERE q.created_at >= NOW() - INTERVAL '7 days'
        AND q.deleted_at IS NULL
      GROUP BY c.id, c.name
      ORDER BY total_uf DESC
      LIMIT 5;
    `)
    const topClients = topClientsRes.rows

    // 5. Rendimiento por Ejecutivo Comercial
    const execRes = await pool.query<ExecutivePerformance>(`
      SELECT 
        u.name AS user_name,
        COUNT(DISTINCT q.id)::int AS quotes_created,
        COUNT(DISTINCT qa.id)::int AS activities_count,
        COUNT(DISTINCT CASE WHEN qa.activity_type = 'llamada' THEN qa.id END)::int AS calls,
        COUNT(DISTINCT CASE WHEN qa.activity_type = 'reunion' THEN qa.id END)::int AS meetings,
        COUNT(DISTINCT CASE WHEN qa.activity_type = 'correo' THEN qa.id END)::int AS emails,
        COUNT(DISTINCT CASE WHEN qa.activity_type = 'nota_interna' THEN qa.id END)::int AS notes
      FROM users u
      LEFT JOIN quotations q ON q.created_by = u.id AND q.created_at >= NOW() - INTERVAL '7 days' AND q.deleted_at IS NULL
      LEFT JOIN quotation_activities qa ON qa.created_by = u.id AND qa.created_at >= NOW() - INTERVAL '7 days'
      WHERE u.is_active = true
      GROUP BY u.id, u.name
      HAVING COUNT(DISTINCT q.id) > 0 OR COUNT(DISTINCT qa.id) > 0
      ORDER BY (COUNT(DISTINCT q.id) + COUNT(DISTINCT qa.id)) DESC;
    `)
    const execPerformance = execRes.rows

    // Generar formato HTML profesional para el correo
    const emailHtml = buildEmailHtml({
      todayStr,
      kpis,
      conversionRate,
      wonQuotes,
      alertQuotes,
      topClients,
      execPerformance,
    })

    // Generar formato Markdown para GitHub Actions Step Summary
    const markdownSummary = buildMarkdownSummary({
      todayStr,
      kpis,
      conversionRate,
      wonQuotes,
      alertQuotes,
      topClients,
      execPerformance,
    })

    console.log(markdownSummary)

    // Guardar en GitHub Actions Step Summary si está presente
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownSummary)
    }

    // Enviar correos a los destinatarios configurados
    const mailer = getMailer()
    for (const recipient of RECIPIENTS) {
      console.log(`📤 Enviando reporte por correo a ${recipient}...`)
      const res = await mailer.send({
        to: recipient,
        subject: `[BravoCRM] 📊 Resumen Comercial - ${todayStr}`,
        html: emailHtml,
      })
      if (res.ok) {
        console.log(`✅ Correo enviado exitosamente a ${recipient}`)
      } else {
        console.warn(`⚠️ No se pudo enviar el correo a ${recipient}: ${res.error}`)
      }
    }

    logger.info('Weekly commercial summary completed successfully')
  } catch (error) {
    logger.error('Error al generar resumen comercial', { error })
    console.error('❌ Error al generar el resumen comercial:', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

function buildEmailHtml(data: {
  todayStr: string
  kpis: GlobalKpis
  conversionRate: string
  wonQuotes: WonQuotation[]
  alertQuotes: AlertQuotation[]
  topClients: TopClient[]
  execPerformance: ExecutivePerformance[]
}) {
  const { todayStr, kpis, conversionRate, wonQuotes, alertQuotes, topClients, execPerformance } =
    data

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #1e293b; margin: 0; padding: 20px; }
    .container { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .header { background: #0f172a; color: #ffffff; padding: 24px 30px; text-align: left; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; color: #f8fafc; }
    .header p { margin: 4px 0 0 0; font-size: 13px; color: #94a3b8; }
    .content { padding: 24px 30px; }
    .section-title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 24px 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
    .kpi-card.highlight { background: #ecfdf5; border-color: #a7f3d0; }
    .kpi-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .kpi-value { font-size: 20px; font-weight: 800; color: #0f172a; }
    .kpi-card.highlight .kpi-value { color: #065f46; }
    .kpi-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
    th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 10px 12px; border-bottom: 1px solid #cbd5e1; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 3px 8px; font-size: 11px; font-weight: 600; border-radius: 4px; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .empty-msg { font-size: 13px; color: #64748b; font-style: italic; padding: 8px 0; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 30px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Resumen Comercial Ejecutivo</h1>
      <p>BravoCRM | Reporte de Actividad y Pipeline • ${todayStr}</p>
    </div>
    <div class="content">

      <!-- 1. KPIs -->
      <div class="section-title">🔹 1. Indicadores Clave de la Semana (Últimos 7 días)</div>
      <div class="kpi-grid">
        <div class="kpi-card highlight">
          <div class="kpi-label">Ventas Adjudicadas</div>
          <div class="kpi-value">${Number(kpis.total_won_uf).toLocaleString('es-CL')} UF</div>
          <div class="kpi-sub">${kpis.total_won_count} cotizaciones ganadas</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Cotizado</div>
          <div class="kpi-value">${Number(kpis.total_quoted_uf).toLocaleString('es-CL')} UF</div>
          <div class="kpi-sub">${kpis.total_quoted_count} cotizaciones (${kpis.projects_count} Proy / ${kpis.maintenance_count} Mant)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Tasa de Conversión</div>
          <div class="kpi-value">${conversionRate}%</div>
          <div class="kpi-sub">ganadas / cotizadas (7 días)</div>
        </div>
      </div>

      <!-- 2. Ventas Cerradas con OC -->
      <div class="section-title">🏆 2. Ventas Cerradas y Recepción de OCs</div>
      ${
        wonQuotes.length === 0
          ? '<div class="empty-msg">No se registraron cotizaciones adjudicadas en los últimos 7 días.</div>'
          : `
      <table>
        <thead>
          <tr>
            <th>Cotización</th>
            <th>Cliente</th>
            <th>Monto UF</th>
            <th>N° OC</th>
            <th>Fecha OC</th>
          </tr>
        </thead>
        <tbody>
          ${wonQuotes
            .map(
              q => `
            <tr>
              <td><strong>${q.correlative}</strong></td>
              <td>${q.client_name}</td>
              <td><strong>${Number(q.uf_value).toLocaleString('es-CL')} UF</strong></td>
              <td><span class="badge badge-success">${q.oc_number || 'S/N'}</span></td>
              <td>${q.oc_date || '-'}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
      `
      }

      <!-- 3. Alertas de Riesgo -->
      <div class="section-title">⚠️ 3. Alertas de Seguimiento Comercial Urgente</div>
      ${
        alertQuotes.length === 0
          ? '<div class="empty-msg">Excelente: no hay cotizaciones en riesgo o estancadas actualmente.</div>'
          : `
      <table>
        <thead>
          <tr>
            <th>Cotización</th>
            <th>Cliente</th>
            <th>Monto</th>
            <th>Estado</th>
            <th>Vence</th>
            <th>Días s/contacto</th>
          </tr>
        </thead>
        <tbody>
          ${alertQuotes
            .map(
              q => `
            <tr>
              <td><strong>${q.correlative}</strong></td>
              <td>${q.client_name}</td>
              <td>${Number(q.uf_value).toLocaleString('es-CL')} UF</td>
              <td><span class="badge badge-warning">${q.status}</span></td>
              <td>${q.valid_until || 'Indefinida'}</td>
              <td><span class="badge badge-danger">${q.days_without_activity >= 99 ? 'Sin act.' : `${q.days_without_activity} d`}</span></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
      `
      }

      <!-- 4. Top Clientes -->
      <div class="section-title">🏢 4. Top Clientes con Mayor Volumen Cotizado</div>
      ${
        topClients.length === 0
          ? '<div class="empty-msg">Sin nuevas cotizaciones en el período.</div>'
          : `
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Cotizaciones</th>
            <th>Total Cotizado</th>
          </tr>
        </thead>
        <tbody>
          ${topClients
            .map(
              c => `
            <tr>
              <td><strong>${c.client_name}</strong></td>
              <td>${c.quotes_count}</td>
              <td><strong>${Number(c.total_uf).toLocaleString('es-CL')} UF</strong></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
      `
      }

      <!-- 5. Rendimiento Ejecutivos -->
      <div class="section-title">👥 5. Rendimiento y Gestiones por Ejecutivo</div>
      ${
        execPerformance.length === 0
          ? '<div class="empty-msg">Sin actividades registradas por ejecutivos en los últimos 7 días.</div>'
          : `
      <table>
        <thead>
          <tr>
            <th>Ejecutivo</th>
            <th>Cotizaciones Creadas</th>
            <th>Reuniones</th>
            <th>Llamadas</th>
            <th>Correos</th>
          </tr>
        </thead>
        <tbody>
          ${execPerformance
            .map(
              e => `
            <tr>
              <td><strong>${e.user_name}</strong></td>
              <td>${e.quotes_created}</td>
              <td>${e.meetings}</td>
              <td>${e.calls}</td>
              <td>${e.emails}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
      `
      }

    </div>
    <div class="footer">
      Este reporte fue generado automáticamente por el Bot de BravoCRM mediante GitHub Actions.<br>
      Frecuencia: Lunes, Miércoles y Viernes a las 08:30 AM (Chile).
    </div>
  </div>
</body>
</html>
`
}

function buildMarkdownSummary(data: {
  todayStr: string
  kpis: GlobalKpis
  conversionRate: string
  wonQuotes: WonQuotation[]
  alertQuotes: AlertQuotation[]
  topClients: TopClient[]
  execPerformance: ExecutivePerformance[]
}) {
  const { todayStr, kpis, conversionRate, wonQuotes, alertQuotes, topClients, execPerformance } =
    data

  let md = `# 📊 Resumen Comercial Ejecutivo (${todayStr})\n\n`
  md += `### 🔹 1. Indicadores Clave de la Semana\n`
  md += `* **Total Cotizado:** ${Number(kpis.total_quoted_uf).toLocaleString('es-CL')} UF (${kpis.total_quoted_count} cotizaciones: ${kpis.projects_count} Proyectos / ${kpis.maintenance_count} Mantenciones)\n`
  md += `* **Total Adjudicado (Ganadas):** ${Number(kpis.total_won_uf).toLocaleString('es-CL')} UF (${kpis.total_won_count} cotizaciones)\n`
  md += `* **Tasa de Conversión:** ${conversionRate}%\n\n`

  md += `### 🏆 2. Ventas Cerradas con OC\n`
  if (wonQuotes.length === 0) {
    md += `*Sin cotizaciones adjudicadas en los últimos 7 días.*\n\n`
  } else {
    md += `| Cotización | Cliente | Monto UF | N° OC | Fecha OC |\n| :--- | :--- | :---: | :---: | :---: |\n`
    wonQuotes.forEach(q => {
      md += `| **${q.correlative}** | ${q.client_name} | **${Number(q.uf_value).toLocaleString('es-CL')} UF** | \`${q.oc_number || 'S/N'}\` | ${q.oc_date || '-'} |\n`
    })
    md += `\n`
  }

  md += `### ⚠️ 3. Alertas de Seguimiento Urgente (Riesgo)\n`
  if (alertQuotes.length === 0) {
    md += `*No hay cotizaciones estancadas o por vencer.*\n\n`
  } else {
    md += `| Cotización | Cliente | Monto UF | Estado | Vence | Días s/contacto |\n| :--- | :--- | :---: | :---: | :---: |\n`
    alertQuotes.forEach(q => {
      md += `| **${q.correlative}** | ${q.client_name} | ${Number(q.uf_value).toLocaleString('es-CL')} UF | \`${q.status}\` | ${q.valid_until || 'Indefinida'} | ${q.days_without_activity >= 99 ? 'Sin act.' : `${q.days_without_activity} d`} |\n`
    })
    md += `\n`
  }

  md += `### 🏢 4. Top Clientes Cotizados\n`
  if (topClients.length === 0) {
    md += `*Sin cotizaciones creadas en el período.*\n\n`
  } else {
    md += `| Cliente | Cotizaciones | Total Cotizado (UF) |\n| :--- | :---: | :---: |\n`
    topClients.forEach(c => {
      md += `| **${c.client_name}** | ${c.quotes_count} | **${Number(c.total_uf).toLocaleString('es-CL')} UF** |\n`
    })
    md += `\n`
  }

  md += `### 👥 5. Rendimiento por Ejecutivo\n`
  if (execPerformance.length === 0) {
    md += `*Sin actividades registradas en el período.*\n\n`
  } else {
    md += `| Ejecutivo | Cotizaciones Creadas | Reuniones | Llamadas | Correos |\n| :--- | :---: | :---: | :---: | :---: |\n`
    execPerformance.forEach(e => {
      md += `| **${e.user_name}** | ${e.quotes_created} | ${e.meetings} | ${e.calls} | ${e.emails} |\n`
    })
    md += `\n`
  }

  return md
}

if (require.main === module) {
  generateWeeklyCommercialSummary()
}
