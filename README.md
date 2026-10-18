# Raid!

Bir ilaç böcekleri dev yaptı; Yılmaz ailesi evini oda oda geri alıyor. Tarayıcıda, telefonda ve bilgisayarda oynanan şerit savunma oyunu. Saf HTML5 Canvas + JavaScript, build adımı yok.

## GitHub Pages'e yükleme

1. GitHub'da yeni bir repo aç (ör. `raid`).
2. Bu klasörün **içindekileri** (index.html, game.js, assets/, tools/) repoya yükle: repo sayfasında **Add file → Upload files**, dosyaları sürükle bırak, **Commit changes**.
3. **Settings → Pages → Branch: main, klasör: / (root) → Save**.
4. Birkaç dakika sonra oyun `https://<kullanıcı-adın>.github.io/raid/` adresinde açılır.

Bilgisayarda denemek için klasörde `python3 -m http.server` çalıştırıp `http://localhost:8000` adresini aç.

## Oyunda neler var (v0.3)

- Çocuk Odası'nda 10 bölüm. 1. bölüm adım adım öğretici.
- Özel bölümler: Oyuncak Treni (kartlar banttan gelir), Elektrik Kesildi (karanlık), Pamuk'u Koru, Kraliçe Karınca (boss).
- Her bölümde 3 yıldız hedefi; kazandıkça altın.
- Atölye: altınla birimleri 3 seviyeye kadar geliştir.
- Defne'nin Kitabı: karşılaştığın böcekler ve planların.
- Günün Görevi (her gün farklı kural) ve Sonsuz Baskın (rekor modu).
- Kodla üretilen müzik, ses/müzik ayarı, telefonda titreşim.
- Henüz görseli olmayan Pamuk ve Kraliçe kodla çiziliyor. `assets/char_pamuk.png` ve `assets/bug_queen_ant.png` eklenince oyun otomatik onları kullanır.

## Kontroller

- Kart seç → halıda bir kareye dokun/tıkla. Klavyede 1–6 kart seçer.
- Vidalara dokunarak topla (menüden otomatik toplama açılabilir).
- Kürek birimi kaldırır. Sağ üstte hız (1×/2×) ve duraklatma; Esc/P de duraklatır.

## Dosyalar

- `index.html` — sayfa, menüler, stil
- `game.js` — oyun döngüsü, birimler (`UNITS`), böcekler (`BUGS`), bölümler (`LEVELS`), halı yerleşimi (`RUG`)
- `assets/` — hazırlanmış görseller (zemini silinmiş PNG'ler, arka planlar JPG)
- `tools/prepare_assets.py` — yapay zekâ çıktılarını oyuna hazırlayan betik (zemin silme, kırpma, sprite sayfası bölme)
