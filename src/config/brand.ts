/**
 * Zentrale Markenkonfiguration. Der Produktname ist ein Platzhalter und wird über
 * NEXT_PUBLIC_BRAND_NAME gesetzt. Vor kommerzieller Nutzung Marken- und
 * Domainverfügbarkeit prüfen.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Pflegewerk",
  tagline: "Personalverwaltung für Pflege- und Betreuungsunternehmen",
  /** Version der Datenschutzhinweise für das Anfrageformular. Bei Textänderung erhöhen. */
  privacyNoticeVersion: "2026-10",
} as const;
