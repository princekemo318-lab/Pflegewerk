import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarRange,
  ClipboardCheck,
  FileClock,
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
  UserPlus,
  EyeOff,
  Database,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/primitives";
import { HeroScene, RevealHeading } from "@/components/marketing/hero-scene";
import { PointerSpotlight, TiltStage } from "@/components/marketing/pointer-effects";
import { LeaveCalculatorDemo } from "@/components/marketing/leave-calculator-demo";
import { Magnetic, RoleStory } from "@/components/marketing/role-story";
import { AuroraCanvas } from "@/components/marketing/aurora-canvas";
import { LitStatement } from "@/components/marketing/statement";
import { ContactForm } from "@/components/marketing/contact-form";
import { EMPLOYEE_RANGES, INTEREST_OPTIONS, LOCATION_COUNTS } from "@/server/services/contact";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: { absolute: `${brand.name} – Urlaub und Abwesenheiten für Pflegeunternehmen` },
};

const PROBLEMS = [
  ["Urlaubsanträge kommen per Zettel, E-Mail oder Messenger.", "Mitarbeiter stellen Anträge selbst – vom Handy oder Rechner, mit sofort sichtbarem Status."],
  ["Niemand weiß genau, wer gerade entscheiden muss.", "Jeder Antrag landet bei der zuständigen Führungskraft oder Teamleitung. Offene Anträge sind gezählt und sortiert."],
  ["Die Übersicht über Abwesenheiten steckt in einer Tabelle.", "Ein Kalender zeigt pro Team und Standort, wer wann fehlt – genehmigt und beantragt."],
  ["Mitarbeiter fragen nach, wie viel Urlaub noch übrig ist.", "Resturlaub, genehmigte und beantragte Tage sieht jeder selbst – berechnet nach Arbeitszeitmodell und Feiertagen."],
  ["Daten werden doppelt gepflegt.", "Mitarbeiter, Teams, Ansprüche und Entscheidungen liegen an einem Ort, mit nachvollziehbarem Verlauf."],
] as const;

const FEATURES = [
  {
    icon: CalendarRange,
    title: "Urlaubsanträge mit echter Tageberechnung",
    text: "Wochenenden, freie Tage im Arbeitszeitmodell und Feiertage am Standort werden automatisch abgezogen – auch bei Teilzeit und über den Jahreswechsel.",
    preview: <CalcPreview />,
  },
  {
    icon: ClipboardCheck,
    title: "Genehmigen mit Begründung und Verlauf",
    text: "Führungskräfte sehen vor der Entscheidung Resturlaub und wer aus dem Team im selben Zeitraum fehlt. Jede Entscheidung wird festgehalten.",
    preview: <DecisionPreview />,
  },
  {
    icon: EyeOff,
    title: "Kalender, der nicht zu viel verrät",
    text: "Kolleginnen und Kollegen sehen nur „abwesend“ – nie den Grund. Verwaltung und Zuständige sehen Art und offene Anträge. Filter nach Team und Standort.",
  },
  {
    icon: UserPlus,
    title: "Mitarbeiter einladen statt anlegen lassen",
    text: "Lege Mitarbeiter mit Team, Standort, Führungskraft und Arbeitszeitmodell an. Per Einladung richten sie ihren Zugang selbst ein.",
  },
  {
    icon: KeyRound,
    title: "Rollen und Rechte nach eurer Struktur",
    text: "Geschäftsführung, Pflegedienstleitung, Personalverwaltung, Teamleitung, Mitarbeiter – als Vorlage, anpassbar je Unternehmen.",
  },
  {
    icon: BellRing,
    title: "Benachrichtigungen ohne Rückfragen",
    text: "Neue Anträge, Entscheidungen, Stornierungen und Erinnerungen an offene Anträge – in der App und per E-Mail.",
  },
  {
    icon: FileClock,
    title: "Protokoll für wichtige Änderungen",
    text: "Rollenwechsel, Entscheidungen, Änderungen an Mitarbeiterdaten und Ansprüchen werden unveränderlich protokolliert.",
  },
  {
    icon: Smartphone,
    title: "Gemacht für den Schichtalltag",
    text: "Funktioniert auf Smartphone, Tablet und Rechner – ohne App-Installation, hell oder dunkel.",
  },
];

