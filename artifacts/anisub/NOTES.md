# Anisub — Catatan Teknis (Season Lineup & Video Banner)

## 1. Kenapa Lineup Musim Bisa Kosong (0 judul)?

### Penyebab utama: JIKAN / MAL upstream down
- Halaman Musim mengambil data dari **`/api/jikan/season-future`** di API Server
- API Server memanggil **JIKAN v4** → yang memanggil **MyAnimeList backend**
- MAL sering 504/timeout, terutama untuk musim mendatang (Fall, Winter, Spring)

### Fallback yang sudah ada
```
MAL (JIKAN) → gagal? → AniList GraphQL backup → gagal? → tampil error "sementara tidak tersedia"
```
Jika JIKAN 504:
- API Server otomatis coba **AniList** sebagai backup
- Jika AniList juga gagal → UI tampil pesan "Lineup sementara tidak tersedia dari MAL"
- **Ini BUKAN bug** — memang upstream-nya sedang down

### Cara force-refresh cache
1. Via API langsung: `POST /api/jikan/warm`
2. Atau tunggu — cache auto-refresh tiap 1 jam

---

## 2. Data Lineup Tidak Muncul Setelah RemixGitHub?

### Masalah
Saat workspace di-remix via `/remixgithub`, bot mendapat workspace baru yang perlu setup.
Lineup data **tidak disimpan di file** — selalu di-fetch fresh dari MAL/AniList.

### Solusi & Panduan Setup
Setelah remix, pastikan API Server berjalan:

1. **Jalankan workflow `artifacts/api-server: API Server`**
   ```
   pnpm --filter @workspace/api-server run dev
   ```

2. **Tunggu cache warm** (otomatis saat server start)
   - Log: `JIKAN warm complete — lineup 4 musim ready`
   - Durasi: ~5–30 detik tergantung kondisi MAL

3. **Jika MAL down** (paling umum penyebab 0 judul):
   - Buka halaman Musim, tunggu beberapa menit
   - Data dari AniList akan muncul sebagai fallback
   - UI akan menampilkan badge "via AniList" kalau data dari backup

4. **Cek log API Server** untuk diagnosa:
   ```
   JIKAN: season lineup fetched → OK
   JIKAN: warm failed for season → MAL down, coba AniList
   ```

### Kenapa Tidak Disimpan Permanen?
- Data lineup MAL/AniList berubah tiap minggu (penambahan judul baru)
- Menyimpan stale data lebih buruk dari "sementara kosong"
- Cache 1 jam di API Server cukup untuk mencegah spam request

---

## 3. Video Banner Musim

### Cara Kerja
Halaman Musim menampilkan **video banner** yang bisa diganti via command `/setmusim` di Telegram Bot.

File disimpan di:
```
artifacts/anisub/public/banners/
  season-summer.mp4
  season-fall.mp4
  season-winter.mp4
  season-spring.mp4
```

### Fallback
Jika video gagal load atau belum di-set:
- Banner otomatis fallback ke **CSS gradient + particle animation** sesuai musim

### Update via RemixGitHub
- File video di-commit ke GitHub repo
- Saat `/remixgithub` → video ikut ter-copy ke workspace baru ✅
- **Tidak perlu upload ulang** setelah remix

---

## 4. Banner Mengikuti Tab Musim Aktif

Banner di bagian atas halaman Musim mengikuti tab yang sedang aktif:
- Klik tab **Summer** → banner berubah ke tema Summer (oranye/kuning + video summer)
- Klik tab **Fall** → banner berubah ke tema Fall (merah-oranye + video fall)
- dst.

Tab pertama = musim terdekat/mendatang (default aktif saat halaman dibuka).

---

## 5. API Endpoint Referensi

| Endpoint | Fungsi |
|---|---|
| `GET /api/jikan/season-future` | 4 musim ke depan (utama, cached 1 jam) |
| `GET /api/jikan/season/:year/:season` | 1 musim spesifik |
| `GET /api/jikan/cache-status` | Status cache JIKAN (debug) |
| `POST /api/jikan/warm` | Force-refresh cache 4 musim |
| `GET /api/healthz` | Health check API Server |
