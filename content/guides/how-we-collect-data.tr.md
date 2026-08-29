---
title: Bu site verilerini nasıl topluyor ve doğruluyor
summary: Kaynaklar, ayrıştırma, mükerrer kayıtların birleştirilmesi ve bilerek yapmadığımız şeyler.
updated: 2026-08-23
---

Bu site, elektrik kesintisi duyurularını tek yerde toplar. Kesintileri biz
yapmıyoruz, planlamıyoruz ve haberdar edilmiyoruz — herkesin görebileceği
duyuruları derliyoruz. Bu sayfa, bunu tam olarak nasıl yaptığımızı anlatır.

Bunu yayımlıyoruz çünkü bir kesinti sırasında birine bilgi veriyorsanız, o
kişinin bilginin nereden geldiğini ve neye güvenip neye güvenmeyeceğini bilmeye
hakkı vardır.

## Kaynaklar

Resmî bir veri servisi (API) yok. Duyurular düz metin olarak yayımlanır ve
dakikalar içinde haber siteleri tarafından aktarılır.

Beş haber sitesini takip ediyoruz: **Yenidüzen**, **Kıbrıs Postası**,
**Detay Kıbrıs**, **Gündem Kıbrıs** ve **Kıbrıs Gazetesi**.

Listede KIB-TEK'in kendi sitesinin olmaması dikkatinizi çekebilir. Sitede
"Planlı Kesintiler" diye bir bölüm var, ama içi boş — bir tek duyuru bile
yayımlanmamış. Kurumun akışında ihale ve şartname duyuruları çıkıyor,
kesintiler değil. Bir süre orayı da yokladık, hiçbir şey dönmediği için
listeden çıkardık. Kurum bir gün oraya yayımlamaya başlarsa geri ekleriz.

Bu yüzden haber sitelerini "yedek" olarak görmüyoruz; bu duyuruların
fiilen yayımlandığı yer onlar.

Her kaydın altında hangi kaynaktan geldiği yazar ve özgün duyuruya bağlantı
verilir.

## Ne sıklıkla ve nasıl bakıyoruz

Kaynakları **10 dakikada bir** kontrol ediyoruz. Buradaki hiçbir şey bundan daha
hızlı değişmiyor.

Kaynak sitelere karşı nazik davranmaya çalışıyoruz, çünkü kamuya açık veriyi
kamuya açık bir hizmet için alıyoruz:

- Kendimizi tanıtan ve iletişim adresi taşıyan bir kimlikle bağlanıyoruz.
- `robots.txt` kurallarına uyuyoruz.
- Sayfa değişmediyse yeniden indirmiyoruz.
- Aynı siteye aynı anda tek istek gönderiyoruz ve aralarında bekliyoruz.
- Bir site yanıt vermezse en fazla üç kez deniyor, sonra bir sonraki tura
  bırakıyoruz.

Bir kaynak çökerse ya da yavaşlarsa diğerleri çalışmaya devam eder. Tek bir
kaynağın arızası tüm derlemeyi durdurmaz.

## Metinden kayda

Duyuruyu okuma işini bir dil modeline yaptırıyoruz. Modelden yorum değil,
sayfada ne yazdığı isteniyor: saatler, tarih, yerleşim adları ve kesintinin
türü — planlı mı, dönüşümlü mü, arıza mı ([aradaki
fark](/tr/guides/outage-types)). Gelen yanıtı şemamıza göre denetliyoruz;
döndürdüğü biçime olduğu gibi hiç güvenmiyoruz.

Eskiden burada bir yığın Türkçe düzenli ifade vardı: saat biçimleri, tarih
aralıkları, "perşembe günü" gibi gün adları. Duyuru dili ilk bakışta kalıplı
görünür, ama her yeni yazım biçimi listeye bir madde daha ekletiyordu.

Modelin okuduğundan sonrası yine bize ait:

**Yer adları.** Elimizde her yerleşimin ilçesini ve alternatif yazımlarını
tutan bir liste var; modelin verdiği adları bu listeye karşı yeniden
eşleştiriyoruz, listede karşılığı çıkmayan bir ad kayda hiç girmiyor. Türkçe
büyük-küçük harf kuralları burada önemlidir: `İ` ve `I` İngilizcedeki gibi
eşlenmez ve dikkatsiz bir dönüşüm `İSKELE`'yi bozar. Yazım hatalarını yakalamak
için benzerlik eşiği yüksek tutulmuş bir eşleştirme de yapıyoruz, ama her
yaklaşık eşleşme kontrol için kaydediliyor.

**Gün hesabı.** Duyuru "perşembe günü" diyorsa günün adını modelden alıyoruz
ama tarihi kendimiz sayıyoruz — duyurunun **yayın tarihine** göre, işlemin
çalıştığı saate göre değil. Gece 00.05'te çalışan bir iş, dünün "yarın"ını
bugün diye okumamalıdır. Bu hesabı modele bıraktığımızda beş denemenin beşinde
de yanlış günü verdi; bizde ise düpedüz bir çıkarma işlemi, orada yanılma
imkânı yok.

