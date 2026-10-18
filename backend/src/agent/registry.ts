import { AgentTool } from './types'
import { FunctionDeclaration } from '../services/llm'
import { buscarCatalogoTool } from './tools/catalogTool'
import { consultarReglaTool, ensenarReglaTool } from './tools/rulesTool'
import { consultarPrecioWebTool } from './tools/priceTool'
import { calcularItemsAutoTool } from './tools/calcTool'
import {
  crearCotizacionTool,
  modificarCotizacionTool,
  verCotizacionTool,
} from './tools/quotationTool'
import { consultarHistorialClienteTool } from './tools/historyTool'
import { procesarCorreoCotizacionTool } from './tools/emailIntakeTool'
import { cubicarEspecificacionHvacTool } from './tools/specCubicatorTool'
import { analizarWinLossClienteTool, prepararSeguimientoCotizacionTool } from './tools/followUpTool'

export class ToolRegistry {
  private tools = new Map<string, AgentTool>()

  constructor() {
    this.register(buscarCatalogoTool)
    this.register(consultarReglaTool)
    this.register(ensenarReglaTool)
    this.register(consultarPrecioWebTool)
    this.register(calcularItemsAutoTool)
    this.register(crearCotizacionTool)
    this.register(modificarCotizacionTool)
    this.register(verCotizacionTool)
    this.register(consultarHistorialClienteTool)
    this.register(procesarCorreoCotizacionTool)
    this.register(cubicarEspecificacionHvacTool)
    this.register(analizarWinLossClienteTool)
    this.register(prepararSeguimientoCotizacionTool)
  }

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool)
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name)
  }

  getToolsForRole(role?: string): AgentTool[] {
    return Array.from(this.tools.values()).filter(t => {
      if (!t.roles || t.roles.length === 0) return true
      if (!role) return false
      return t.roles.includes(role)
    })
  }

  toFunctionDeclarations(role?: string): FunctionDeclaration[] {
    return this.getToolsForRole(role).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
  }
}

export const defaultToolRegistry = new ToolRegistry()
