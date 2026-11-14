# Tahta — BIST Analiz

BIST hisseleri için kişisel bir analiz arayüzü: **tarama**, **teknik analiz** ve **temel analiz**.
Tarayıcıda çalışır, telefonda ana ekrana eklenince uygulama gibi açılır (PWA).

## Ne var?

- **Tarama:** ~90 likit BIST hissesi; Fiyat / Teknik / Temel sütun grupları, sıralama, sektör filtresi,
  kendi filtrelerin (ör. `RSI 14 < 30`, `F/K < 8`) ve hazır taramalar: aşırı satım/alım, güçlü trend,
  golden cross, MACD al, 52 hafta zirvesi, hacim patlaması, ucuz, kârlı büyüme. ★ ile izleme listesi.
- **Hisse detayı:** mum grafik + hacim, SMA20/50/200, Bollinger, RSI ve MACD panelleri (1A–2Y);
  getiriler, 52 haftalık aralık, teknik özet ve sektör medyanıyla karşılaştırmalı temel oranlar;
  aynı sektördeki hisseler.
- Filtreler, izleme listesi ve grafik ayarları tarayıcıda saklanır.

## Nasıl çalışıyor?

Sunucu yok. GitHub Actions hafta içi seans boyunca saatte bir (TSİ 10:25–18:25)
`scripts/fetch_data.py` ile Yahoo Finance'ten veriyi çeker, JSON'a çevirir ve `web/` arayüzüyle
birlikte GitHub Pages'te yayınlar. Veri **gecikmelidir** (yaklaşık 15 dk; son çalışma günün kapanışını alır).

```
scripts/fetch_data.py   veri çekme + göstergeler -> site/data/summary.json, site/data/hist/<KOD>.json
scripts/tickers.txt     taranan hisseler (düzenlenebilir)
web/                    arayüz (HTML/CSS/JS, PWA, grafik kütüphanesi: TradingView Lightweight Charts)
.github/workflows/update.yml   zamanlanmış güncelleme ve yayın
```

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

- Yahoo'nun BIST **temel verileri** eksik ya da hatalı olabilir. Finansallarını USD/EUR ile raporlayan
  şirketlerde (ör. THYAO) F/K, PD/DD ve FD/FAVÖK para birimleri karıştırılarak hesaplanabiliyor;
  arayüz bunları ⚠ ile işaretler ve "Ucuz" taramasından çıkarır.
- Yahoo resmi bir API değildir; zaman zaman hız sınırı/kesinti olabilir. Hisselerin yarısından azı
  alınırsa yayın yapılmaz, önceki sürüm yayında kalır.
- Kişisel kullanım içindir, yatırım tavsiyesi değildir.