const ROLES = [
  ["Geschäftsführung", "sieht auf einen Blick, wer da ist, was offen ist und was ansteht."],
  ["Pflegedienstleitung", "entscheidet Anträge mit Blick auf die Besetzung im Team."],
  ["Personalverwaltung", "pflegt Mitarbeiter, Urlaubsansprüche, Feiertage und trägt Abwesenheiten ein."],
  ["Teamleitung", "entscheidet die Anträge des eigenen Teams – und nur diese."],
  ["Mitarbeiter", "beantragen Urlaub selbst und sehen jederzeit Status und Resturlaub."],
] as const;

const STEPS = [
  ["Kennenlernen", "In einem Gespräch klären wir, wie ihr heute plant und was die Plattform für euch leisten soll."],
  ["Einrichten", "Wir schalten euer Unternehmen frei. Ihr legt Standorte, Teams, Rollen und Feiertage an."],
  ["Mitarbeiter einladen", "Mitarbeiter erhalten einen persönlichen Link und richten ihren Zugang selbst ein."],
  ["Digital entscheiden", "Anträge, Genehmigungen und Abwesenheiten laufen ab jetzt über die Plattform."],
] as const;

const SECURITY = [
  { icon: Database, title: "Getrennte Unternehmensdaten", text: "Jeder Datensatz gehört genau einem Unternehmen. Die Trennung wird zusätzlich in der Datenbank durch Row-Level Security erzwungen." },
  { icon: Lock, title: "Sichere Anmeldung", text: "Passwörter werden mit Argon2id gespeichert, Sitzungen serverseitig verwaltet und Anmeldeversuche begrenzt." },
  { icon: ShieldCheck, title: "Rechte serverseitig geprüft", text: "Jede Aktion wird auf dem Server autorisiert. Niemand kann sich selbst höhere Rechte geben." },
  { icon: EyeOff, title: "Datensparsam", text: "Keine Patientendaten. Abwesenheitsgründe sehen nur Zuständige. Protokolle enthalten keine Inhalte, nur Änderungen." },
];

const FAQ = [
  ["Wie läuft die Einführung ab?", "Nach einem Kennenlerngespräch schalten wir euer Unternehmen frei. Die verantwortliche Person erhält eine Einladung, richtet Teams, Standorte und Rollen ein und lädt anschließend die Mitarbeiter ein. Bestehende Urlaubsansprüche werden je Mitarbeiter eingetragen."],
  ["Brauchen Mitarbeiter eine App?", "Nein. Die Plattform läuft im Browser auf Smartphone, Tablet und Rechner. Eine Installation ist nicht nötig."],
  ["Wer darf Anträge genehmigen?", "Das legt ihr über Rollen fest. Typisch: Teamleitungen entscheiden für ihr Team, Pflegedienstleitung und Personalverwaltung für alle. Eigene Anträge kann niemand selbst genehmigen."],
  ["Wie werden Urlaubstage berechnet?", "Gezählt werden die Arbeitstage laut hinterlegtem Arbeitszeitmodell, abzüglich gesetzlicher Feiertage des Bundeslandes am Standort und eurer betrieblichen freien Tage. Halbe Tage und rollierende Schichtpläne werden derzeit noch nicht abgebildet. Urlaubsansprüche legt ihr nach Arbeitsvertrag fest – die Software ersetzt keine rechtliche Prüfung."],
  ["Werden Patientendaten verarbeitet?", "Nein. Die Plattform ist für interne Personalprozesse gedacht und enthält bewusst keine Pflegedokumentation."],
  ["Was ist mit Datenschutz und Hosting?", "Die technischen Schutzmaßnahmen beschreiben wir oben. Hosting-Standort, Auftragsverarbeitung und vertragliche Details besprechen wir im Gespräch – wir machen keine Zusagen, die nicht vertraglich festgehalten sind."],
  ["Können wir eigene Anforderungen einbringen?", "Ja. Schreib uns im Formular, was euch wichtig ist – zum Beispiel weitere Abwesenheitsarten oder mehrstufige Genehmigungen. Wir sagen ehrlich, was heute geht und was nicht."],
  ["Was kostet die Plattform?", "Es gibt keine festen Pakete. Konditionen vereinbaren wir individuell nach Größe und Bedarf."],
] as const;

