import { AbsenceType } from "./types";

export interface StatusInfo {
  emoji: string;
  label: string;
}

export const STATUS_CODES: Record<string, StatusInfo> = {
  U: { emoji: "🏖", label: "Urlaub" },
  Ub: { emoji: "🏖", label: "Urlaub (in Bearbeitung)" },
  "U?": { emoji: "🏖", label: "Urlaub (beantragt)" },
  "*": { emoji: "⭐", label: "Sonderurlaub" },
  X: { emoji: "🔒", label: "Abwesend" },
  Az: { emoji: "🩺", label: "Arzttermin" },
  At: { emoji: "📌", label: "Außentermin" },
  Bh: { emoji: "🏛", label: "Behörde" },
  B: { emoji: "🎓", label: "Berufsschule" },
  BE: { emoji: "❗", label: "Besonderheit" },
  Dr: { emoji: "🚗", label: "Dienstreise" },
  Ma: { emoji: "🤰", label: "Mutterschutz" },
};

const UNKNOWN: StatusInfo = { emoji: "•", label: "Abwesend" };

export function statusInfo(code: string): StatusInfo {
  return STATUS_CODES[code] ?? UNKNOWN;
}

const ABSENCE_TYPE_EMOJI: Record<AbsenceType, string> = {
  urlaub: "🏖",
  krankheit: "🏥",
  arzt: "🩺",
  aussentermin: "📌",
  behoerde: "🏛",
  berufsschule: "🎓",
  dienstreise: "🚗",
  elternzeit: "👶",
  homeoffice: "🏠",
  mutterschutz: "🤰",
  schulung: "📚",
  sonderurlaub: "⭐",
  other: "•",
};

const ABSENCE_TYPE_LABEL: Record<AbsenceType, string> = {
  urlaub: "Urlaub",
  krankheit: "Krank",
  arzt: "Arzttermin",
  aussentermin: "Außentermin",
  behoerde: "Behörde",
  berufsschule: "Berufsschule",
  dienstreise: "Dienstreise",
  elternzeit: "Elternzeit",
  homeoffice: "Homeoffice",
  mutterschutz: "Mutterschutz",
  schulung: "Schulung",
  sonderurlaub: "Sonderurlaub",
  other: "Sonstiges",
};

export function absenceTypeEmoji(type: AbsenceType): string {
  return ABSENCE_TYPE_EMOJI[type] ?? "•";
}

export function absenceTypeLabel(type: AbsenceType): string {
  return ABSENCE_TYPE_LABEL[type] ?? "Sonstiges";
}
