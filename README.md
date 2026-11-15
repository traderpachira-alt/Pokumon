# Tahta — BIST Analiz

BIST hisseleri için kişisel bir analiz arayüzü: **tarama**, **teknik analiz** ve **temel analiz**.
Tarayıcıda çalışır, telefonda ana ekrana eklenince uygulama gibi açılır (PWA).

## Ne var?

- **Tarama:** BIST TÜM'deki tüm hisseler (~580); her hissenin BIST 30 / 50 / 100 / TÜM etiketi.
  Fiyat / Trend / Momentum / Temettü / Temel sütun grupları, BIST 30/50/100/TÜM ve Yıldız/Ana/Alt/YİP etiketi, sıralama, endeks ve sektör filtresi,
  kendi filtrelerin (ör. `RSI 14 < 30`, `F/K < 8`) ve hazır taramalar (aşırı satım/alım, güçlü trend,
  golden cross, MACD / Supertrend / Fisher al, Stoch RSI dipte, bulut üstünde, 52H zirvesi, hacim patlaması,
  ucuz, kârlı büyüme). ★ ile izleme listesi.
- **Temettü:** açıklanmış ama henüz ödenmemiş temettüler (tarihli ya da "tarih bekleniyor"), son 12 ay verim ve hisse başı tutar, son ödeme, 12 ayda ödeme sayısı, son 5 yılda kaç yıl ödediği,
  kesintisiz yıl, temettü değişimi, 5 yıllık ortalama verim, dağıtma oranı; hisse sayfasında ödeme geçmişi.
- **Tedbir uyarısı:** tedbirli hissenin yanında ⚠; üzerine gelince/dokununca tedbirler.
- **Kayıtlı taramalar:** filtre + endeks + sektör + hazır tarama kombinasyonunu adıyla kaydet, tek dokunuşla aç.
- **Hisse detayı:** mum grafik + hacim; katmanlar: SMA20/50/200, VWMA20, Bollinger, Ichimoku, Supertrend;
  alt paneller: RSI, Stoch RSI, MACD, Fisher, ATR. Getiriler, 52 haftalık aralık, teknik özet,
  sektör medyanıyla karşılaştırmalı temel oranlar, aynı sektördeki hisseler.
- **Karşılaştır:** en fazla 5 hisse + BIST 100, dönem başı = 100; dönem getirisi, BIST 100'e göre fark,
  en büyük düşüş ve volatilite tablosu.
- **Portföy:** alım/satım işlemleriyle yönetilir (tarih, adet, fiyat, komisyon); ortalama maliyet ve
  gerçekleşen K/Z ortalama maliyet yöntemiyle hesaplanır, tamamı satılanlar "Kapanan pozisyonlar"a geçer.
  TL nakit akışı: alımlar TL bakiyeden ya da dışarıdan, satış gelirleri TL bakiyeye ya da portföy dışına;
  para yatır/çek; net yatırılan ve toplam getiri. Hak kullanımı gerçekleşen temettüler (hak kullanımından önceki gün
  sonunda eldeki adetle) tespit edilir, net tutar ve hedef (TL bakiye / portföy dışı) kullanıcıya onaylatılır.
  Kategoriler: *Temettü* (verim, maliyete göre verim, yıllık beklenen temettü,
  sıradaki temettü), *Trend / Momentum* (Supertrend, trend, RSI; trend bozulunca "Çıkış sinyali"),
  *Emtia / İtibari* (gram altın, gram gümüş, TL, dolar, euro), *Kripto* (BTC, ETH, SOL, BNB, USDT, USDC): USDT/USDC TL ile alınır; BTC/ETH/SOL/BNB USDT ya da
  USDC bakiyesiyle (fiyat $ cinsinden), TL karşılığı işlem günü kuruyla hesaplanır. Toplam değer, kâr/zarar, günlük değişim,
  kategori dağılımı. Veriler yalnızca cihazda saklanır.
- **Bulut senkronizasyonu (isteğe bağlı):** portföy, izleme listesi ve kayıtlı taramalar kullanıcının kendi özel
  GitHub Gist'inde tutulur; erişim anahtarı (yalnızca `gist` yetkisi) sadece cihazın tarayıcısında saklanır.
  Açılışta, uygulamaya dönünce ve değişiklikten sonra eşitlenir; iki cihaz habersiz değiştirirse sorulur.
  Site bağlantısı paylaşılabilir: başkaları kendi (boş) portföyünü görür.
