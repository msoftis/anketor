# 📊 ANKETOR - Modern Anket Yönetimi & Yanıt Simülasyon Platformu

Kendi sunucunuzda veya yerelinizde çalışan, dışarıya yayınlanabilir, gerçek katılımcı yanıtlarını toplayabilen ve aynı zamanda tek tıkla veya canlı akışla otomatik test yanıtları üretebilen tam teşekküllü web platformu.

---

1. **📄 Word (.docx) Dosyasından Akıllı İçe Aktarma:**
   * Word veya metin belgenizi sürükleyip bırakarak yükleyin.
   * Başlık, soru numaraları, şıklar (A, B, C, D...), onay kutuları ve puanlama skalaları otomatik tespit edilir.
   * Tespit edilen soruları önizleyebilir, tasarlayıcıda dilediğiniz gibi düzenleyebilir veya doğrudan yayına alabilirsiniz.

2. **Anket Tasarlayıcı (Survey Builder):**
   * Tekli Seçim (Radyo butonu)
   * Çoktan Seçmeli (Onay kutusu / Checkbox)
   * Yıldız Puanlama (1-5 Puan)
   * Açılır Liste (Dropdown)
   * Açık Uçlu Yazılı Görüş (Metin alanı)
   * Zorunlu / İsteğe bağlı soru kontrolleri
   * Özel tema renkleri (Indigo, Mor, Zümrüt Yeşili, Turkuaz, Kehribar, Gül pembesi)

2. **⚡ Otomatik Yanıt Simülatörü (Random Response Generator):**
   * İstediğiniz anketi seçip kaç adet yanıt üretileceğini belirleyin (Örn: 20, 50, 100, 500 veya özel sayı).
   * **Hızlı Mod (Batch):** Saniyeler içinde yüzlerce yanıtı üretir ve kaydeder.
   * **Canlı Akış (Canlı Simülasyon):** Ayarlanabilir hızda (saniyede 1-12 anket) tek tek üretip canlı ilerleme çubuğu ve akış günlüğüyle ekrana yansıtır.

3. **📱 Katılımcı Arayüzü (`/s/:id`):**
   * Mobil öncelikli, ultra hızlı ve modern karanlık mod cam (glassmorphism) tasarımı.
   * Dinamik ilerleme çubuğu, anlık form doğrulaması ve kutlama ekranı.

4. **📈 Canlı Analitik & Sonuç Grafikleri:**
   * Sorulara göre canlı çubuk grafikler, yüzde oranları ve oy sayıları.
   * Yıldız ortalamaları ve derecelendirme dağılımı.
   * Açık uçlu metin yanıtlarını filtreleme ve okuma.
   * Gelen yanıtları tek tek inceleme veya silme.
   * **Excel CSV Dışa Aktarma:** Türkçe karakter (ç, ğ, ı, ö, ş, ü) uyumlu UTF-8 BOM formatında.
   * **JSON Dışa Aktarma:** Tam veri yedekleme.

5. **🌐 Dış Dünyaya Yayınlama & Wi-Fi Paylaşımı:**
   * Aynı Wi-Fi ağındaki cep telefonları için hazır yerel ağ IP linki ve otomatik oluşturulan QR kod.
   * İnternete açmak için Cloudflare Tunnel veya Ngrok entegrasyonu.

---

## 🚀 Nasıl Çalıştırılır?

### Kolay Başlatma (Windows):
Proje klasöründeki `baslat.bat` dosyasına çift tıklamanız yeterlidir. Tarayıcınız otomatik olarak açılacaktır.

### Terminalden Başlatma:
```bash
npm start
```

Tarayıcınızdan açın:
* **Admin Paneli:** [http://localhost:3000](http://localhost:3000)
* **Örnek Anket:** [http://localhost:3000/s/s_ornek101](http://localhost:3000/s/s_ornek101)

---

## 🌍 İnternete Açma Rehberi (Tüm Dünyayla Paylaşma)

### Seçenek 1: Cloudflare Tunnel (Önerilen - Ücretsiz & Hızlı)
Bilgisayarınızda açık olan anketi hiçbir modem port yönlendirmesi yapmadan güvenli bir HTTPS internet linkine dönüştürür:
```bash
npx untun tunnel --port 3000
```
veya Cloudflare CLI ile:
```bash
cloudflared tunnel --url http://localhost:3000
```
Size anında `https://xyz.trycloudflare.com` şeklinde bir link verir. Bu linki dilediğiniz herkese gönderebilirsiniz!

### Seçenek 2: Render.com / Railway (7/24 Kesintisiz Bulut Sunucu)
Bilgisayarınız kapalıyken bile anketlerin çalışması için:
1. Bu klasörü GitHub'a yükleyin.
2. [Render.com](https://render.com)'a ücretsiz kaydolup "New Web Service" seçin.
3. Build Command: `npm install`, Start Command: `npm start` yazın.
4. Anket sisteminiz 7/24 ücretsiz olarak dünya çapında yayında kalır!

---

## 💾 Veri Saklama
* Tüm anketler `data/surveys.json` dosyasında tutulur.
* Gelen tüm yanıtlar `data/responses.json` dosyasında güvenle saklanır ve otomatik yedeklenir.
