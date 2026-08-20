/**
 * Einblenden beim Scrollen.
 *
 * Ein IntersectionObserver für die ganze Seite statt einer Bibliothek: die
 * Startseite soll nichts nachladen, was die Karte nicht ohnehin braucht.
 * Sichtbar Gewordenes bleibt sichtbar — Elemente, die beim Zurückscrollen
 * wieder verschwinden, wirken defekt.
 *
 * Ohne JavaScript-Ausführung (oder wenn der Beobachter fehlt) ist der
 * Endzustand der Startzustand; die Seite bleibt in jedem Fall lesbar.
 */
import { useEffect, useRef, type ElementType, type ReactNode } from 'react'

export function Einblenden({
  als: Tag = 'div', verzoegerung = 0, className = '', children, ...rest
}: {
  als?: ElementType
  /** Millisekunden, um gestaffelte Reihen leicht versetzt laufen zu lassen. */
  verzoegerung?: number
  className?: string
  children: ReactNode
  [k: string]: unknown
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.dataset.sichtbar = 'true'
      return
    }
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        for (const e of eintraege) {
          if (!e.isIntersecting) continue
          el.dataset.sichtbar = 'true'
          beobachter.unobserve(el)
        }
      },
      // Schwelle 0 statt eines Anteils: ein Abschnitt, der höher ist als das
      // Fenster, erreicht einen Prozentsatz nie — er bliebe unsichtbar. Der
      // negative Rand unten sorgt trotzdem für den kurzen Vorlauf.
      { threshold: 0, rootMargin: '0px 0px -80px 0px' },
    )
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      data-sichtbar="false"
      className={`einblenden ${className}`}
      style={verzoegerung ? { transitionDelay: `${verzoegerung}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}
