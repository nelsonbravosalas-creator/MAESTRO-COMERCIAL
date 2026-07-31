// Refleja docs/MATRIZ_PERMISOS.md. Es solo UX (ocultar/deshabilitar botones):
// el control real está en el roleMiddleware del backend.
export type Role = 'admin' | 'manager' | 'user'

function currentRole(): Role {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return 'user'
    const role = JSON.parse(raw)?.role
    return role === 'admin' || role === 'manager' ? role : 'user'
  } catch {
    return 'user'
  }
}

export function usePermissions() {
  const role = currentRole()
  const isAdmin = role === 'admin'
  const isManagerOrAbove = role === 'admin' || role === 'manager'

  return {
    role,
    canDeleteQuotation: isAdmin,
    canChangeQuotationStatus: isManagerOrAbove,
    canDeleteProject: isAdmin,
    canDeleteClient: isAdmin,
    canDeleteInvoice: isAdmin,
    canChangeInvoiceStatus: isManagerOrAbove,
    canEditCatalog: isManagerOrAbove,
    canDeleteCatalogItem: isAdmin,
    canEditConfig: isAdmin,
  }
}
