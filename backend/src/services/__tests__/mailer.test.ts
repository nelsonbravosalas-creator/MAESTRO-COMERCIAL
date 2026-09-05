import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const sendMailMock = vi.fn()
const createTransportMock = vi.fn((_opts: unknown) => ({ sendMail: sendMailMock }))

vi.mock('nodemailer', () => ({
  default: { createTransport: (opts: unknown) => createTransportMock(opts) },
}))

describe('getMailer (selección de proveedor)', () => {
  beforeEach(() => {
    vi.resetModules()
    sendMailMock.mockReset()
    createTransportMock.mockClear()
    vi.unstubAllEnvs()
    vi.stubEnv('SMTP_HOST', '')
    vi.stubEnv('SMTP_PORT', '')
    vi.stubEnv('SMTP_SECURE', '')
    vi.stubEnv('SMTP_USER', '')
    vi.stubEnv('SMTP_PASSWORD', '')
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('MAIL_FROM', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('cae a NoopMailer si no hay ningún proveedor configurado', async () => {
    const { getMailer } = await import('../mailer')
    const result = await getMailer().send({ to: 'x@example.com', subject: 's', html: '<p>h</p>' })
    expect(result).toEqual({ ok: true, providerId: 'noop' })
    expect(createTransportMock).not.toHaveBeenCalled()
  })

  it('usa SMTP con prioridad sobre Resend cuando ambos están definidos', async () => {
    vi.stubEnv('SMTP_USER', 'documentos.nbyb@gmail.com')
    vi.stubEnv('SMTP_PASSWORD', 'app-password')
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('MAIL_FROM', 'BravoCRM <no-reply@x.cl>')
    sendMailMock.mockResolvedValue({ messageId: 'msg-123' })

    const { getMailer } = await import('../mailer')
    const result = await getMailer().send({
      to: 'user@example.com',
      subject: 'Recuperar contraseña',
      html: '<p>hola</p>',
    })

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'documentos.nbyb@gmail.com', pass: 'app-password' },
    })
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'BravoCRM <no-reply@x.cl>',
        to: 'user@example.com',
        subject: 'Recuperar contraseña',
      })
    )
    expect(result).toEqual({ ok: true, providerId: 'msg-123' })
  })

  it('usa SMTP_USER como remitente si no se define MAIL_FROM', async () => {
    vi.stubEnv('SMTP_USER', 'documentos.nbyb@gmail.com')
    vi.stubEnv('SMTP_PASSWORD', 'app-password')
    sendMailMock.mockResolvedValue({ messageId: 'msg-1' })

    const { getMailer } = await import('../mailer')
    await getMailer().send({ to: 'a@b.com', subject: 's', html: '<p>h</p>' })

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'documentos.nbyb@gmail.com' })
    )
  })

  it('respeta SMTP_HOST/SMTP_PORT/SMTP_SECURE personalizados', async () => {
    vi.stubEnv('SMTP_USER', 'user@otroproveedor.com')
    vi.stubEnv('SMTP_PASSWORD', 'clave')
    vi.stubEnv('SMTP_HOST', 'smtp.otroproveedor.com')
    vi.stubEnv('SMTP_PORT', '587')
    vi.stubEnv('SMTP_SECURE', 'false')
    sendMailMock.mockResolvedValue({ messageId: 'msg-2' })

    const { getMailer } = await import('../mailer')
    await getMailer().send({ to: 'a@b.com', subject: 's', html: '<p>h</p>' })

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.otroproveedor.com', port: 587, secure: false })
    )
  })

  it('devuelve ok:false sin lanzar si el envío SMTP falla', async () => {
    vi.stubEnv('SMTP_USER', 'documentos.nbyb@gmail.com')
    vi.stubEnv('SMTP_PASSWORD', 'app-password')
    sendMailMock.mockRejectedValue(new Error('Invalid login: 535-5.7.8'))

    const { getMailer } = await import('../mailer')
    const result = await getMailer().send({ to: 'a@b.com', subject: 's', html: '<p>h</p>' })

    expect(result).toEqual({ ok: false, error: 'Invalid login: 535-5.7.8' })
  })

  it('usa Resend cuando no hay credenciales SMTP', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('MAIL_FROM', 'BravoCRM <no-reply@x.cl>')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'resend-id-1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getMailer } = await import('../mailer')
    const result = await getMailer().send({ to: 'a@b.com', subject: 's', html: '<p>h</p>' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toEqual({ ok: true, providerId: 'resend-id-1' })
  })
})
