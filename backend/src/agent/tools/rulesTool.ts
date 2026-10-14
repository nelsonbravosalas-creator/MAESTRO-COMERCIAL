import { AgentTool, AgentContext, AgentToolResult } from '../types'
import { getCurrentRule, listCurrentRules } from '../../services/chatbotRules'
import { teachRuleOp } from '../../services/chatbotOps'

export const consultarReglaTool: AgentTool = {
  name: 'consultar_regla',
  description:
    'Consulta las reglas y tarifas de negocio vigentes (tarifa de colacion diaria, bonificacion de desplazamiento fuera de Santiago, comunas de la RM).',
  parameters: {
    type: 'object',
    properties: {
      clave_regla: {
        type: 'string',
        enum: [
          'tarifa_colacion_diaria',
          'tarifa_bonificacion_desplazamiento_diaria',
          'comunas_region_metropolitana',
          'todas',
        ],
        description: 'Nombre de la regla o tarifa a consultar, o "todas" para listar todas.',
      },
    },
    required: ['clave_regla'],
  },
  kind: 'read',
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const clave = String(args.clave_regla ?? 'todas').trim()
    if (clave === 'todas') {
      const rules = await listCurrentRules(ctx.pool)
      return {
        output: {
          reglas: rules.map(r => ({
            clave: r.rule_key,
            valor: r.value,
            unidad: r.unit,
            notas: r.notes,
          })),
        },
        summary: `Consultó todas las reglas de negocio vigentes (${rules.length} reglas)`,
      }
    }

    const rule = await getCurrentRule(ctx.pool, clave)
    if (!rule) {
      return {
        output: {
          clave,
          encontrada: false,
          mensaje: `No hay una regla configurada para "${clave}".`,
        },
        summary: `Consultó regla "${clave}" (no encontrada)`,
      }
    }

    return {
      output: {
        clave: rule.rule_key,
        valor: rule.value,
        unidad: rule.unit,
        notas: rule.notes,
      },
      summary: `Consultó regla "${clave}": ${JSON.stringify(rule.value)}`,
    }
  },
}

export const ensenarReglaTool: AgentTool = {
  name: 'ensenar_regla',
  description:
    'Enseña o actualiza una regla de negocio o tarifa (ej. nueva tarifa de colación o bono de traslado).',
  parameters: {
    type: 'object',
    properties: {
      rule_key: {
        type: 'string',
        enum: [
          'tarifa_colacion_diaria',
          'tarifa_bonificacion_desplazamiento_diaria',
          'comunas_region_metropolitana',
        ],
        description: 'Identificador de la regla a enseñar.',
      },
      value: {
        description:
          'Nuevo valor para la regla (un número para tarifas, o un arreglo de strings para listas de comunas).',
      },
    },
    required: ['rule_key', 'value'],
  },
  kind: 'write',
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const res = await teachRuleOp(
      ctx.pool,
      {
        rule_key: args.rule_key,
        value: args.value,
      },
      {
        instruction: ctx.instruction,
        userId: ctx.userId,
        llmProvider: ctx.model,
      }
    )

    return {
      output: {
        clave: res.rule.rule_key,
        valor: res.rule.value,
        unidad: res.unit,
        mensaje: res.reply,
      },
      summary: `Actualizó regla "${res.rule.rule_key}" a ${JSON.stringify(res.rule.value)}`,
      mutatedRule: res.rule,
    }
  },
}
