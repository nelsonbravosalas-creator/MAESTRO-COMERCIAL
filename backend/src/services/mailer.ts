import nodemailer, { Transporter } from 'nodemailer'
import { logger } from '../utils/logger'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text?: string
}

export interface SendEmailResult {
  ok: boolean
  providerId?: string
  error?: string
}

export interface Mailer {
  send(input: SendEmailInput): Promise<SendEmailResult>
}

// A-03: implementación real. Requiere RESEND_API_KEY (o cambiar de proveedor)
// y el dominio verificado con SPF/DKIM/DMARC — ver docs/EMAIL_SETUP.md.
// Un fallo de envío NUNCA debe tumbar el request que lo originó (AC-3.6):
// por eso send() atrapa sus propios errores y devuelve { ok: false }.
class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string
  ) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        logger.error('Mailer: proveedor respondió error', { status: res.status, body })
        return { ok: false, error: `provider_${res.status}` }
      }
      const data = (await res.json()) as { id?: string }
      return { ok: true, providerId: data?.id }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Mailer: fallo de red al enviar', { error: message })
      return { ok: false, error: message }
    }
  }
}

// Alternativa a Resend para cuando no hay un dominio propio verificado:
// manda por el SMTP de una cuenta de Gmail ya existente (con contraseña de
// aplicación, nunca la contraseña real de la cuenta). Sin dominio propio,
// Resend solo puede entregar a la casilla dueña del API key — inútil para
// un flujo de reset que le llega a cualquier usuario.
class SmtpMailer implements Mailer {
  private transporter: Transporter

  constructor(
    host: string,
    port: number,
    secure: boolean,
    user: string,
    password: string,
    private from: string
  ) {
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
    })
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      })
      return { ok: true, providerId: info.messageId }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Mailer: fallo SMTP al enviar', { error: message })
      return { ok: false, error: message }
    }
  }
}

// A-03, AC-3.5: implementación falsa — no envía nada de verdad. Se usa en
// desarrollo/tests o cuando no hay proveedor de correo configurado, para que
// el resto del flujo (forgot-password, notificaciones) siga siendo probable
// sin depender de una cuenta de Resend real.
class NoopMailer implements Mailer {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    logger.warn('Mailer: NoopMailer activo (sin proveedor configurado) — correo NO enviado', {
      to: input.to,
      subject: input.subject,
    })
    return { ok: true, providerId: 'noop' }
  }
}

let mailer: Mailer | null = null

export function getMailer(): Mailer {
  if (mailer) return mailer

  const smtpUser = process.env.SMTP_USER
  const smtpPassword = process.env.SMTP_PASSWORD
  if (smtpUser && smtpPassword) {
    const port = Number(process.env.SMTP_PORT || 465)
    mailer = new SmtpMailer(
      process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      smtpUser,
      smtpPassword,
      process.env.MAIL_FROM || smtpUser
    )
    return mailer
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  mailer = apiKey && from ? new ResendMailer(apiKey, from) : new NoopMailer()
  return mailer
}

// Para tests: reemplazar por un mailer de prueba y luego restaurar.
export function setMailer(m: Mailer) {
  mailer = m
}
