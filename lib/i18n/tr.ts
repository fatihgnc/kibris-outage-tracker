// Turkish dictionary — the source of truth for the Dictionary type.
// Plain strings may carry {placeholders} resolved with lib/time.ts `fill()`.
// Entries that need Turkish morphology (locative suffix on place names) are
// functions; they are only ever called in Server Components.

// Locative suffix with vowel harmony and consonant hardening: Girne'de,
// Lefkoşa'da, Güzelyurt'ta, Gazimağusa'da.
function locative(name: string): string {
  const lower = name.toLocaleLowerCase('tr');
  let back = true;
  for (let i = lower.length - 1; i >= 0; i--) {
    const ch = lower[i];
    if ('aıou'.includes(ch)) {
      back = true;
      break;
    }
    if ('eiöü'.includes(ch)) {
      back = false;
      break;
    }
  }
  const hard = 'fstkçşhp'.includes(lower[lower.length - 1]);
  return `${name}'${hard ? 't' : 'd'}${back ? 'a' : 'e'}`;
}

export const tr = {
  meta: {
    title: "KKTC'deki güncel ve geçmiş elektrik kesintileri",
    description:
      "Kuzey Kıbrıs'ta güncel yaşanan ve yaşanmış olan elektrik kesintilerini görüntüleyin: şu an kesinti olan bölgeler, yaklaşan planlı çalışmalar ve geçmiş kesintilerin arşivi. Resmi duyurulardan derlenir.",
    // The one line a link preview has room for; the description above is
    // written for a search result and is far too long for a card.
    share:
      "Kuzey Kıbrıs'ta yaşanan elektrik kesintileri — şu an kesinti yaşayan yerler, yaklaşan planlı çalışmalar ve geçmişte yaşanan kesintilerin arşivi.",
    archiveTitle: "KKTC'de yaşanmış elektrik kesintileri",
    archiveDescription:
      "Kuzey Kıbrıs'ta yaşanan elektrik kesintilerinin arşivi. Yaşanmış kesintileri bölgeye ve aya göre filtreleyip görüntüleyin.",
    districtTitle: (district: string) => `${district} elektrik kesintileri`,
    districtDescription: (district: string) =>
      `${locative(district)} şu anki elektrik durumu, yaklaşan planlı çalışmalar ve son 12 ayın özeti.`,
    outageTitle: (district: string, date: string) => `${district} elektrik kesintisi — ${date}`,
    outageDescription: (date: string, places: string) =>
      `${date} tarihli elektrik kesintisi. Etkilenen yerler: ${places}. Saatler, kesinti tipi ve duyurunun kaynağı.`,
    placeTitle: (place: string) => `${place} elektrik kesintileri`,
    placeDescription: (place: string) =>
      `${locative(place)} şu anki elektrik durumu, yaklaşan çalışmalar ve geçmiş kesintilerin listesi.`,
  },
  brand: 'kesintimivar.com',
  nav: {
    home: 'Ana sayfa',
    archive: 'Arşiv',
    guides: 'Rehberler',
  },
  guides: {
    title: 'Rehberler',
    lead: 'Elektrik kesintileriyle alakalı bilinmesinde fayda olan şeyler: elektrik arızası nasıl bildirilir, uzun bir kesintide ne yapılır, fatura nasıl okunur',
    updated: 'güncellendi {date}',
    backToIndex: 'tüm rehberler',
    readMore: 'Devamını oku',
  },
  legal: {
    about: 'Hakkında',
    privacy: 'Gizlilik',
    terms: 'Kullanım Koşulları',
  },
  consent: {
    // The question is asked once, and a refusal is honoured (§11.6).
    title: 'Reklam çerezleri',
    body: 'Sunucu masraflarını reklamla karşılıyoruz. Reklam ağının çerez kullanmasına izin veriyor musunuz? Reddederseniz site aynen çalışmaya devam eder, reklamlar kişiselleştirilmeden gösterilir.',
    accept: 'Kabul et',
    reject: 'Reddet',
    more: 'Ayrıntılar',
  },
  ad: {
    // Required label: honest, and on a restrained dark layout an unlabelled
    // unit reads as if the site endorses whatever it shows (§11.5).
    label: 'reklam',
  },
  statusBar: {
    allClear: 'Bilinen kesinti yok, ada aydınlık.',
    oneActive: (district: string) => `${locative(district)} kesinti sürüyor`,
    manyActive: '{count} bölgede kesinti sürüyor',
    checked: 'son güncelleme {time}',
    // Errors say what happened and what to do: name the failure, then show
    // the last known state with its timestamp (§7.5, §10.7).
    staleTitle: 'Güncellemeler gecikiyor.',
    staleBody: 'Duyuru kaynaklarına {time} tarihinden beri ulaşılamadı. Aşağıdaki bilgiler o ana ait; şu an kesinti olabilir ya da bitmiş olabilir. Kesin bilgi için KIB-TEK duyurularına bakın.',
    staleNeverBody: 'Duyuru kaynaklarına henüz ulaşılamadı. Aşağıda gösterilecek bir bilgi yok. Kesin bilgi için KIB-TEK duyurularına bakın.',
    neverChecked: 'henüz güncellenmedi',
  },
  hero: {
    allClear: 'Ada şu anda tamamen aydınlık.',
    oneOut: (district: string) => `${locative(district)} elektrik kesik.`,
    manyOut: '{count} bölgede elektrik kesik.',
    // `dict.kind` is the uppercase badge on the card and does not sit in prose,
    // so the hero carries its own sentence-case wording.
    kindPlanned: 'planlı çalışma',
    kindFault: 'arıza',
    kindRotating: 'dönüşümlü kesinti',
    activeItem: (district: string, kind: string) => `${locative(district)} ${kind}`,
    nextPrefix: 'sıradaki: {district} {time}, ',
    // Only when nothing is running and nothing is announced. Said while an
    // outage is in progress it would contradict the headline directly above
    // it, so the branch that prints it checks both.
    noneAtAll: 'Şu anda duyurulmuş planlı ya da plansız bir elektrik kesintisi bulunmuyor.',
  },
  map: {
    ariaLabel: 'Kıbrıs haritası, kuzeydeki yerleşim yerlerinin elektrik durumu',
    hint: 'Herhangi bir ilçenin detaylı kesinti verisini incelemek istiyorsanız, harita üstünden o bölgeye tıklayabilirsiniz.',
    powerOn: 'elektrik var',
    powerOut: 'elektrik kesik',
    pointAria: '{name} — {status}, {district} sayfasına git',
    districtAria: '{district} bölgesinin kesinti sayfasını aç',
    backToday: 'bugün bir ara kesilmişti',
    legendLead: 'Haritadaki her nokta bir yerleşim yerini gösteriyor.',
  },
  filter: {
    ariaLabel: 'Bölge filtresi',
    all: 'Tüm ada',
  },
  list: {
    titleAll: 'Aktif ve yaklaşan kesintiler',
    titleDistrict: '{district} için kesintiler',
    sorted: 'zamana göre sıralı · {count} kayıt',
    empty: 'Şu anda bilinen bir kesinti yok.',
    checkedAsOf: 'duyurular {time} itibarıyla kontrol edildi',
  },
  kind: {
    planned: 'PLANLI',
    fault: 'ARIZA',
    rotating: 'DÖNÜŞÜMLÜ',
  },
  card: {
    statusActive: 'şu an kesinti var',
    statusUpcoming: 'yaklaşıyor',
    // A fault nobody reported repaired. The 72-hour bound in lib/time.ts is a
    // reading of the record, not a measurement, and the card must not dress it
    // up as an estimate.
    statusPast: 'bitişi bildirilmedi',
    assumedEnd: 'onarım haberi yok · {time} itibarıyla bitmiş sayıldı',
    endedAt: 'bitti · {time}',
    endUnknown: 'belirsiz',
    districtWide: 'ilçe geneli',
    cancelled: 'iptal edildi',
  },
  countdown: {
    untilEnd: 'tahmini {duration} sonra gelecek',
    untilStart: 'tahmini {duration} sonra kesilecek',
    plain: 'tahmini {duration} sonra',
    endUnknown: 'bitiş saati henüz belirsiz',
  },
  time: {
    day: 'gün',
    hour: 'sa',
    minute: 'dk',
    today: 'bugün',
    tomorrow: 'yarın',
    yesterday: 'dün',
    relativeDate: '{relative}, {date}',
    dateWithWeekday: '{date} {weekday}',
  },
  district: {
    // The <title> already reads this way; the heading matches it rather than
    // standing alone as a bare place name.
    h1: (district: string) => `${district} elektrik kesintileri`,
    back: 'ada haritası',
    now: 'Şu an',
    upcoming: 'Yaklaşan',
    last12: 'Son 12 ay',
    summaryActive: (district: string) =>
      `${locative(district)} şu anda elektrik yok. Aşağıdaki dönüş saati resmi duyuruya dayanan tahmindir.`,
    summaryQuiet: '{district} bölgesindeki aktif ve planlı çalışmalar ile son 12 ayın özeti.',
    noActive: (district: string) => `${locative(district)} şu anda kesinti yok.`,
    noUpcoming: 'planlanmış bir çalışma duyurulmadı',
    miniCaption: '{district} bölgesi, ada üzerinde',
    miniAria: '{district} bölgesinin ada üzerindeki konumu',
    places: 'Bu bölgedeki yerler',
    placesLead: 'Kesinti geçmişi biriken yerleşimler:',
  },
  chart: {
    ariaLabel: 'Son 12 ayın kesinti saatleri, aylık çubuk grafik',
    summary: '{hours} saat · derlenen aylık toplamlar',
    legendPlanned: 'planlı saat',
    legendFault: 'arıza saat',
    detail: '{month}: {planned} sa planlı, {fault} sa arıza',
    detailHint: 'rakamlar için bir aya dokun ya da odaklan',
    monthAria: '{month}: {planned} saat planlı, {fault} saat arıza kesintisi',
  },
  archive: {
    title: 'Geçmiş elektrik kesintileri',
    lead: 'Bitmiş kesintiler. Bölgeye ve aya göre filtreleyebilirsin.',
    monthLabel: 'ay',
    allMonths: 'tüm aylar',
    count: '{count} kayıt gösteriliyor',
    empty: 'Bu filtreyle kayıt bulunamadı. Ayı ya da bölgeyi değiştir.',
  },
  outage: {
    backToDistrict: '{district} kesintileri',
    areas: 'Etkilenen yerler',
    districtWide:
      'Duyuru {district} genelini kapsıyor; tek tek yerler belirtilmemiş.',
    sources: 'Kaynaklar',
    sourceOfficial: 'resmi duyuru',
    sourcePress: 'haber',
    nearby: '{district} bölgesindeki diğer kesintiler',
    guides: 'İşine yarayabilir',
    // A retraction has to be unmistakable: an unmarked one reads as an outage
    // that happened, which is the opposite of the truth (§10.6).
    cancelled:
      'Bu çalışma duyuruldu, sonra iptal edildi. Aşağıdaki saatlerde bir kesinti yaşanmadı.',
    unverified:
      'Duyuruda kesintinin kaçta başladığı yazmıyordu; yukarıdaki saat, duyurunun yayına girdiği saattir. Kesinti bir süre önce başlamış olabilir.',
    duration: 'süre {duration}',
  },
  place: {
    backToDistrict: '{district} bölgesi',
    now: 'Şu an',
    upcoming: 'Yaklaşan',
    history: 'Geçmiş kesintiler',
    noActive: (place: string) => `${locative(place)} şu anda bilinen bir kesinti yok.`,
    noUpcoming: 'planlanmış bir çalışma duyurulmadı',
    // Said plainly, because the number is small and the reader should know why:
    // this is what has been collected since the site started, not the history
    // of the place.
    summary: (place: string) => `${locative(place)} derlenen kesinti kayıtları.`,
    count: '{count} kayıt · ilk kayıt {since}',
  },
  home: {
    recent: 'Son 30 günde',
    recentEmpty: 'Son 30 günde kayda geçen bir kesinti yok.',
    recentAll: 'tüm arşiv',
    faq: 'Sık sorulanlar',
    guidesLead: 'Kesinti sırasında ne yapılacağı, arıza nasıl bildirilir ve fatura nasıl okunur:',
    guidesLink: 'rehberlere göz at',
  },
  faq: [
    {
      q: 'Şu anda elektrik kesintisi var mı?',
      a: 'Bu sayfanın en üstündeki durum satırı, derlenen son duyurulara göre adanın o anki halini gösterir. Harita üzerinde ışığı sönmüş yerler, o an kesinti bildirilen yerleşimlerdir.',
    },
    {
      q: 'Elektrik ne zaman gelecek?',
      a: 'Planlı çalışmalarda duyurulan bitiş saatini gösteriyoruz. Arızalarda çoğu zaman bir bitiş saati duyurulmaz; böyle durumlarda dönüş saati belirsizdir. Her saat tahmindir — çalışma erken bitebilir, uzayabilir veya iptal olabilir.',
    },
    {
      q: 'Bu bilgiler nereden geliyor?',
      a: 'KIB-TEK duyuruları ve Kıbrıs basınının kesinti haberleri otomatik olarak derlenir. Her kaydın altında geldiği kaynağın bağlantısı vardır. Bu site resmi bir kurum değildir.',
    },
    {
      q: 'Arızayı nereye bildireceğim?',
      a: "Arıza ihbarı KIB-TEK'e yapılır; bu sitenin bildirim yapma yetkisi yoktur. Numaralar ve izlenecek adımlar için rehberlerdeki arıza bildirimi sayfasına bakın.",
    },
    {
      q: 'Kendi bölgemi nasıl takip ederim?',
      a: 'Haritadan ya da bölge listesinden bölgenizi açın. Bölge sayfasında o anki durum, yaklaşan çalışmalar ve son 12 ayın özeti bulunur. Sayfayı yer imlerine ekleyebilirsiniz.',
    },
  ],
  footer: {
    disclaimer:
      'Buradaki bilgiler resmi duyurulardan otomatik derlenir. Çalışmalar erken bitebilir, uzayabilir veya iptal olabilir. Her saati tahmin olarak değerlendirin; kesin bilgi için KIB-TEK duyurularına bakın.',
    copyright: '© {year} Fatih Genç',
    legalAriaLabel: 'Yasal bilgiler',
  },
  switcher: {
    ariaLabel: 'Dil seçimi',
    turkish: 'Türkçe',
    english: 'English',
  },
};