export default function HomePage() {
  return (
    <>
      <PointerSpotlight />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="hero-backdrop absolute inset-0" />
          <AuroraCanvas className="absolute inset-0 size-full" />
          <div className="hero-grid absolute inset-0" />
          <div className="hero-fade absolute inset-0" />
        </div>
        <div className="mx-auto max-w-5xl px-4 pt-16 text-center sm:px-6 sm:pt-24">
          <p className="hs-fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
            <span className="relative flex size-1.5" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
              <span className="relative size-1.5 rounded-full bg-accent" />
            </span>
            Für private Pflege- und Betreuungsunternehmen
          </p>
          <h1 className="mx-auto max-w-4xl text-[2.15rem] leading-[1.03] font-semibold tracking-[-0.035em] hyphens-auto min-[400px]:text-[2.6rem] sm:text-[3.6rem] lg:text-[4.5rem]">
            <RevealHeading lines={["Personalverwaltung,", "die einfach funktioniert."]} accentFrom={2} />
          </h1>
          <p className="hs-fade-up mx-auto mt-6 max-w-xl text-lg text-pretty text-muted" style={{ ["--d" as string]: "450ms" }}>
            Urlaubsanträge, Genehmigungen und Abwesenheiten an einem Ort. Weniger Rückfragen, mehr Überblick.
          </p>
          <div className="hs-fade-up mt-9 flex flex-wrap justify-center gap-3" style={{ ["--d" as string]: "600ms" }}>
            <Magnetic>
              <Link href="#kontakt" className={buttonClasses("primary", "lg", "group shadow-[0_10px_30px_-10px_var(--primary)]")}>
                Demo anfragen
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </Magnetic>
            <Link href="#funktionen" className={buttonClasses("secondary", "lg")}>
              Funktionen entdecken
            </Link>
          </div>
          <p className="hs-fade-up mt-5 text-xs text-subtle" style={{ ["--d" as string]: "750ms" }}>
            Im Browser · Auf dem Smartphone · Ohne Installation
          </p>
        </div>
        <div className="hs-fade-up mx-auto mt-14 max-w-5xl px-4 pb-28 sm:mt-16 sm:px-6" style={{ ["--d" as string]: "500ms" }}>
          <div className="hs-tilt">
            <TiltStage>
              <HeroScene />
            </TiltStage>
          </div>
        </div>
      </section>

      {/* Statement */}
      <section aria-label="Kurz gesagt" className="px-4 py-24 sm:px-6 sm:py-32">
        <LitStatement text="Ein Ort für jeden Antrag. Eine klare Entscheidung. Ein Kalender, den alle verstehen." accentFrom={10} />
      </section>

      {/* Problem & Lösung */}
      <section aria-labelledby="problem" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 id="problem" className="reveal max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Vom Zettel an der Stationstür zum klaren Ablauf.
          </h2>
          <p className="mt-3 max-w-2xl text-muted">Kommt dir das bekannt vor? So sieht derselbe Vorgang mit {brand.name} aus.</p>
          <div className="reveal mt-10 overflow-hidden rounded-2xl border border-line">
            <div className="hidden grid-cols-2 bg-sunken text-xs font-medium tracking-wide text-subtle uppercase md:grid">
              <p className="px-6 py-3">Heute</p>
              <p className="border-l border-line px-6 py-3">Mit {brand.name}</p>
            </div>
            {PROBLEMS.map(([before, after]) => (
              <div key={before} className="grid border-t border-line first:border-t-0 md:grid-cols-2 md:first:border-t">
                <p className="px-6 pt-5 text-muted md:py-5">{before}</p>
                <p className="flex gap-3 px-6 pt-2 pb-5 font-medium md:border-l md:border-line md:py-5">
                  <ArrowRight className="mt-1 size-4 shrink-0 text-accent" aria-hidden />
                  {after}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interaktiver Urlaubsrechner */}
      <section id="rechner" aria-labelledby="rechner-title" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="reveal text-sm font-medium text-accent-text">Probier es aus</p>
          <h2 id="rechner-title" className="reveal mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Wie viele Urlaubstage sind das eigentlich?
          </h2>
          <p className="reveal mt-3 max-w-2xl text-muted">
            Wähle einen Zeitraum. Wochenenden, freie Tage und die Feiertage deines Bundeslandes werden sofort abgezogen – genau wie in der Plattform.
          </p>
          <div className="reveal mt-10">
            <LeaveCalculatorDemo />
          </div>
        </div>
      </section>

      {/* Funktionen */}
      <section id="funktionen" aria-labelledby="funktionen-title" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 id="funktionen-title" className="reveal max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Alles, was ihr für Urlaub und Abwesenheiten braucht. Nicht mehr.
          </h2>
          <p className="mt-3 max-w-2xl text-muted">Jede hier gezeigte Funktion ist heute nutzbar.</p>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {FEATURES.slice(0, 2).map((f) => (
              <article key={f.title} className="reveal lift spotlight flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-soft">
                <f.icon className="size-5 text-accent-text" aria-hidden />
                <h3 className="mt-4 text-xl font-semibold">{f.title}</h3>
                <p className="mt-2 text-muted">{f.text}</p>
                <div className="mt-6 flex-1">{f.preview}</div>
              </article>
            ))}
          </div>
          <div className="reveal mt-6 grid gap-x-8 gap-y-10 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-2 sm:p-8 lg:grid-cols-3">
            {FEATURES.slice(2).map((f) => (
              <article key={f.title}>
                <f.icon className="size-5 text-accent-text" aria-hidden />
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Scroll-Story: ein Antrag, drei Rollen */}
      <section aria-labelledby="story-title" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 lg:pb-8">
          <p className="reveal text-sm font-medium text-accent-text">Ein Antrag, drei Rollen</p>
          <h2 id="story-title" className="reveal mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Vom Antrag bis zum Überblick – jede Rolle sieht, was sie braucht.
          </h2>
          <div className="mt-6 pb-16 lg:mt-0 lg:pb-0">
            <RoleStory />
          </div>
        </div>
      </section>

      {/* Für wen */}
      <section id="fuer-wen" aria-labelledby="fuer-wen-title" className="scroll-mt-16 bg-[#13294b] text-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div>
            <h2 id="fuer-wen-title" className="reveal text-3xl font-semibold tracking-tight sm:text-4xl">
              Für kleine und mittlere Pflege&shy;unternehmen.
            </h2>
            <p className="mt-4 text-white/70">
              Ambulante Dienste, Tagespflege, Betreuungs- und Alltagshilfe – mit einem oder mehreren Standorten. Jede Rolle sieht genau
              das, was sie braucht.
            </p>
            <p className="mt-6 text-sm text-white/50">
              Keine Pflegedokumentation, keine Lohnabrechnung, keine Dienstplanung – bewusst fokussiert auf Personalprozesse rund um
              Abwesenheiten.
            </p>
          </div>
          <ul className="reveal divide-y divide-white/10 border-y border-white/10">
            {ROLES.map(([role, text]) => (
              <li key={role} className="grid gap-1 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
                <span className="font-display font-semibold">{role}</span>
                <span className="text-white/75">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Ablauf */}
      <section id="ablauf" aria-labelledby="ablauf-title" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 id="ablauf-title" className="reveal text-3xl font-semibold tracking-tight sm:text-4xl">
            So funktioniert es
          </h2>
          <div className="reveal relative mt-12 overflow-hidden rounded-2xl border border-line">
            <span aria-hidden className="steps-line z-10" />
            <ol className="grid gap-px bg-line md:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="bg-surface p-6">
                <span className="font-display text-sm font-semibold text-accent-text tabular">Schritt {i + 1}</span>
                <h3 className="mt-2 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted">{text}</p>
              </li>
            ))}
          </ol>
          </div>
        </div>
      </section>

      {/* Datenschutz & Sicherheit */}
      <section id="sicherheit" aria-labelledby="sicherheit-title" className="scroll-mt-16 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 id="sicherheit-title" className="reveal max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Datenschutz und Sicherheit, eingebaut statt aufgesetzt.
          </h2>
          <p className="mt-3 max-w-2xl text-muted">
            Diese Schutzmaßnahmen sind technisch umgesetzt. Zertifizierungen oder Prüfsiegel versprechen wir nicht – wir zeigen, wie es
            gebaut ist.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {SECURITY.map((s) => (
              <div key={s.title} className="reveal lift spotlight flex gap-4 rounded-2xl border border-line p-6">
                <s.icon className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <h2 id="faq-title" className="reveal text-3xl font-semibold tracking-tight sm:text-4xl">
            Häufige Fragen
          </h2>
          <div className="divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-line text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Kontakt */}
      <section id="kontakt" aria-labelledby="kontakt-title" className="scroll-mt-16 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div>
            <h2 id="kontakt-title" className="reveal text-3xl font-semibold tracking-tight sm:text-4xl">
              Lass uns sprechen.
            </h2>
            <p className="mt-4 text-muted">
              Erzähl uns kurz, wie euer Unternehmen aufgestellt ist. Wir melden uns, zeigen dir die Plattform an euren Abläufen und
              besprechen die Konditionen individuell.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {["Unverbindliche Demo", "Keine festen Pakete – Konditionen nach Bedarf", "Einrichtung gemeinsam mit euch"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="reveal relative rounded-2xl border border-line bg-bg p-6 sm:p-8">
            <ContactForm employeeRanges={EMPLOYEE_RANGES} locationCounts={LOCATION_COUNTS} interests={INTEREST_OPTIONS} />
          </div>
        </div>
      </section>
    </>
  );
}

function CalcPreview() {
  const days = [
    ["Mo 28.12.", "zählt"],
    ["Di 29.12.", "zählt"],
    ["Mi 30.12.", "zählt"],
    ["Do 31.12.", "Silvester (betriebsfrei)"],
    ["Fr 01.01.", "Neujahr"],
    ["Sa 02.01.", "frei"],
  ] as const;
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4" aria-label="Beispieldarstellung der Tageberechnung">
      <div className="flex items-baseline justify-between">
        <p className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold tabular">3</span>
          <span className="text-sm text-muted">Arbeitstage</span>
        </p>
        <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-muted">Beispiel</span>
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {days.map(([d, s]) => (
          <li key={d} className="flex justify-between">
            <span className={s === "zählt" ? "tabular" : "text-subtle tabular"}>{d}</span>
            <span className={s === "zählt" ? "font-medium text-accent-text" : "text-subtle"}>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecisionPreview() {
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4 text-sm" aria-label="Beispieldarstellung einer Entscheidung">
      <div className="flex items-center justify-between">
        <span className="font-medium">Im selben Zeitraum im Team</span>
        <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-muted">Beispiel</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span>K. Haas · 14.–16.10.</span>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-text">Genehmigt</span>
      </div>
      <div className="h-px bg-line" />
      <ol className="space-y-2 text-xs">
        <li className="flex gap-2">
          <span className="mt-1 size-2 rounded-full bg-line-strong" aria-hidden />
          <span>
            <span className="font-medium">Eingereicht</span> <span className="text-muted">von M. Wolff</span>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1 size-2 rounded-full bg-accent" aria-hidden />
          <span>
            <span className="font-medium">Genehmigt</span> <span className="text-muted">von der Teamleitung · „Vertretung ist geklärt.“</span>
          </span>
        </li>
      </ol>
    </div>
  );
}
