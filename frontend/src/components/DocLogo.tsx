import { useCompanyLogo } from '../stores/companyLogoStore'

// Logo del membrete: el cargado por el administrador o, si no hay, el logo por defecto.
export default function DocLogo({ className = 'doc-logo' }: { className?: string }) {
  const logo = useCompanyLogo(s => s.logo)
  return <img src={logo ?? '/logo-nbyb.svg'} alt="NβyB" className={className} />
}
