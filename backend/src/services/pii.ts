// RUT chileno (con o sin puntos, con guion), email, y telefono (movil +56 9
// u otro formato de 8-9 digitos contiguos con separadores opcionales). Los
// dias/dotacion legitimos que el parser SI debe leer son numeros cortos (1-3
// cifras) sueltos en el texto ("5 dias", "8 tecnicos"), por lo que no caen en
// ninguno de estos tres patrones.
//
// Vive en su propio modulo (sin dependencias) para que api/quotations.ts pueda
// usarlo sin el ciclo quotations -> chatbotOps -> quotations. chatbotOps.ts lo
// reexporta, asi que los imports existentes no cambian.
// El guion admite espacios alrededor ("12.345.678 - 9") y se cubre el RUT sin
// guion cuyo digito verificador es K ("18234567k"); sin la K seria ambiguo con
// cantidades y series, asi que no se enmascara.
const RUT_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}\s?-\s?[\dkK]\b|\b\d{7,8}[kK]\b/g
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g
// Movil, "(+569) 9123 4567" y fijo con prefijo de pais ("+56 2 2987 6543").
const PHONE_RE =
  /\(\+?56\s?9\)\s?\d{4}[\s.-]?\d{4}\b|\+?56[\s.-]?\(?[2-9]\)?[\s.-]?\d{4}[\s.-]?\d{4}\b|(?:\+?56[\s.-]?)?(?:9[\s.-]?)\d{4}[\s.-]?\d{4}\b/g

/**
 * Enmascara RUT/email/telefono en texto libre antes de que ese texto llegue
 * al prompt de un LLM externo. No es infalible (regex, no un NER) — por eso
 * docs/RIESGOS_ACEPTADOS.md (A-21) lo documenta como "minimizado, no
 * garantizado", no como una promesa absoluta.
 */
export function scrubPii(text: string): string {
  return text.replace(RUT_RE, '[RUT]').replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[TELEFONO]')
}
