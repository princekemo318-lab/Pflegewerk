/**
 * Berechtigungen sind fest definiert; Unternehmen bündeln sie zu eigenen Rollen.
 * Die Prüfung erfolgt immer serverseitig (siehe src/server/authz.ts).
 */
export const PERMISSIONS = {
  "dashboard.company": "Unternehmensweite Kennzahlen im Dashboard sehen",
  "employees.view": "Alle Mitarbeiter und deren Urlaubssalden sehen",
  "employees.manage": "Mitarbeiter anlegen, bearbeiten, einladen und deaktivieren",
  "leave.view_all": "Alle Anträge und Abwesenheitsarten im Unternehmen sehen",
  "leave.approve_team": "Anträge des eigenen Teams bzw. direkter Mitarbeiter entscheiden",
  "leave.approve_all": "Alle Anträge im Unternehmen entscheiden",
  "leave.manage": "Abwesenheiten erfassen, Genehmigungen stornieren, Urlaubsansprüche pflegen",
  "organization.manage": "Teams, Standorte, Feiertage, Abwesenheitsarten und Einstellungen verwalten",
  "roles.manage": "Rollen bearbeiten und Rollen zuweisen",
  "audit.view": "Audit-Protokoll einsehen",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

export type DefaultRole = {
  name: string;
  description: string;
  permissions: Permission[];
  isOwner?: boolean;
  isDefault?: boolean;
};

/** Startkonfiguration für neue Unternehmen. Jedes Unternehmen kann sie anpassen. */
export const DEFAULT_ROLES: DefaultRole[] = [
  {
    name: "Geschäftsführung",
    description: "Inhaberrolle mit allen Rechten. Mindestens eine Person muss sie besitzen.",
    permissions: ALL_PERMISSIONS,
    isOwner: true,
  },
  {
    name: "Pflegedienstleitung",
    description: "Überblick über alle Mitarbeiter, entscheidet Anträge.",
    permissions: [
      "dashboard.company",
      "employees.view",
      "employees.manage",
      "leave.view_all",
      "leave.approve_all",
      "leave.manage",
    ],
  },
  {
    name: "Personalverwaltung",
    description: "Pflegt Mitarbeiterdaten, Urlaubsansprüche und Organisation.",
    permissions: [
      "dashboard.company",
      "employees.view",
      "employees.manage",
      "leave.view_all",
      "leave.approve_all",
      "leave.manage",
      "organization.manage",
    ],
  },
  {
    name: "Teamleitung",
    description: "Entscheidet Anträge des eigenen Teams.",
    permissions: ["leave.approve_team"],
  },
  {
    name: "Mitarbeiter",
    description: "Stellt eigene Anträge und sieht den Teamkalender.",
    permissions: [],
    isDefault: true,
  },
];
