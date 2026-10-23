# Pro Clubs İstatistik Sitesi (EAST UP FC & SOKANTE FC)

Tamamen ücretsiz çalışır: **GitHub Pages** siteyi yayınlar, **GitHub Actions** her 30 dakikada bir EA'dan maçları çekip `data/` klasörüne kaydeder.

## Kurulum (yaklaşık 10 dakika)

1. **GitHub hesabı açın** (github.com) ve yeni bir repo oluşturun. Örnek ad: `proclubs`. Repo **Public** olmalı (Pages ücretsiz planda public repo ister).
2. Bu klasördeki **tüm dosyaları** repoya yükleyin: *Add file → Upload files*. Gizli klasörler de yüklenmeli (`.github` ve `.nojekyll`). Tarayıcı `.github` klasörünü göstermezse aşağıdaki "Workflow dosyası" adımına bakın.
3. **Yazma izni:** *Settings → Actions → General → Workflow permissions* bölümünde **Read and write permissions** seçin ve kaydedin.
4. **Siteyi açın:** *Settings → Pages → Source: Deploy from a branch → Branch: main / (root)* seçip kaydedin. 1-2 dakika sonra adres görünür: `https://KULLANICIADI.github.io/proclubs/`
5. **İlk veri çekimi:** *Actions* sekmesinde **Maçları topla → Run workflow** butonuna basın. Sonra log'a bakın:
   - `EAST UP FC -> clubId 1234567` gibi satırlar görünmeli.
   - `Bitti: X yeni maç` yazmalı.

### Workflow dosyası
`.github` klasörü yüklenmediyse repoda *Add file → Create new file* seçin. Dosya adına `.github/workflows/collect.yml` yazın ve bu klasördeki aynı dosyanın içeriğini yapıştırın.

## Ayarlar (`config.json`)
- `platform`: `common-gen5`. PS5, Xbox Series ve PC crossplay'de aynı havuzda olduğu için PC ve PS5 oyuncularınız aynı kulüpte sorunsuz görünür.
- Kulüp adı aramada bulunamazsa ya da yanlış kulüp gelirse ID'yi elle yazın: `"clubId": "1234567"`. ID'yi bulmak için proclubs.ea.com'da kulübünüzü açın; adres çubuğunda `clubId=` kısmında yazar.
- `matchTypes`: lig, playoff ve hazırlık maçları. EA hazırlık maçlarını vermiyorsa log'da uyarı görünür, sorun değil.

## Bilinmesi gerekenler
- **Sadece son maçlar:** EA her türde sadece son ~10 maçı verir. Sistem çalıştığı sürece maçlar birikir, ama kurulumdan önceki eski maçlar gelmez. "EA Sezon Toplamı" sekmesi ise EA'nın tuttuğu tüm zamanlar toplamını gösterir.
- **Oyuncu eşleştirme:** Oyuncular istatistiklerde adlarına göre birleşir. Bir kişi iki kulüpte de oynuyorsa toplamları tek satırda görünür.
- **Sarı kart:** EA API'si genelde sadece kırmızı kartı veriyor. Sarı kart verisi gelirse sütun kendiliğinden görünür.
- **EA engeli:** Actions log'unda sürekli `HTTP 403` görürseniz EA, GitHub sunucularını engelliyor demektir. Bu durumda toplayıcıyı kendi bilgisayarınızda çalıştırın:
  1. Node.js 20 kurun (nodejs.org).
  2. Repoyu bilgisayarınıza klonlayın.
  3. Klasörde `node scripts/collect.mjs` çalıştırın.
  4. Ardından `git add data && git commit -m veri && git push` ile yükleyin.
  Bunu Windows Görev Zamanlayıcı ile otomatik hale getirebilirsiniz.
- **Zamanlama:** GitHub'ın zamanlanmış görevleri yoğunlukta birkaç dakika gecikebilir. Bu normaldir.
- **API resmi değil:** EA formatı değiştirirse `scripts/collect.mjs` güncellenmeli.

## Yerelde deneme
```
node scripts/collect.mjs
npx serve .        # veya: python -m http.server
```
