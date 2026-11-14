import { useRef, useState, type ChangeEvent } from 'react'
import api from '../api/api'
import { usePermissions } from '../hooks/usePermissions'
import { useCompanyLogo } from '../stores/companyLogoStore'

// Tamaño máximo del logo en píxeles: basta para el membrete y mantiene el archivo liviano.
const MAX_WIDTH = 600
const MAX_HEIGHT = 240
// El backend acepta hasta 200.000 caracteres en el data URL.
const MAX_DATA_URL_LENGTH = 200_000

async function fileToLogoDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, MAX_WIDTH / img.naturalWidth, MAX_HEIGHT / img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas no disponible')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

interface Props {
  onMessage: (msg: string, ok: boolean) => void
}

// Solo administradores ven el botón; el backend valida el mismo rol.
export default function LogoUploadButton({ onMessage }: Props) {
  const { role } = usePermissions()
  const logo = useCompanyLogo(s => s.logo)
  const setLogo = useCompanyLogo(s => s.setLogo)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  if (role !== 'admin') return null

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      onMessage('Use una imagen PNG o JPEG', false)
      return
    }
    setBusy(true)
    try {
      const dataUrl = await fileToLogoDataUrl(file)
      if (dataUrl.length > MAX_DATA_URL_LENGTH) {
        onMessage('El logo es demasiado pesado; use una imagen más simple', false)
        return
      }
      await api.setCompanyLogo(dataUrl)
      setLogo(dataUrl)
      onMessage('Logo actualizado', true)
    } catch {
      onMessage('No se pudo cargar el logo', false)
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    setBusy(true)
    try {
      await api.deleteCompanyLogo()
      setLogo(null)
      onMessage('Logo restablecido', true)
    } catch {
      onMessage('No se pudo quitar el logo', false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={handleFile}
      />
      <button
        type="button"
        className="btn-act btn-act-html"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        <span>🖼</span>
        {busy ? 'Guardando…' : logo ? 'Cambiar logo' : 'Cargar logo'}
      </button>
      {logo && (
        <button
          type="button"
          className="btn-act btn-act-html"
          onClick={handleRemove}
          disabled={busy}
        >
          Quitar logo
        </button>
      )}
    </>
  )
}