**Bitiş saati.** Duyuruda bitiş yoksa "belirsiz" yazıyoruz, uydurmuyoruz. Gece
yarısını aşan bir aralık — 22.00 ile 02.00 arası — ertesi gün bitiyor sayılıyor.

**İlçe.** Eşleşen yerleşimlerden türetiliyor. Bir duyuru birden fazla ilçeyi
kapsıyorsa, ilçe başına ayrı kayıt oluşturuyoruz; böylece ilçeye göre süzen biri
kendi bölgesini görebiliyor.

**Başlangıç saati yoksa.** Süregelen bir arızayı duyuran haberde kesintinin
kaçta başladığı çoğu zaman yazmaz. Böyle bir kayıtta duyurunun yayın saatini
başlangıç sayıyoruz ve kartın altına **"başlangıç saati doğrulanmadı"** notunu
koyuyoruz. Bu notu gördüğünüz kesinti büyük ihtimalle yazan saatten önce
başlamıştır; arıza, insanlar bir süre elektriksiz kaldıktan sonra habere düşer.
Erken değil geç tarafta yanılmayı yeğliyoruz, ki harita kimsenin yaşamadığı bir
kesintiyi göstermesin.

Model duyuruyu çözemezse ya da tanıdık tek bir yer adı bile çıkmazsa, duyuru
sessizce atılmıyor; ham metniyle birlikte bir inceleme listesine düşüyor.

## Mükerrer kayıtlar

Beş kaynak takip edildiğinde tek bir kesinti tipik olarak dört beş kez gelir.
Bunları tek bir kayda indirmezsek okuyucu aynı olay için dört kart görür.

Kayıtları başlangıç saati, bitiş saati ve yerleşim listesine göre eşleştiriyoruz.
Kaynağın adını ve cümlelerin kuruluşunu kasten hesaba katmıyoruz — mükerrer
kayıtlar arasında farklı olan tam da bunlar.

İki ayrıntı önemli:

**Yer listelerini birleştirirken birleşimi alıyoruz.** Bir site bütün köyleri
sayar, diğeri kısaltır. Sadece tek bir sitenin listesinde geçen bir köyde
oturuyorsanız, o köyü yine de görmeniz gerekir.

**Yakın saatleri aynı olay sayıyoruz.** Haber siteleri saatleri yuvarlar; on beş
dakikadan az fark ve örtüşen yer listeleri varsa bunu tek olay kabul ediyoruz.

## Düzeltmeler ve iptaller

Duyurular değişir. Bir çalışma iptal edilirse kayıt yeni bir kayıt olarak
eklenmez; mevcut kayıt **geri çekilir**. Geri çekilen kayıtlar aktif ve yaklaşan
listelerinden düşer ama arşivde iptal edilmiş olarak kalır.

**Hiçbir kaydı silmiyoruz.** Düzeltmeler güncelleme olarak işlenir. Arşivin
değeri geçmişin bozulmadan durmasına bağlıdır.

## Veriler eskirse ne oluyor

Sayfanın üstünde son güncelleme saati yazar. Bu değer, başarıyla tamamlanan son
derleme işleminden gelir; sabit bir yazı değildir.

Son başarılı kontrol bir saatten eskiyse bunu sayfada açıkça söylüyoruz. Eski
veriyi güncelmiş gibi göstermek, dürüst bir boşluktan daha kötüdür.

## Bilerek yapmadıklarımız

**Haber metinlerini saklamıyor ve yeniden yayımlamıyoruz.** Yalnızca yapısal
bilgileri çıkarıyoruz: tarih, saat, yer adları ve kesinti türü. Yazının kendisi
kaynağındadır ve oraya bağlantı veriyoruz. Bu hem telif açısından doğru olan hem
de bir haber sitesinin emeğine saygı gösteren yaklaşımdır.

**Facebook'u ya da giriş gerektiren hiçbir yeri taramıyoruz.** Bunun için ya
elde edemeyeceğimiz bir erişim anahtarı ya da platformun kurallarını çiğneyen
bir oturum gerekir. Kamusal bir hizmet bunun üzerine kurulmaz.

**Kişisel veri toplamıyoruz.** Kimin hangi köye baktığını bilmiyoruz ve bu
sitenin çalışması için buna ihtiyacımız yok.

## Hata bulursanız

Bir kaydın yanlış olduğunu görürseniz bize yazın: <fathgnc.dev@gmail.com>.
Kartın bağlantısını ve neyin yanlış olduğunu göndermeniz yeterli.

Köyünüz bir duyuruda geçtiği hâlde burada görünmüyorsa, bu genellikle yer adı
listemizde eksik bir yazım olduğu anlamına gelir ve düzeltilmesi kolaydır.

Kesin bilgi her zaman KIB-TEK'in kendi duyurusudur. Bu site onun yerine geçmez.
