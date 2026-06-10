import winston from 'winston'
import fs from 'fs'

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
      })
    ),
  }),
]

// File transports solo en desarrollo local (no en serverless/Vercel)
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  if (!fs.existsSync('logs')) fs.mkdirSync('logs')
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', format: winston.format.json() }),
    new winston.transports.File({ filename: 'logs/combined.log', format: winston.format.json() })
  )
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bravocrm-api' },
  transports,
})

export default logger
