/**
 * Ein Foto aus dem Speicher anzeigen.
 *
 * Der Bucket ist privat, die Adresse wird deshalb signiert und läuft ab —
 * eine Komponente, die einfach `src={pfad}` setzen könnte, gibt es hier
 * bewusst nicht. Der Preis ist ein kurzer Ladezustand; der Gewinn ist, dass
 * ein privates Foto auch privat bleibt.
 */
import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { fotoAdresse } from '../services/eigenePunkte'

export function PunktFoto({
  pfad, alt, className = '',
}: { pfad: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [fehler, setFehler] = useState(false)

  useEffect(() => {
    let aktuell = true
    setUrl(null)
    setFehler(false)
    fotoAdresse(pfad)
      .then((u) => { if (aktuell) { if (u) setUrl(u); else setFehler(true) } })
      .catch(() => { if (aktuell) setFehler(true) })
    return () => { aktuell = false }
  }, [pfad])

  if (fehler) {
    return (
      <div className={`flex aspect-[4/3] w-full items-center justify-center gap-2 rounded-gross
                       border border-dashed border-kante text-klein text-ink-500 ${className}`}>
        <ImageOff size={16} strokeWidth={1.75} aria-hidden />
        Foto nicht verfügbar
      </div>
    )
  }

  return (
    <div className={`overflow-hidden rounded-gross border border-kante bg-flaeche-1 ${className}`}>
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="block max-h-72 w-full object-cover"
        />
      ) : (
        // Fläche statt Spinner: das Bild ist gleich da, und ein Kreisel, der
        // zweimal blinkt, ist unruhiger als eine ruhige Fläche.
        <div className="aspect-[4/3] w-full animate-pulse bg-flaeche-3" aria-label="Foto wird geladen" />
      )}
    </div>
  )
}