- **Aktar:** izleme listesi, kayıtlı taramalar ve portföyü bir kod ya da bağlantıyla başka cihaza taşı.
- **Güncelleme uyarısı:** yeni sürüm yayınlanınca uygulamada "Yeni sürüm hazır · Yenile" çıkar.

## Veri kaynakları

| Veri | Kaynak | Sıklık |
|---|---|---|
| Fiyat, hacim, temettü (5 yıl, günlük; bölünmelere göre düzeltilmiş) | Yahoo Finance (~15 dk gecikmeli) | seans boyunca saatte bir |
| Pazar (Yıldız/Ana/Alt/YİP) | KAP Pazarlar sayfası | günde bir |
| Dolar, euro, gram altın, gram gümüş, kripto (TL) | Yahoo Finance (USDTRY, EURTRY, ons altın/gümüş × kur, BTC-USD vb. × kur) | seans boyunca saatte bir |
| Tedbirler | GCM Yatırım tedbir listesi + `scripts/tedbirler.csv` | her çalışmada |
| Açıklanmış (ödenmemiş) temettüler, net | temettuhisseleri.com temettü tarihleri sayfası | 6 saatte bir |
| Endeks bileşenleri (BIST 30/50/100/TÜM) | Borsa İstanbul resmi dosyası | her çalışmada |
| Sektör, halka açıklık, piyasa değeri | İş Yatırım özet tablosu | 6 saatte bir |
| Bilanço, gelir tablosu, nakit akışı (TL) | İş Yatırım mali tablolar | şirket başına 3 günde bir |

Temel oranlar güncel fiyat ve son 12 ay (TTM) mali tablolarla **burada hesaplanır**:
F/K = piyasa değeri / TTM net kâr (ana ortaklık), PD/DD = piyasa değeri / ana ortaklık özkaynakları,
FD/FAVÖK = (piyasa değeri + net finansal borç) / TTM (faaliyet kârı + amortisman),
büyüme oranları yılbaşından bu yana geçen yılın aynı dönemine göre. Banka ve sigorta şirketlerinde
satışa dayalı oranlar (marj, FD/FAVÖK, borç/ÖK) hesaplanmaz.

## Kurulum (bir kez)

1. GitHub'da depo → **Settings → Pages → Build and deployment → Source: "GitHub Actions"** seçin.
   (Özel/private depoda Pages için ücretli GitHub planı gerekir; ücretsiz planda depoyu public yapmak gerekir.)
2. **Actions** sekmesi → "Veriyi güncelle ve yayınla" → **Run workflow**. ~3–5 dk sonra site
   `https://<kullanıcı-adı>.github.io/<depo-adı>/` adresinde açılır.
3. Telefonda: siteyi açın → iPhone'da Paylaş → *Ana Ekrana Ekle*; Android'de menü → *Uygulamayı yükle*.

## Yerelde deneme

```bash
pip install -r scripts/requirements.txt
scripts/dev.sh          # ÖRNEK (rastgele) veriyle, internet gerekmez
scripts/dev.sh --real   # gerçek veriyle
# -> http://localhost:8000
```

## Bilinen sınırlar

- Yahoo ve İş Yatırım resmi API değildir; sayfa yapıları değişirse veri çekme bozulabilir. Hisselerin
  yarısından azının fiyatı alınırsa yayın yapılmaz, önceki sürüm yayında kalır. İş Yatırım'a ulaşılamazsa
  son önbellekteki mali tablolar kullanılır.
- Mali tablolar sunucuyu yormamak için çalışma başına en fazla 150 şirket için çekilir; ilk kurulumda
  tümünün dolması birkaç çalışma (birkaç saat) sürer.
- Enflasyon muhasebesi (TMS 29) nedeniyle TTM toplamları farklı satın alma gücündeki dönemleri birleştirir;
  oranlar yaklaşık değerlerdir. Leasing/faktoring gibi bazı şirketler için mali tablo bulunmaz.
- Ichimoku bulutu bugünkü tarihe hizalı çizilir (26 günlük ileri kısım gösterilmez).
- Yahoo'nun eski temettü kayıtlarında ara sıra hata olabilir (ör. TUPRS 2023/09 tutarı iki kat görünüyor).
- Kişisel kullanım içindir, yatırım tavsiyesi değildir.
