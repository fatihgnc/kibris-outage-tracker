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
    title: 'kesintimivar.com — Kuzey Kıbrıs elektrik kesintileri',
    titleTemplate: '%s — kesintimivar.com',
    description:
      'Kuzey Kıbrıs elektrik kesintilerini tek sayfada gösterir: şu an kesinti olan bölgeler, yaklaşan planlı çalışmalar ve geçmiş kayıtlar. Resmi duyurulardan derlenir.',
    archiveTitle: 'Geçmiş kesintiler',
    archiveDescription:
      'Kuzey Kıbrıs elektrik kesintilerinin arşivi. Bitmiş kesintileri bölgeye ve aya göre süz.',
    districtTitle: (district: string) => `${district} elektrik kesintileri`,
    districtDescription: (district: string) =>
      `${locative(district)} şu anki elektrik durumu, yaklaşan planlı çalışmalar ve son 12 ayın özeti.`,
  },
  brand: 'kesintimivar.com',
  nav: {
    home: 'Ana sayfa',
    archive: 'Arşiv',
    guides: 'Rehberler',
  },
  guides: {
    title: 'Rehberler',
    lead: 'Elektrik kesintileriyle ilgili bilmekte fayda olan şeyler: arıza nasıl bildirilir, uzun bir kesintide ne yapılır, fatura nasıl okunur.',
    updated: 'güncellendi {date}',
    backToIndex: 'tüm rehberler',
    readMore: 'Devamını oku',
  },
  legal: {
    about: 'Hakkında',
    privacy: 'Gizlilik',
    terms: 'Kullanım koşulları',
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
    allClear: 'Bilinen kesinti yok, ada ışıkta.',
    oneActive: (district: string) => `${locative(district)} kesinti sürüyor`,
    manyActive: '{count} bölgede kesinti sürüyor',
    checked: 'kontrol {time}',
    // Errors say what happened and what to do: name the failure, then show
    // the last known state with its timestamp (§7.5, §10.7).
    staleTitle: 'Güncellemeler gecikiyor.',
    staleBody: 'Duyuru kaynaklarına {time} tarihinden beri ulaşılamadı. Aşağıdaki bilgiler o ana ait; şu an kesinti olabilir ya da bitmiş olabilir. Kesin bilgi için KIB-TEK duyurularına bakın.',
    staleNeverBody: 'Duyuru kaynaklarına henüz ulaşılamadı. Aşağıda gösterilecek bir bilgi yok. Kesin bilgi için KIB-TEK duyurularına bakın.',
    neverChecked: 'kontrol edilemedi',
  },
  hero: {
    allClear: 'Ada şu anda tamamen ışıkta.',
    oneOut: (district: string) => `${locative(district)} elektrik kesik.`,
    manyOut: '{count} bölgede elektrik kesik.',
    nextPrefix: 'sıradaki: {district} {time}, ',
    noneUpcoming: 'duyurulmuş yeni bir çalışma yok',
  },
  map: {
    ariaLabel: 'Kıbrıs haritası, kuzeydeki yerleşim yerlerinin elektrik durumu',
    hint: 'bir ilçeye dokun, bölge sayfasına gider',
    powerOn: 'elektrik var',
    powerOut: 'elektrik kesik',
    pointAria: '{name} — {status}, {district} sayfasına git',
    districtAria: '{district} — {status}',
  },
  filter: {
    ariaLabel: 'Bölge süzgeci',
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
    statusPast: 'bitti',
    endUnknown: 'belirsiz',
    published: '{time} yayınlandı',
    unverified: 'doğrulanmadı',
  },
  countdown: {
    untilEnd: 'tahmini {duration} sonra gelecek',
    untilStart: 'tahmini {duration} sonra kesilecek',
    plain: 'tahmini {duration} sonra',
    endUnknown: 'dönüş saati henüz belirsiz',
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
    title: 'Geçmiş kesintiler',
    lead: 'Bitmiş kesintiler. Bölgeye ve aya göre süzebilirsin.',
    monthLabel: 'ay',
    allMonths: 'tüm aylar',
    count: '{count} kayıt gösteriliyor',
    empty: 'Bu süzgeçle kayıt bulunamadı. Ayı ya da bölgeyi değiştir.',
  },
  footer: {
    disclaimer:
      'Buradaki bilgiler resmi duyurulardan otomatik derlenir. Çalışmalar erken bitebilir, uzayabilir veya iptal olabilir. Her saati tahmin olarak okuyun; kesin bilgi için KIB-TEK duyurularına bakın.',
    lastChecked: 'son kontrol {time}',
  },
  switcher: {
    ariaLabel: 'Dil seçimi',
    turkish: 'Türkçe',
    english: 'English',
  },
};
