import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido').max(255),
  // Sin mínimo de longitud acá a propósito: cuentas viejas todavía usan PIN de
  // 4 dígitos hasta que se migren con el flujo de A-04. La política de 8+
  // caracteres se aplica en change-password/reset-password, no en login.
  password: z.string().min(1, 'Password requerido').max(200),
})

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token requerido'),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido').max(255),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'token requerido'),
  password: z.string().min(1).max(200),
})

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(1).max(200),
})
