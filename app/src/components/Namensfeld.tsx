import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AtSign, Check, Loader2, X } from 'lucide-react'
import { Eingabe, Label } from '../ui'
import { namePruefen, namensformPruefen, NAME_MAX, NAME_MIN, type NamensUrteil } from '../services/account'

/**
 * Benutzername mit Prüfung, während getippt wird.
 *
 * Zwei Stufen: Form und Länge beantwortet der Browser sofort, alles Weitere
 * (Sperrliste, Verfügbarkeit) die Datenbank — entprellt, damit nicht jeder
 * Tastenanschlag eine Abfrage auslöst. Die Sperrliste bleibt dort, wo sie
 * hingehört; sie im Bundle mitzuliefern hiesse, eine Sammlung von
 * Schimpfwörtern auszuliefern und zugleich zu verraten, was gerade noch
 * durchgeht.
 *
 * `onUrteil` meldet nach oben, ob abgeschickt werden darf.
 */
export function Namensfeld({
  wert, onAendern, onUrteil, label = 'Benutzername', hinweis, autoFocus,
}: {
  wert: string
  onAendern: (w: string) => void
  onUrteil: (u: NamensUrteil | null) => void
  label?: string
  hinweis?: ReactNode
  autoFocus?: boolean
}) {
  const [urteil, setUrteil] = useState<NamensUrteil | null>(null)
  const [prueft, setPrueft] = useState(false)
  const laufendeAnfrage = useRef(0)

  useEffect(() => {
    const n = wert.trim()
    if (n.length === 0) { setUrteil(null); onUrteil(null); setPrueft(false); return }

    // Formfehler sofort zeigen — dafür braucht es kein Netz.
    const sofort = namensformPruefen(n)
    if (sofort) { setUrteil(sofort); onUrteil(sofort); setPrueft(false); return }

    setPrueft(true)
    const marke = ++laufendeAnfrage.current
    const t = setTimeout(async () => {
      const u = await namePruefen(n)
      // Eine langsame Antwort auf eine ältere Eingabe darf die neuere nicht
      // überschreiben.
      if (marke !== laufendeAnfrage.current) return
      setUrteil(u); onUrteil(u); setPrueft(false)
    }, 400)
    return () => clearTimeout(t)
  }, [wert, onUrteil])

  const zustand = urteil?.ok ? 'ok' : urteil ? 'fehler' : null

  return (
    <div>
      <Label className="mb-1.5">{label}</Label>
      <div className="relative">
        <AtSign
          size={15} strokeWidth={2} aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
        />
        <Eingabe
          value={wert}
          onChange={(e) => onAendern(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={NAME_MAX}
          required
          autoFocus={autoFocus}
          aria-invalid={zustand === 'fehler'}
          placeholder="z.B. bergziege"
          className={`pl-9 pr-9 ${
            zustand === 'ok' ? 'border-erlaubt-500/50'
            : zustand === 'fehler' ? 'border-verboten-500/50'
            : ''}`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {prueft && <Loader2 size={15} className="animate-spin text-ink-500" aria-hidden />}
          {!prueft && zustand === 'ok' && (
            <Check size={15} strokeWidth={2.5} className="text-erlaubt-400" aria-hidden />
          )}
          {!prueft && zustand === 'fehler' && (
            <X size={15} strokeWidth={2.5} className="text-verboten-400" aria-hidden />
          )}
        </span>
      </div>
      <p
        role="status"
        className={`mt-1.5 text-mikro normal-case leading-relaxed tracking-normal ${
          zustand === 'ok' ? 'text-erlaubt-400'
          : zustand === 'fehler' ? 'text-verboten-400'
          : 'text-ink-500'}`}
      >
        {prueft ? 'Wird geprüft …'
          : urteil ? (urteil.ok ? 'Der Name ist frei.' : urteil.meldung)
          : hinweis ?? `${NAME_MIN}–${NAME_MAX} Zeichen. Unter diesem Namen erscheinen deine geteilten Touren.`}
      </p>
    </div>
  )
}

