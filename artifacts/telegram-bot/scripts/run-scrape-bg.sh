#!/bin/bash
# Background scrape runner — jalankan scrape + notif Telegram owner saat selesai
# Usage: bash scripts/run-scrape-bg.sh

BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
OWNER_ID="${OWNER_TELEGRAM_ID}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_DIR="$(dirname "$SCRIPT_DIR")"
LOG="/tmp/scrape-anisub-bot.log"
DATA_DIR="$BOT_DIR/data"

send_tg() {
  local text="$1"
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d chat_id="${OWNER_ID}" \
    -d parse_mode="HTML" \
    --data-urlencode "text=${text}" > /dev/null 2>&1
}

send_tg_doc() {
  local filepath="$1"
  local caption="$2"
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument" \
    -F chat_id="${OWNER_ID}" \
    -F caption="${caption}" \
    -F document=@"${filepath}" > /dev/null 2>&1
}

echo "[$(date)] Scrape AniSub dimulai (resume mode)..." | tee "$LOG"

# Notif mulai
send_tg "⚙️ <b>Scrape AniSub dimulai (background)</b>

🔄 Mode: <b>RESUME</b> — skip yang sudah done, fetch anime baru dari OtakuDesu
📋 Master list di-refresh untuk detect anime baru

Nanti laporan dikirim otomatis saat selesai ✅"

# Hapus master list supaya re-fetch dari OtakuDesu (dapat anime baru 1881+)
rm -f "$DATA_DIR/anime-master-list.json"
echo "[$(date)] Master list dihapus — akan re-fetch dari OtakuDesu" | tee -a "$LOG"

# Jalankan scraper
cd "$BOT_DIR"
node scripts/scrape-anime-data.js --resume >> "$LOG" 2>&1
EXIT_CODE=$?

echo "[$(date)] Scraper selesai dengan exit code: $EXIT_CODE" | tee -a "$LOG"

if [ $EXIT_CODE -eq 0 ]; then
  # Baca hasil dari progress file
  TOTAL=$(node -e "
    const p=require('./data/scrape-progress.json');
    const cu=require('./data/cache-urls.json') || {};
    const done=Object.values(p.done||{});
    console.log([
      done.length,
      (p.failed||[]).length,
      done.filter(a=>a.anilistId).length,
      done.filter(a=>a.banner).length,
      done.filter(a=>a.trailer).length,
      done.filter(a=>a.characters?.length>0).length,
      cu.fullCacheUrl||'-',
      cu.totalAnime||done.length
    ].join('|'));
  " 2>/dev/null || echo "0|0|0|0|0|0|-|0")

  IFS='|' read -r DONE FAILED ANILIST BANNER TRAILER CHARS CACHE_URL TOTAL_ANIME <<< "$TOTAL"

  send_tg "✅ <b>Scrape AniSub Selesai!</b>

████████████████ 100%

📊 <b>Hasil:</b>
• Total selesai  : <b>${DONE}</b> anime
• Gagal (no AL)  : <b>${FAILED}</b>
• AniList match  : <b>${ANILIST}</b>
• Banner HD      : <b>${BANNER}</b>
• Trailer        : <b>${TRAILER}</b>
• Karakter + VA  : <b>${CHARS}</b>

📦 <b>Cache GitHub:</b> ${TOTAL_ANIME} anime
<a href=\"${CACHE_URL}\">Download anisub-full-cache.json</a>

<i>Laporan lengkap dikirim di bawah...</i>"

  # Generate & kirim laporan TXT
  REPORT_FILE="/tmp/anisub-scrape-report-$(date +%Y%m%d-%H%M%S).txt"
  node -e "
    const { generateReport } = require('./commands/scrapeanisub.js');
    require('fs').writeFileSync('$REPORT_FILE', generateReport());
    console.log('report ok');
  " 2>/dev/null

  if [ -f "$REPORT_FILE" ]; then
    send_tg_doc "$REPORT_FILE" "📄 Laporan scrape AniSub lengkap"
    rm -f "$REPORT_FILE"
  fi

  # Kirim anisub-full-cache.json sebagai dokumen ke owner
  CACHE_FILE="$DATA_DIR/anisub-full-cache.json"
  if [ -f "$CACHE_FILE" ]; then
    CACHE_SIZE=$(du -sh "$CACHE_FILE" | cut -f1)
    send_tg "📦 Mengirim file <b>anisub-full-cache.json</b> (${CACHE_SIZE}) ke Telegram..."
    send_tg_doc "$CACHE_FILE" "📦 anisub-full-cache.json — cache lengkap AniSub (${TOTAL_ANIME} anime)"
  fi

else
  # Kirim error
  LAST_LINES=$(tail -20 "$LOG" | tr '"' "'" | head -c 800)
  send_tg "❌ <b>Scrape AniSub GAGAL</b> (exit code ${EXIT_CODE})

<code>${LAST_LINES}</code>

Log lengkap di: $LOG"

  # Kirim log file sebagai dokumen
  if [ -f "$LOG" ]; then
    send_tg_doc "$LOG" "❌ Log scrape AniSub (error)"
  fi
fi

echo "[$(date)] Script selesai." | tee -a "$LOG"
