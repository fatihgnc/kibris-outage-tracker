import type { Dictionary } from './dictionaries';

// English dictionary. Written, not machine-translated — lines are rewritten to
// read naturally to a resident whose first language is not Turkish, and kept
// close to the Turkish lengths so the layout holds. A missing key is a compile
// error because this object must satisfy the Dictionary type.
export const en: Dictionary = {
  meta: {
    title: 'Sönen Ada — power outages in Northern Cyprus',
    titleTemplate: '%s — Sönen Ada',
    description:
      'Power outages in Northern Cyprus on one page: districts with an outage right now, upcoming planned work, and past records. Compiled from official announcements.',
    archiveTitle: 'Past outages',
    archiveDescription:
      'The archive of power outages in Northern Cyprus. Filter finished outages by district and month.',
    districtTitle: (district: string) => `Power outages in ${district}`,
    districtDescription: (district: string) =>
      `The current power status in ${district}, upcoming planned work, and a summary of the last 12 months.`,
  },
  brand: 'Sönen Ada',
  nav: {
    home: 'Home',
    archive: 'Archive',
  },
  statusBar: {
    allClear: 'No known outages — the island is lit.',
    oneActive: (district: string) => `Outage in progress in ${district}`,
    manyActive: 'Outages in progress in {count} districts',
    checked: 'checked {time}',
  },
  hero: {
    allClear: 'The whole island has power right now.',
    oneOut: (district: string) => `The power is out in ${district}.`,
    manyOut: 'The power is out in {count} districts.',
    nextPrefix: 'next: {district} at {time}, ',
    noneUpcoming: 'no new work has been announced',
  },
  map: {
    ariaLabel: 'Map of Cyprus showing the power status of northern settlements',
    hint: 'tap a light to open that district',
    powerOn: 'power on',
    powerOut: 'power out',
    pointAria: '{name} — {status}, open {district}',
  },
  filter: {
    ariaLabel: 'Filter by district',
    all: 'Whole island',
  },
  list: {
    titleAll: 'Active and upcoming outages',
    titleDistrict: 'Outages for {district}',
    sorted: 'sorted by time · {count} records',
    empty: 'No known outages right now.',
    checkedAsOf: 'announcements checked as of {time}',
  },
  kind: {
    planned: 'PLANNED',
    fault: 'FAULT',
    rotating: 'ROTATING',
  },
  card: {
    statusActive: 'outage in progress',
    statusUpcoming: 'coming up',
    statusPast: 'ended',
    endUnknown: 'unknown',
    published: 'published {time}',
    unverified: 'unverified',
  },
  countdown: {
    untilEnd: 'estimated back in {duration}',
    untilStart: 'estimated to start in {duration}',
    plain: 'estimated {duration} from now',
    endUnknown: 'restoration time still unknown',
  },
  time: {
    day: 'day',
    hour: 'hr',
    minute: 'min',
    today: 'today',
    tomorrow: 'tomorrow',
    yesterday: 'yesterday',
    relativeDate: '{relative}, {date}',
    dateWithWeekday: '{weekday}, {date}',
  },
  district: {
    back: 'island map',
    now: 'Now',
    upcoming: 'Upcoming',
    last12: 'Last 12 months',
    summaryActive: (district: string) =>
      `The power is out in ${district} right now. The restoration time below is an estimate based on the official announcement.`,
    summaryQuiet: 'Active and planned work in the {district} district, with a summary of the last 12 months.',
    noActive: (district: string) => `No outage in ${district} right now.`,
    noUpcoming: 'no planned work has been announced',
    miniCaption: 'the {district} district on the island',
    miniAria: 'Location of the {district} district on the island',
  },
  chart: {
    ariaLabel: 'Outage hours over the last 12 months, monthly bar chart',
    summary: '{hours} hours · compiled monthly totals',
    legendPlanned: 'planned hours',
    legendFault: 'fault hours',
    detail: '{month}: {planned} hr planned, {fault} hr fault',
    detailHint: 'hover or focus a month for its figures',
    monthAria: '{month}: {planned} hours planned, {fault} hours of fault outages',
  },
  archive: {
    title: 'Past outages',
    lead: 'Outages that have ended. Filter them by district and month.',
    monthLabel: 'month',
    allMonths: 'all months',
    count: 'showing {count} records',
    empty: 'No records match this filter. Change the month or the district.',
  },
  footer: {
    disclaimer:
      'The information here is compiled automatically from official announcements. Work can finish early, run long, or be cancelled — read every time as an estimate. For definitive information, check the KIB-TEK announcements.',
    lastChecked: 'last checked {time}',
  },
  switcher: {
    ariaLabel: 'Language',
    turkish: 'Türkçe',
    english: 'English',
  },
};
