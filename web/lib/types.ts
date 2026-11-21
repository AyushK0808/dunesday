export type Theme = "dune" | "doom" | "plain";

export type MovieSetting = {
  key: string;
  name: string;
  url: string;
  enabled: boolean;
  theme: Theme;
};

export type Settings = {
  _id: "global";
  city: string;
  language: string;
  paused: boolean;
  failure_streak: number;
  last_ok_at?: Date;
  movies: MovieSetting[];
};

export type SeatArea = { label: string; price: number | null; available: number; total: number };

export type ShowDoc = {
  _id: string;
  platform: string;
  movie_key: string;
  movie_name: string;
  theatre_id: string;
  theatre_name: string;
  session_id: string;
  date: string;
  time: string;
  time_text: string;
  starts_at: string;
  language: string;
  screen_format: string;
  premium_label: string;
  audi: string;
  tags: string[];
  format_label: string;
  available: number;
  total: number;
  areas: SeatArea[];
  min_price: number | null;
  booking_url: string;
  first_seen_at: Date;
  last_seen_at: Date;
  active: boolean;
};

export type RunDoc = {
  _id: unknown;
  started_at: Date;
  finished_at?: Date;
  trigger: "cron" | "manual";
  status: "running" | "ok" | "error" | "skipped";
  shows_found?: number;
  new_shows?: number;
  per_movie?: Record<string, number>;
  new_per_movie?: Record<string, number>;
  emails_sent?: number;
  error?: string | null;
  note?: string;
};

export type Role = "admin" | "viewer";

export type UserDoc = {
  _id?: unknown;
  email: string;
  name: string;
  role: Role;
  prefs: { alerts_on: boolean; movies: string[]; formats: string[] };
  created_at: Date;
  last_login_at?: Date;
};

export const PREMIUM_TAGS = ["IMAX", "4DX", "MX4D", "ScreenX", "Dolby Cinema", "EPIQ", "ICE", "P[XL]", "Macro XE", "Onyx", "PCX"];
export const ALL_TAGS = [...PREMIUM_TAGS, "Insignia", "Luxe", "Laser", "Atmos", "Dolby", "Recliners", "3D", "2D"];
