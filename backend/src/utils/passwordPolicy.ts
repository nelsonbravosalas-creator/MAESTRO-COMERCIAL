// A-04: reemplaza el PIN de 4 dígitos como mecanismo de autenticación nuevo.
// Las cuentas viejas con PIN corto siguen pudiendo hacer login (ver
// schemas/auth.ts loginSchema) hasta que pasen por change-password o
// reset-password, momento en el que quedan sujetas a esta política.

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  'password',
  'password1',
  'qwerty123',
  'admin1234',
  '11111111',
  'abc12345',
  'letmein1',
  'welcome1',
  'iloveyou',
  'monkey123',
  'football1',
  'baseball1',
  'dragon123',
])

export function validatePasswordPolicy(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'La contraseña debe tener al menos 8 caracteres.' }
  }
  if (/^\d+$/.test(password)) {
    return { valid: false, message: 'La contraseña no puede ser solo números.' }
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, message: 'Esa contraseña es demasiado común. Elige otra.' }
  }
  return { valid: true }
}
