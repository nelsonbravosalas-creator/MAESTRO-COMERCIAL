# BravoCRM - Guía de Testing QA

**Fecha:** 2026-06-09  
**Versión:** MVP - Fases 1-4 Completadas  
**Estado:** Ready for Testing

---

## 🌐 URLs de Acceso

| Servicio | URL | Puerto |
|----------|-----|--------|
| **Frontend** | http://localhost:5173 | 5173 |
| **Backend API** | http://localhost:3000 | 3000 |
| **API Health Check** | http://localhost:3000/api/health | 3000 |

---

## 📝 Credenciales de Prueba

**Usuario Admin:**
- Email: `nbravo.nbyb@gmail.com`
- PIN/Contraseña: `3571`
- Rol: `admin`

**Usuario Manager:**
- Email: `hmeza.nbyb@gmail.com`
- PIN/Contraseña: `4321`
- Rol: `manager`

---

## 🧪 Casos de Prueba - FASE 1-4

### FASE 1: Setup Base ✓

#### T1.1 Frontend Carga Correctamente
- [ ] Navega a http://localhost:5173
- [ ] Deberías ver: Header "BravoCRM" + Dashboard inicial
- [ ] Verifica que el CSS está cargado (colores dark theme)
- [ ] Botón "Verificar Backend" visible

#### T1.2 Backend Health Check
- [ ] Click en "Verificar Backend"
- [ ] Debe mostrar: "Backend conectado: ok"
- [ ] Verifica http://localhost:3000/api/health directamente (debe retornar JSON)

---

### FASE 2: Database & Auth ✓

#### T2.1 Login con Usuario Admin
- [ ] Navega a http://localhost:5173/login (si existe) o busca formulario login
- [ ] Email: `nbravo.nbyb@gmail.com`
- [ ] Contraseña: `3571`
- [ ] Esperado: Login exitoso, redirige a dashboard
- [ ] Verificar token JWT en localStorage: `localStorage.getItem('authToken')`

#### T2.2 Login con Usuario Manager
- [ ] Logout del usuario anterior
- [ ] Login con: `hmeza.nbyb@gmail.com` / `4321`
- [ ] Esperado: Login exitoso

#### T2.3 Login Fallido
- [ ] Intenta login con credenciales inválidas
- [ ] Esperado: Mensaje de error "Invalid email or password"

#### T2.4 JWT Token Validation
- [ ] Inspecciona Network tab (DevTools)
- [ ] Requests a `/api/...` deben incluir header: `Authorization: Bearer <token>`
- [ ] Token debe ser válido por 7 días

---

### FASE 3: Core Modules ✓

#### T3.1 CRUD Clientes

**Create Client:**
- [ ] Navega a sección Clientes
- [ ] Click "Nuevo Cliente"
- [ ] Completa: Nombre, Email, Teléfono, Dirección, RUC
- [ ] Click "Guardar"
- [ ] Esperado: Cliente aparece en tabla

**Read Clients:**
- [ ] Lista todos los clientes
- [ ] Verifica que soft-deleted clients NO aparecen

**Update Client:**
- [ ] Selecciona un cliente
- [ ] Click "Editar"
- [ ] Modifica algún campo
- [ ] Click "Guardar"
- [ ] Esperado: Cambios se reflejan

**Delete Client:**
- [ ] Selecciona un cliente
- [ ] Click "Eliminar"
- [ ] Esperado: Cliente desaparece (soft-deleted)

#### T3.2 CRUD Cotizaciones

**Create Quotation:**
- [ ] Navega a "Cotizaciones"
- [ ] Click "Nueva Cotización"
- [ ] Selecciona Cliente (dropdown)
- [ ] Agrega Items:
  - Descripción: "Instalación AC"
  - Cantidad: 2
  - Precio Unitario: 1500
  - Costo: 800
- [ ] Sistema calcula: Subtotal, IVA (18%), Total
- [ ] Click "Guardar"
- [ ] Esperado: Cotización generada con número Q-0001

**Check Calculations:**
- [ ] Subtotal = 2 × 1500 = 3000
- [ ] IVA = 3000 × 18% = 540
- [ ] Total = 3540
- [ ] Verifica cálculos automáticos

**Update Quotation Status:**
- [ ] Abre cotización
- [ ] Cambia estado: Draft → Sent → Accepted
- [ ] Esperado: Estado se actualiza

#### T3.3 CRUD Proyectos (Planning)

**Create Project from Quotation:**
- [ ] Abre una Cotización Aceptada
- [ ] Click "Convertir a Proyecto"
- [ ] Asigna usuarios (si aplica)
- [ ] Establece fecha inicio
- [ ] Click "Crear Proyecto"
- [ ] Esperado: Proyecto creado con budget = total cotización

**Update Project Progress:**
- [ ] Abre proyecto
- [ ] Actualiza: Progreso (%), Estado, Costos Gastados
- [ ] Click "Guardar"
- [ ] Esperado: Cambios se reflejan

#### T3.4 CRUD Facturas

