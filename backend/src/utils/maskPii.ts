// A-05, AC-5.7: los logs no deben mostrar datos personales completos.
export function maskEmail(email: string | undefined | null): string {
  if (!email) return '***'
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const visible = local.slice(0, 1)
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`
}
