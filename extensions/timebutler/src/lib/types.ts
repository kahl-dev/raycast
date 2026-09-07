export interface Profile {
  user_id: number;
  name: string;
  email: string;
  department: string | null;
  weekly_hours: {
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
    total: number;
  };
  vacation_summary: {
    total: number;
    consumed: number;
    remaining: number;
  };
  holiday_region: string;
}

export interface Vacation {
  year: number;
  entitled: number;
  carryover: number;
  special_leave: number;
  subtotal: number;
  expired: number;
  paid_out: number;
  approved: {
    without_special: number;
    special: number;
    total: number;
  };
  remaining: number;
  planned: number;
}

export type AbsenceType =
  | "urlaub"
  | "krankheit"
  | "arzt"
  | "aussentermin"
  | "behoerde"
  | "berufsschule"
  | "dienstreise"
  | "elternzeit"
  | "homeoffice"
  | "mutterschutz"
  | "other"
  | "schulung"
  | "sonderurlaub";

export interface AbsenceEvent {
  type: AbsenceType;
  summary: string;
  start: string;
  end: string;
  is_all_day: boolean;
  workdays: number;
  status: string;
  deputy: string;
  submitted_at?: string;
  approved_at?: string | null;
  uid: string;
}

export interface AbsencesResponse {
  count: number;
  total: number;
  events: AbsenceEvent[];
}

export interface TeamTodayEntry {
  user_id: number | null;
  name: string;
  status: string;
  status_label: string;
  is_holiday: boolean;
  is_weekend: boolean;
}

export interface TeamToday {
  date: string;
  total_team: number;
  away_count: number;
  present_count: number;
  away: TeamTodayEntry[];
}

export interface TeamMember {
  user_id: number | null;
  name: string;
  department: string | null;
  location: string | null;
  cost_center: string;
  phone: string | null;
  email: string;
}

export interface TeamResponse {
  count: number;
  total: number;
  members: TeamMember[];
}

export interface TeamCalendarDay {
  day: number;
  status: string;
  is_weekend: boolean;
  is_holiday: boolean;
  is_today: boolean;
}

export interface TeamCalendarPerson {
  user_id: number | null;
  name: string;
  days: TeamCalendarDay[];
}

export interface TeamCalendar {
  year: number;
  month: number;
  days_in_month: number;
  statuses: Record<string, TeamCalendarPerson>;
}

export interface Holiday {
  date: string;
  name: string;
  full_day: boolean;
  recurring: boolean;
  fixed: boolean;
}

export interface HolidaysResponse {
  year: number;
  region: string;
  count: number;
  holidays: Holiday[];
}