**Create Invoice:**
- [ ] Navega a "Facturas"
- [ ] Click "Nueva Factura"
- [ ] Selecciona Cliente
- [ ] Agrega Items (desde proyecto o manuales)
- [ ] Condición Pago: "Crédito" / "Contado"
- [ ] Si Crédito: Especifica días vencimiento (30)
- [ ] Click "Guardar"
- [ ] Esperado: Factura F-000001 creada

**Verify Sequential Numbers:**
- [ ] Crea 3 facturas
- [ ] Verifica que numeros son: F-000001, F-000002, F-000003

**Factorization Flag:**
- [ ] Abre factura emitida
- [ ] Marca "Factura Factorizada"
- [ ] Click "Guardar"
- [ ] Esperado: Flag se actualiza

---

### FASE 4: Dashboard & Cost Indicator ✓

#### T4.1 CostIndicator Loads
- [ ] Dashboard debe mostrar componente CostIndicator superior
- [ ] Verifica 5 indicadores:
  - [ ] Total Facturado (mes actual)
  - [ ] Costos Totales (mes actual)
  - [ ] Margen de Ganancia (%)
  - [ ] Proyectos en Ejecución
  - [ ] Cotizaciones Pendientes

#### T4.2 KPI Calculations
- [ ] Después de crear cotizaciones/facturas/proyectos
- [ ] Verifica que KPIs se actualizan
- [ ] Cálculo correcto:
  - Total Invoiced = SUM(facturas emitidas)
  - Total Costs = SUM(costos ejecución)
  - Margin = Total Invoiced - Total Costs
  - Margin % = (Margin / Total Invoiced) × 100

#### T4.3 Health Indicator
- [ ] Si Margin % >= 20% → Badge Verde "✓ Margen saludable"
- [ ] Si Margin % < 20% → Badge Naranja "⚠ Revisar margen"

#### T4.4 Auto-Refresh
- [ ] Crea nueva factura
- [ ] Espera máximo 5 minutos (o refresh manual si existe)
- [ ] KPIs deben actualizarse

---

## 🔍 Pruebas de Integración

### I1. Flow Completo: Cotización → Proyecto → Factura

1. **Crear Cotización:**
   - Cliente: "Empresa XYZ"
   - Item: "Servicio" × 5 × $2000 = $10,000
   - Total: $11,800 (con IVA)

2. **Convertir a Proyecto:**
   - Estado: Planning
   - Budget: $11,800

3. **Actualizar Proyecto:**
   - Registrar costos: $6,000
   - Margen: $11,800 - $6,000 = $5,800 (49%)

4. **Crear Factura:**
   - Desde proyecto
   - Items: Igual a cotización
   - Condición: Crédito, 30 días vencimiento

5. **Verificar KPIs:**
   - Total Facturado: $11,800
   - Total Costos: $6,000
   - Margen: $5,800 (49%)
   - ✓ Margen saludable

---

## 🐛 Pruebas de Bugs Corregidos

### B1: JWT Validation (BUG #1)
- [ ] Login exitoso genera JWT
- [ ] Token está en Authorization header
- [ ] Sin token: Acceso negado a endpoints /api/...
- [ ] Token expirado: Error 401 "Token expired"
- [ ] Token inválido: Error 401 "Invalid token"

### B2: Soft-Delete (BUG #3)
- [ ] Crea 3 clientes
- [ ] Elimina 1 cliente
- [ ] Lista clientes: Debe mostrar solo 2
- [ ] Verifica en BD que deleted_at está poblado

### B3: Error Handling (BUG #4)
- [ ] Abre DevTools → Console
- [ ] Simula error (ej: servidor offline)
- [ ] Error debe loguear en servidor: Ver logs en `logs/error.log`
- [ ] Response al cliente debe tener mensaje claro

---

## 📱 Responsive Testing

- [ ] **Desktop (1920px):** Todos los elementos visibles, layout grid
- [ ] **Tablet (768px):** CostIndicator 2 columnas, responsive OK
- [ ] **Mobile (375px):** CostIndicator 1 columna, scrolleable

---

## ✅ Checklist Final

Antes de pasar a Fases 5-8, verifica:

- [ ] Frontend carga sin errores
- [ ] Backend responde a health check
- [ ] Login funciona con ambos usuarios
- [ ] Todos los CRUD básicos funcionan
- [ ] Números secuenciales en Cotizaciones/Facturas
- [ ] KPIs se calculan correctamente
- [ ] Soft-delete funciona
- [ ] Responsive en móvil/tablet/desktop
- [ ] Logs se generan en backend
- [ ] No hay errores en DevTools Console

---

## 📞 Reportar Errores

Si encuentras bugs:
1. Anota el paso exacto para reproducir
2. Captura de pantalla/logs
3. Error message completo
4. Browser + version

**Ejemplo:**
```
Bug: Cotización no calcula IVA correctamente
Pasos:
1. Nueva Cotización
2. Agregar item: Qty=1, Precio=100
3. Resultado: Subtotal=100, IVA=18, Total=118 ✓ (CORRECTO)

Pero cuando Qty=2, Precio=100:
Resultado: Subtotal=200, IVA=36, Total=236 ✗ (INCORRECTO, debería ser 236 = 200×1.18)
```

---

**Happy Testing! 🚀**
