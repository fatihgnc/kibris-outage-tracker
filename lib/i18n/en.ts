import type { Dictionary } from './dictionaries';

// English dictionary. Written, not machine-translated — lines are rewritten to
// read naturally to a resident whose first language is not Turkish, and kept
// close to the Turkish lengths so the layout holds. A missing key is a compile
// error because this object must satisfy the Dictionary type.
export const en: Dictionary = {
  meta: {
    title: 'Current and past power outages in the TRNC',
    description:
      'View the power outages happening now and the ones already over in Northern Cyprus: districts with an outage right now, upcoming planned work, and an archive of past outages. Compiled from official announcements.',
    share:
      'Power outages in Northern Cyprus — where the power is out right now, upcoming planned work, and an archive of past outages.',
    archiveTitle: 'Past power outages in Northern Cyprus',
    archiveDescription:
      'The archive of power outages in Northern Cyprus. Filter past outages by district and month to view them.',
    districtTitle: (district: string) => `Power outages in ${district}`,
    districtDescription: (district: string) =>
      `The current power status in ${district}, upcoming planned work, and a summary of the last 12 months.`,
    outageTitle: (district: string, date: string) => `Power outage in ${district} — ${date}`,
    outageDescription: (date: string, places: string) =>
      `The power outage of ${date}. Places affected: ${places}. Times, outage type, and the source of the announcement.`,
    placeTitle: (place: string) => `Power outages in ${place}`,
    placeDescription: (place: string) =>
      `The current power status in ${place}, upcoming work, and a list of past outages.`,
  },
  brand: 'kesintimivar.com',
  nav: {
    home: 'Home',
    archive: 'Archive',
    guides: 'Guides',
  },
  guides: {
    title: 'Guides',
    lead: 'Things worth knowing about power cuts: how to report a fault, what to do during a long outage, and how to read your bill.',
    updated: 'updated {date}',
    backToIndex: 'all guides',
    readMore: 'Read more',
  },
  legal: {
    about: 'About',
    privacy: 'Privacy',
    terms: 'Terms of use',
  },
  consent: {
    title: 'Advertising cookies',
    body: 'Advertising covers our server costs. May the ad network use cookies? If you refuse, the site works exactly the same and ads are shown without personalisation.',
    accept: 'Accept',
    reject: 'Reject',
    more: 'Details',
  },
  ad: {
    label: 'advertisement',
  },
  statusBar: {
    allClear: 'No known outages — the island is lit.',
    oneActive: (district: string) => `Outage in progress in ${district}`,
    manyActive: 'Outages in progress in {count} districts',
    checked: 'last updated {time}',
    staleTitle: 'Updates are delayed.',
    staleBody: 'We have not been able to reach the announcement sources since {time}. What you see below is from then — an outage may have started or ended since. For definitive information, check the KIB-TEK announcements.',
    staleNeverBody: 'We have not been able to reach the announcement sources yet, so there is nothing to show below. For definitive information, check the KIB-TEK announcements.',
    neverChecked: 'not yet updated',
  },
  hero: {
    allClear: 'The whole island has power right now.',
    oneOut: (district: string) => `The power is out in ${district}.`,
    manyOut: 'The power is out in {count} districts.',
    kindPlanned: 'planned work',
    kindFault: 'a fault',
    kindRotating: 'a rotating outage',
    activeItem: (district: string, kind: string) => `${kind} in ${district}`,
    nextPrefix: 'next: {district} at {time}, ',
    noneAtAll: 'No planned or unplanned outage has been announced right now.',
  },
  map: {
    ariaLabel: 'Map of Cyprus showing the power status of northern settlements',
    hint: 'To look at a district in detail, tap it on the map.',
    powerOn: 'power on',
    powerOut: 'power out',
    pointAria: '{name} — {status}, open {district}',
    districtAria: 'open the {district} district',
    backToday: 'was out earlier today',
    legendLead: 'Every point on the map is one settlement.',
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
    endedAt: 'ended {time}',
    endUnknown: 'unknown',
    published: 'published {time}',
    districtWide: 'the whole district',
    cancelled: 'cancelled',
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
    h1: (district: string) => `Power outages in ${district}`,
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
    places: 'Places in this district',
    placesLead: 'Settlements with enough outage history to list:',
  },
  chart: {
    ariaLabel: 'Outage hours over the last 12 months, monthly bar chart',
    summary: '{hours} hours · compiled monthly totals',
    legendPlanned: 'planned hours',
    legendFault: 'fault hours',
    detail: '{month}: {planned} hr planned, {fault} hr fault',
    detailHint: 'tap or focus a month for its figures',
    monthAria: '{month}: {planned} hours planned, {fault} hours of fault outages',
  },
  archive: {
    title: 'Past power outages',
    lead: 'Outages that have ended. Filter them by district and month.',
    monthLabel: 'month',
    allMonths: 'all months',
    count: 'showing {count} records',
    empty: 'No records match this filter. Change the month or the district.',
  },
  outage: {
    backToDistrict: 'Outages in {district}',
    areas: 'Places affected',
    districtWide:
      'The announcement covers the whole of {district} and names no individual places.',
    sources: 'Sources',
    sourceOfficial: 'official announcement',
    sourcePress: 'press',
    nearby: 'Other outages in {district}',
    guides: 'Might help',
    cancelled: 'This work was announced and then called off. No outage took place at the times below.',
    unverified:
      'The announcement did not say when the outage began, so the time above is when it was published. The outage may have started earlier.',
    duration: 'lasted {duration}',
  },
  place: {
    backToDistrict: '{district} district',
    now: 'Right now',
    upcoming: 'Upcoming',
    history: 'Past outages',
    noActive: (place: string) => `No known outage in ${place} right now.`,
    noUpcoming: 'no planned work announced',
    summary: (place: string) => `The outage records collected for ${place}.`,
    count: '{count} records · first one {since}',
  },
  home: {
    recent: 'In the last 30 days',
    recentEmpty: 'No outage was recorded in the last 30 days.',
    recentAll: 'the whole archive',
    faq: 'Common questions',
    guidesLead: 'What to do during an outage, how to report a fault, and how to read your bill:',
    guidesLink: 'browse the guides',
  },
  faq: [
    {
      q: 'Is there a power cut right now?',
      a: 'The status line at the top of this page shows the state of the island according to the most recently collected announcements. Unlit points on the map are settlements with a reported outage at that moment.',
    },
    {
      q: 'When will the power come back?',
      a: 'For planned work we show the announced end time. Faults usually have no announced end, and in those cases the return time is unknown. Every time is an estimate — work can finish early, run long, or be called off.',
    },
    {
      q: 'Where does this information come from?',
      a: 'KIB-TEK announcements and outage reports in the Cypriot press are compiled automatically. Every record links to the source it came from. This site is not an official body.',
    },
    {
      q: 'How do I report a fault?',
      a: 'Faults are reported to KIB-TEK; this site cannot file a report for you. The guides have the numbers and the steps on the reporting page.',
    },
    {
      q: 'How do I follow my own area?',
      a: 'Open your district from the map or the district list. The district page has the current situation, upcoming work, and a summary of the last 12 months. You can bookmark it.',
    },
  ],
  footer: {
    disclaimer:
      'The information here is compiled automatically from official announcements. Work can finish early, run long, or be cancelled — read every time as an estimate. For definitive information, check the KIB-TEK announcements.',
    copyright: '© {year} Fatih Genç',
    legalAriaLabel: 'Legal',
  },
  switcher: {
    ariaLabel: 'Language',
    turkish: 'Türkçe',
    english: 'English',
  },
};
