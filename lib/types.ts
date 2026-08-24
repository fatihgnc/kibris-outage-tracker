export type OutageKind = 'planned' | 'fault' | 'rotating';

export type Utility = 'electricity'; // union kept open for future services

export type DistrictId =
  | 'lefkosa'
  | 'girne'
  | 'gazimagusa'
  | 'guzelyurt'
  | 'iskele'
  | 'lefke';

export type SourceRef = {
  name: string; // 'KIB-TEK', 'Yenidüzen', ...
  url: string; // link to the original announcement
  kind: 'official' | 'press';
};

export type Outage = {
  id: string; // stable, derived from the outage fingerprint
  utility: Utility;
  kind: OutageKind;
  startsAt: string; // ISO 8601
  endsAt: string | null; // null = end time unknown, typical for faults
  district: DistrictId;
  areas: string[]; // affected villages / neighbourhoods
  sources: SourceRef[]; // one record may be confirmed by several sources
  publishedAt: string; // ISO 8601, when the announcement went out
  ingestedAt: string; // ISO 8601, when this record entered the system
  confidence: 'high' | 'low'; // 'low' = parsed by fallback
};

// The archive is the one view that shows retracted records, so it is the one
// place the retraction flag crosses into the frontend. The plain Outage type
// stays free of it: nothing else may render a cancelled record at all.
export type ArchivedOutage = Outage & { cancelled: boolean };

export type Settlement = {
  name: string;
  lat: number;
  lng: number;
  district: DistrictId;
  /** Lamp size: 3 = major city, 2 = district seat, 1 = village. */
  weight: number;
};

export type MonthlyTotal = {
  month: string; // 'YYYY-MM'
  plannedHours: number;
  faultHours: number;
};

// Derived from startsAt / endsAt against the current time — never stored.
export type OutageStatus = 'active' | 'upcoming' | 'past';
