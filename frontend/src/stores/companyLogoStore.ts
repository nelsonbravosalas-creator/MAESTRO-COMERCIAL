import { create } from 'zustand'

// Logo cargado por el administrador (data URL PNG/JPEG). null = usar el logo por defecto.
interface CompanyLogoState {
  logo: string | null
  setLogo: (logo: string | null) => void
}

export const useCompanyLogo = create<CompanyLogoState>()(set => ({
  logo: null,
  setLogo: logo => set({ logo }),
}))
