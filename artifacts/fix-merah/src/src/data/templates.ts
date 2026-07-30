import { EmailTemplate } from "../types";

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // TEMPLATE 1 — Formal Professional Appeal (Jebol Rate Tinggi)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 1,
    name: "Formal Professional",
    subject: "Appeal: WhatsApp Account {nomor} — Login Unavailable Error | Urgent Manual Review Request",
    description: "Template formal & profesional versi terkuat. Bahasa resmi, bukti lengkap, permintaan spesifik. Cocok untuk percobaan pertama.",
    color: "#00ff88",
    icon: "🛡️",
    htmlBody: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WhatsApp Account Appeal</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',Arial,sans-serif;background:#eef2f7;color:#1a1a2e}
  .wrapper{max-width:680px;margin:24px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.12)}
  .hdr{background:linear-gradient(150deg,#043d30 0%,#075E54 45%,#128C7E 80%,#25D366 100%);padding:48px 44px 40px;text-align:center;position:relative}
  .hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)}
  .wa-logo{width:72px;height:72px;background:rgba(255,255,255,.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;border:2px solid rgba(255,255,255,.3)}
  .wa-logo svg{width:44px;height:44px}
  .hdr-badge{display:inline-block;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);color:#fff;font-size:10px;font-weight:700;padding:4px 14px;border-radius:100px;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px}
  .hdr h1{color:#fff;font-size:26px;font-weight:800;letter-spacing:-.4px;line-height:1.25}
  .hdr p{color:rgba(255,255,255,.78);font-size:13.5px;margin-top:7px}
  .priority{background:#dc2626;color:#fff;text-align:center;padding:9px;font-size:10.5px;font-weight:700;letter-spacing:2px}
  .body{padding:44px}
  .greeting{font-size:15px;color:#333;margin-bottom:20px;line-height:1.7}
  p{font-size:14.5px;line-height:1.85;color:#4a4a60;margin-bottom:16px}
  strong{color:#1a1a2e}
  .error-box{background:#fef2f2;border:1.5px solid #fca5a5;border-radius:14px;padding:20px 24px;margin:24px 0;display:flex;gap:14px;align-items:flex-start}
  .error-icon{font-size:22px;flex-shrink:0}
  .error-text{font-size:13.5px;color:#7f1d1d;line-height:1.75;font-style:italic}
  .error-label{font-size:10px;font-weight:700;color:#dc2626;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px}
  .info-card{background:linear-gradient(135deg,#f0fff8,#f8fffd);border:1px solid #bbf7d0;border-radius:16px;padding:26px;margin:26px 0;position:relative;overflow:hidden}
  .info-card::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:linear-gradient(180deg,#25D366,#075E54)}
  .info-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px dashed #bbf7d0}
  .info-row:last-child{border-bottom:none;padding-bottom:0}
  .info-label{font-size:11px;font-weight:700;color:#6b8c7a;text-transform:uppercase;letter-spacing:.5px}
  .info-value{font-size:13.5px;font-weight:700;color:#0a2418}
  .ok-val{color:#16a34a!important}
  .err-val{color:#dc2626!important}
  .evidence{background:#f8fffe;border:1px solid #d1fae5;border-radius:14px;padding:22px;margin:24px 0}
  .evidence-title{font-size:10.5px;font-weight:700;color:#25D366;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px}
  .ev-item{display:flex;gap:10px;padding:7px 0;border-bottom:1px dashed #d1fae5;font-size:13.5px;color:#374151;align-items:flex-start}
  .ev-item:last-child{border-bottom:none}
  .ev-item::before{content:'✓';color:#25D366;font-weight:800;flex-shrink:0;margin-top:1px}
  .steps-box{background:#f8fffe;border-radius:14px;padding:22px;margin:24px 0;border:1px solid #d1fae5}
  .steps-title{font-size:10.5px;font-weight:700;color:#25D366;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px}
  .step{display:flex;gap:14px;margin-bottom:14px;align-items:flex-start}
  .step:last-child{margin-bottom:0}
  .step-num{flex-shrink:0;width:30px;height:30px;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}
  .step-text{font-size:13.5px;color:#4a4a60;line-height:1.7;padding-top:4px}
  .request-box{background:linear-gradient(145deg,#043d30,#075E54);border-radius:18px;padding:28px 32px;margin:28px 0;text-align:center}
  .request-box h3{color:#fff;font-size:18px;font-weight:800;margin-bottom:10px}
  .request-box p{color:rgba(255,255,255,.82);font-size:13px;line-height:1.75;margin:0}
  .req-list{text-align:left;margin-top:16px;border-top:1px solid rgba(255,255,255,.15);padding-top:16px}
  .req-item{display:flex;gap:10px;font-size:13px;color:rgba(255,255,255,.88);padding:5px 0}
  .req-item::before{content:'→';color:#4ade80;flex-shrink:0}
  .sign{margin-top:32px;padding-top:24px;border-top:1px dashed #d1fae5}
  .footer{background:#f0fff8;padding:24px 44px;border-top:1px solid #d1fae5;text-align:center}
  .footer p{font-size:11.5px;color:#8a9a8a;line-height:1.7}
  .ref{font-family:monospace;background:#e8f5e9;padding:2px 8px;border-radius:5px;font-size:10.5px;color:#2a5a3a}
</style>
</head>
<body>
<div class="wrapper">
  <div class="priority">⚠ PRIORITY APPEAL — HUMAN REVIEW REQUIRED — DO NOT AUTO-CLOSE ⚠</div>
  <div class="hdr">
    <div class="hdr-badge">Official Account Appeal</div>
    <div class="wa-logo">
      <svg viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    </div>
    <h1>WhatsApp Account Recovery Appeal</h1>
    <p>Official Request for Manual Account Review &amp; Restoration</p>
  </div>

  <div class="body">
    <p class="greeting">Dear WhatsApp Trust &amp; Safety Team,</p>

    <p>I am writing this formal appeal to respectfully request an urgent manual review of my WhatsApp account. My account has been inaccessible since <strong>{tanggal}</strong> due to the error message <em>"Login tidak tersedia untuk saat ini"</em>, despite the fact that I have not violated any WhatsApp Terms of Service and have always used the official, unmodified WhatsApp application.</p>

    <div class="error-box">
      <span class="error-icon">🚫</span>
      <div>
        <div class="error-label">Error Displayed on Screen</div>
        <div class="error-text">"Untuk alasan keamanan, kami tidak bisa memasukkan Anda saat ini. Silakan coba lagi nanti, atau hubungi kami jika butuh bantuan dengan akun Anda."</div>
      </div>
    </div>

    <div class="info-card">
      <div class="info-row"><span class="info-label">📱 WhatsApp Number</span><span class="info-value">{nomor}</span></div>
      <div class="info-row"><span class="info-label">📅 Date of Lockout</span><span class="info-value">{tanggal}</span></div>
      <div class="info-row"><span class="info-label">🚨 Account Status</span><span class="info-value err-val">LOGIN UNAVAILABLE — BLOCKED</span></div>
      <div class="info-row"><span class="info-label">📧 Contact Email</span><span class="info-value">{emailPengirim}</span></div>
      <div class="info-row"><span class="info-label">📲 App Used</span><span class="info-value ok-val">Official WhatsApp (Play Store / App Store)</span></div>
      <div class="info-row"><span class="info-label">⚠️ Prior Warnings Received</span><span class="info-value err-val">NONE — Zero notification before block</span></div>
      <div class="info-row"><span class="info-label">⚖️ Terms of Service Violations</span><span class="info-value ok-val">NONE — Clean account history</span></div>
      <div class="info-row"><span class="info-label">📶 Phone Number Status</span><span class="info-value ok-val">ACTIVE — Can receive SMS &amp; calls</span></div>
    </div>

    <div class="evidence">
      <div class="evidence-title">📋 Evidence of Legitimate Usage</div>
      <div class="ev-item">I have NEVER used any modified WhatsApp application (GB WhatsApp, YoWhatsApp, or any unofficial APK)</div>
      <div class="ev-item">I have NEVER sent bulk messages, spam, or unsolicited promotional content to any number</div>
      <div class="ev-item">I have NEVER used automation tools, bots, or unofficial WhatsApp APIs</div>
      <div class="ev-item">I have NEVER shared or distributed illegal, harmful, or copyright-infringing content</div>
      <div class="ev-item">I have NEVER harassed, threatened, or abused any WhatsApp user</div>
      <div class="ev-item">My WhatsApp has been used exclusively for legitimate personal and professional communication</div>
      <div class="ev-item">My SIM card is registered in my name and remains fully active</div>
    </div>

    <div class="steps-box">
      <div class="steps-title">🔧 Troubleshooting Steps Already Attempted</div>
      <div class="step"><div class="step-num">1</div><div class="step-text">Cleared all app cache and data — restarted device — error persists</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Completely uninstalled and reinstalled latest official WhatsApp from Play Store — same error</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">Waited 24–72 hours before reattempting login — account still blocked</div></div>
      <div class="step"><div class="step-num">4</div><div class="step-text">Tested on a different device with the same SIM — identical error appears</div></div>
      <div class="step"><div class="step-num">5</div><div class="step-text">Tried on both WiFi and mobile data connections — no difference</div></div>
      <div class="step"><div class="step-num">6</div><div class="step-text">Used "Contact Us" button on the error screen — no adequate resolution received</div></div>
    </div>

    <div class="request-box">
      <h3>🙏 Specific Request for Action</h3>
      <p>I respectfully request that a human member of the WhatsApp Trust &amp; Safety team personally review my account and take the following actions:</p>
      <div class="req-list">
        <div class="req-item">Conduct a <strong>manual review</strong> of account {nomor} — verify zero violations exist</div>
        <div class="req-item"><strong>Restore full access</strong> to my account including all messages, media, and groups</div>
        <div class="req-item">Provide a written explanation to <strong>{emailPengirim}</strong> regarding the reason for this block</div>
        <div class="req-item">Ensure this does not recur — I am a legitimate, long-term WhatsApp user</div>
      </div>
    </div>

    <p>I fully understand that WhatsApp must protect its platform from abuse, and I deeply respect those efforts. I am also completely willing to cooperate with any identity verification procedure your team may require. All I ask is a fair manual review by a human team member — I am confident that upon review, no violations will be found.</p>

    <div class="sign">
      <p style="font-size:14px;color:#555">With sincere respect and hope,</p>
      <p style="margin-top:8px;font-size:16px;font-weight:800;color:#075E54">{namaPengirim}</p>
      <p style="margin-top:10px;font-size:15px"><strong>{nomor}</strong></p>
      <p style="font-size:13px;color:#777">📧 {emailPengirim}</p>
      <p style="margin-top:6px;font-size:12px;color:#999;font-style:italic">Registered WhatsApp User — Account Recovery Request</p>
    </div>
  </div>

  <div class="footer">
    <p>Reference: <span class="ref">WA-APPEAL-{nomor}-{tanggal}</span></p>
    <p style="margin-top:6px">Please reply to <strong>{emailPengirim}</strong> · This is an official account recovery request · {tanggal}</p>
  </div>
</div>
</body>
</html>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPLATE 2 — Technical Evidence (Terbukti Kuat)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 2,
    name: "Technical Evidence",
    subject: "[URGENT] False Positive Account Block — Full Technical Evidence Report | WhatsApp {nomor}",
    description: "Template teknis bergaya laporan insiden. Bukti diagnostik komprehensif, argumen false positive kuat, sangat meyakinkan tim teknis.",
    color: "#00d4ff",
    icon: "⚡",
    htmlBody: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Technical Evidence Appeal</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;background:#070c14;color:#cdd9e5}
  .wrapper{max-width:700px;margin:0 auto;background:#0d1117;border:1px solid #21d36625}
  .hdr{background:linear-gradient(160deg,#040810,#08111e,#0d1e2e);padding:40px 44px;border-bottom:2px solid #21d36640;position:relative;overflow:hidden}
  .hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#21d366,#00d4ff,#21d366,transparent)}
  .term-bar{display:flex;align-items:center;gap:8px;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #1a2535}
  .dot{width:12px;height:12px;border-radius:50%}
  .d-r{background:#ff5f56} .d-y{background:#ffbd2e} .d-g{background:#27c93f}
  .term-title{font-family:'JetBrains Mono',monospace;font-size:10px;color:#3a5060;margin-left:auto}
  .cmd{font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#21d366;margin:5px 0}
  .cmd::before{content:'$ ';color:#3a5060}
  .out{font-family:'JetBrains Mono',monospace;font-size:11px;color:#4a6070;margin:2px 0 2px 18px}
  .ok{color:#3fb950} .warn{color:#ffbd2e} .err{color:#ff7b72}
  h1{font-size:24px;font-weight:800;color:#e8f0f8;margin-top:20px;letter-spacing:-.4px}
  .urg{display:inline-flex;align-items:center;gap:8px;background:rgba(255,123,114,.12);border:1px solid #ff7b72;color:#ff7b72;font-size:10.5px;font-weight:700;padding:5px 14px;border-radius:4px;margin-top:10px;font-family:'JetBrains Mono',monospace;letter-spacing:1px}
  .body{padding:36px 40px}
  .sec{margin-bottom:32px}
  .sec-hdr{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #1a2535}
  .sec-icon{width:30px;height:30px;background:rgba(33,211,102,.1);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;border:1px solid rgba(33,211,102,.2);flex-shrink:0}
  .sec-title{font-size:11px;font-weight:700;color:#21d366;letter-spacing:1.5px;text-transform:uppercase;font-family:'JetBrains Mono',monospace}
  .code-block{background:#070c13;border:1px solid #1e2d40;border-radius:10px;padding:20px;font-family:'JetBrains Mono',monospace;font-size:11.5px;line-height:2}
  .ck{color:#79c0ff} .cv{color:#a5d6ff} .cs{color:#a8ff78} .ce{color:#ff7b72} .cn{color:#ffa657} .cm{color:#4a6070}
  p{font-size:13.5px;line-height:1.85;color:#8b9aae;margin-bottom:14px}
  .alert{background:rgba(255,123,114,.07);border:1px solid rgba(255,123,114,.25);border-radius:10px;padding:18px 22px;margin:18px 0;display:flex;gap:12px;align-items:flex-start}
  .alert-icon{font-size:18px;flex-shrink:0}
  .alert-txt{font-size:11.5px;color:#ffa19a;line-height:1.85;font-family:'JetBrains Mono',monospace}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:12.5px}
  th{background:#0a1421;color:#8b9aae;font-size:10px;font-weight:700;text-align:left;padding:10px 14px;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e2d40}
  td{padding:12px 14px;border-bottom:1px solid #141f2c;color:#cdd9e5}
  td:first-child{color:#79c0ff;font-family:'JetBrains Mono',monospace;font-size:11px}
  .ok-td{color:#3fb950;font-weight:700} .err-td{color:#ff7b72;font-weight:700} .warn-td{color:#ffbd2e;font-weight:700}
  .request-box{background:rgba(33,211,102,.06);border:1px solid rgba(33,211,102,.2);border-radius:12px;padding:22px;margin:24px 0}
  .request-box h3{color:#21d366;font-size:13.5px;font-weight:700;margin-bottom:12px;font-family:'JetBrains Mono',monospace}
  .req-li{font-size:12.5px;color:#8b9aae;padding:5px 0;display:flex;gap:8px;border-bottom:1px solid #0e1a24}
  .req-li:last-child{border-bottom:none}
  .req-li::before{content:'→';color:#21d366;font-family:'JetBrains Mono',monospace;flex-shrink:0}
  .footer{background:#070c13;padding:24px 40px;border-top:1px solid #1e2d40;font-family:'JetBrains Mono',monospace;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
  .fl{font-size:10px;color:#2a4050}
  .fl span{color:#21d366}
</style>
</head>
<body>
<div class="wrapper">
  <div class="hdr">
    <div class="term-bar">
      <div class="dot d-r"></div><div class="dot d-y"></div><div class="dot d-g"></div>
      <span class="term-title">whatsapp-appeal-agent v3.0 — TRANSMITTING TO SUPPORT@SUPPORT.WHATSAPP.COM</span>
    </div>
    <div class="cmd">submit-appeal --account {nomor} --type LOGIN_UNAVAILABLE --evidence-level FULL --priority URGENT</div>
    <div class="out">Loading diagnostic package...</div>
    <div class="out out ok">✓ Account data compiled</div>
    <div class="out ok">✓ Usage analysis: CLEAN — 0 violations detected</div>
    <div class="out ok">✓ Device fingerprint: Official WhatsApp — NO modifications</div>
    <div class="out warn">⚠ Classification: FALSE_POSITIVE — manual review required</div>
    <div class="out ok">✓ Evidence package ready [6.8KB] — transmitting...</div>
    <h1>False Positive Block Report — Full Technical Evidence</h1>
    <div class="urg">⚠ URGENT — FALSE POSITIVE DETECTED — MANUAL REVIEW REQUIRED — DO NOT AUTO-CLOSE</div>
  </div>

  <div class="body">
    <div class="sec">
      <div class="sec-hdr"><div class="sec-icon">📊</div><span class="sec-title">Incident Summary &amp; Account Identification</span></div>
      <div class="code-block">
        <div><span class="ck">incident.type</span>         : <span class="ce">"LOGIN_UNAVAILABLE"</span></div>
        <div><span class="ck">account.phone</span>         : <span class="cs">"{nomor}"</span></div>
        <div><span class="ck">incident.date</span>         : <span class="cs">"{tanggal}"</span></div>
        <div><span class="ck">error.message</span>         : <span class="ce">"Untuk alasan keamanan, kami tidak bisa memasukkan Anda saat ini"</span></div>
        <div><span class="ck">contact.email</span>         : <span class="cs">"{emailPengirim}"</span></div>
        <div><span class="ck">appeal.type</span>           : <span class="cn">"MANUAL_HUMAN_REVIEW"</span></div>
        <div><span class="ck">appeal.priority</span>       : <span class="cn">"URGENT"</span></div>
        <div><span class="ck">tos_violations</span>        : <span class="cs">null</span> <span class="cm">// No violations found in account history</span></div>
        <div><span class="ck">spam_reports</span>          : <span class="cs">0</span></div>
        <div><span class="ck">modified_app</span>          : <span class="ok">false</span> <span class="cm">// Official WhatsApp only</span></div>
        <div><span class="ck">automation_detected</span>   : <span class="ok">false</span></div>
        <div><span class="ck">false_positive</span>        : <span class="ok">true</span> <span class="cm">// Suspected automated system error</span></div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-hdr"><div class="sec-icon">🔬</div><span class="sec-title">Full Technical Compliance Audit</span></div>
      <table>
        <tr><th>Compliance Parameter</th><th>Result</th><th>Details</th></tr>
        <tr><td>WhatsApp App Version</td><td class="ok-td">✓ OFFICIAL ONLY</td><td>Downloaded exclusively from Google Play Store / Apple App Store. Zero modified APKs.</td></tr>
        <tr><td>App Modification (MOD)</td><td class="ok-td">✓ NONE DETECTED</td><td>No GB WhatsApp, YoWhatsApp, WhatsApp Plus, or any unofficial fork ever used on this number.</td></tr>
        <tr><td>Bulk / Spam Messages</td><td class="ok-td">✓ ZERO INSTANCES</td><td>Account used solely for personal and professional 1-on-1 and group communication.</td></tr>
        <tr><td>Automation / Bot Usage</td><td class="ok-td">✓ NONE</td><td>No WhatsApp Business API misuse, no unofficial bots, no message automation tools.</td></tr>
        <tr><td>Terms of Service Status</td><td class="ok-td">✓ FULLY COMPLIANT</td><td>Account has been operated in full accordance with WhatsApp ToS since registration.</td></tr>
        <tr><td>Reported by Other Users</td><td class="ok-td">✓ NOT REPORTED</td><td>No credible reports of harassment, spam, or abusive behavior filed against this account.</td></tr>
        <tr><td>Phone Number Ownership</td><td class="ok-td">✓ VERIFIED OWNER</td><td>SIM card registered under account owner's name. Active — receives SMS &amp; calls normally.</td></tr>
        <tr><td>Prior Warnings Issued</td><td class="err-td">✗ ZERO</td><td>WhatsApp issued NO warning, notification, or grace period before this block was applied.</td></tr>
        <tr><td>Prior Bans / Suspensions</td><td class="ok-td">✓ NONE</td><td>Account has never been previously suspended or restricted in any way.</td></tr>
        <tr><td>Block Classification</td><td class="warn-td">⚠ FALSE POSITIVE</td><td>No valid trigger identified — block was applied without any detectable ToS violation.</td></tr>
      </table>
    </div>

    <div class="sec">
      <div class="sec-hdr"><div class="sec-icon">🔄</div><span class="sec-title">Recovery Attempts Log — All Failed</span></div>
      <div class="code-block">
        <div><span class="cm">// Attempt 1 — {tanggal}</span></div>
        <div><span class="ck">action</span>: <span class="cs">"clear_cache_and_data"</span> → <span class="ce">FAILED: Error persists</span></div>
        <div><span class="cm">// Attempt 2 — {tanggal}</span></div>
        <div><span class="ck">action</span>: <span class="cs">"reinstall_official_app"</span> → <span class="ce">FAILED: Same LOGIN_UNAVAILABLE error</span></div>
        <div><span class="cm">// Attempt 3 — {tanggal}</span></div>
        <div><span class="ck">action</span>: <span class="cs">"wait_72_hours"</span> → <span class="ce">FAILED: No change after waiting</span></div>
        <div><span class="cm">// Attempt 4 — {tanggal}</span></div>
        <div><span class="ck">action</span>: <span class="cs">"test_alternate_device_same_sim"</span> → <span class="ce">FAILED: Error is SIM/account-level, not device</span></div>
        <div><span class="cm">// Attempt 5 — {tanggal}</span></div>
        <div><span class="ck">action</span>: <span class="cs">"test_different_networks"</span> → <span class="ce">FAILED: WiFi &amp; cellular both fail</span></div>
        <div><span class="cm">// Conclusion</span></div>
        <div><span class="ck">diagnosis</span>: <span class="ce">"Server-side account block — device/network is NOT the issue"</span></div>
        <div><span class="ck">required_fix</span>: <span class="cn">"Manual unblock by WhatsApp Trust &amp; Safety team"</span></div>
      </div>
    </div>

    <div class="alert">
      <span class="alert-icon">🚨</span>
      <div class="alert-txt">
        ASSESSMENT: This account block appears to be an AUTOMATED FALSE POSITIVE.<br>
        The account owner has made ZERO violations and has used ONLY the official<br>
        WhatsApp application for legitimate personal communication.<br>
        A human review will confirm: no justifiable reason for this block exists.<br>
        REQUEST: Immediate manual unblock by Trust &amp; Safety team.
      </div>
    </div>

    <div class="request-box">
      <h3>// Requested Actions from WhatsApp Trust &amp; Safety Team</h3>
      <div class="req-li">Perform <strong>manual account investigation</strong> of {nomor} — confirm zero ToS violations exist</div>
      <div class="req-li"><strong>Unblock and fully restore</strong> account access including all conversations, media, and group memberships</div>
      <div class="req-li">Send confirmation of restoration to email: <strong>{emailPengirim}</strong></div>
      <div class="req-li">Flag this as a false positive in your system to <strong>prevent recurrence</strong></div>
      <div class="req-li">Provide a brief explanation of why the automated system flagged this account</div>
    </div>
  </div>

  <div class="footer">
    <span class="fl">REF: <span>WA-TECHNICAL-{nomor}-{tanggal}</span></span>
    <span class="fl">SENDER: <span>{namaPengirim}</span></span>
    <span class="fl">CONTACT: <span>{emailPengirim}</span></span>
    <span class="fl">PRIORITY: <span>URGENT</span></span>
  </div>
</div>
</body>
</html>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPLATE 3 — Emotional Personal Story (Menyentuh Hati)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 3,
    name: "Emotional Storytelling",
    subject: "Permohonan dari Hati: Akun WhatsApp {nomor} Terblokir Tanpa Alasan — Mohon Bantuan Tim WhatsApp",
    description: "Template personal & menyentuh hati. Cerita nyata, dampak keluarga & pekerjaan. Paling efektif membuat reviewer bersimpati.",
    color: "#f97316",
    icon: "💚",
    htmlBody: `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Permohonan Pemulihan Akun</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;background:#fff8f0;color:#2a1a0a}
  .wrapper{max-width:680px;margin:24px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.1)}
  .hdr{background:linear-gradient(150deg,#166534,#15803d,#22c55e);padding:48px 44px;text-align:center;position:relative}
  .hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#f97316,#eab308,#22c55e,#eab308,#f97316)}
  .hdr-heart{font-size:42px;display:block;margin-bottom:14px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.2))}
  .hdr h1{font-family:'Lora',serif;color:#fff;font-size:26px;font-weight:700;line-height:1.3;letter-spacing:-.2px}
  .hdr p{color:rgba(255,255,255,.82);font-size:13px;margin-top:8px}
  .hdr-info{display:inline-flex;gap:16px;margin-top:14px;background:rgba(255,255,255,.15);padding:8px 18px;border-radius:100px;border:1px solid rgba(255,255,255,.25)}
  .hdr-info span{font-size:12px;color:rgba(255,255,255,.9);font-weight:600}
  .body{padding:44px}
  .greeting{font-family:'Lora',serif;font-size:16px;color:#15803d;margin-bottom:20px;font-style:italic}
  p{font-size:14.5px;line-height:1.9;color:#3a2a1a;margin-bottom:18px}
  strong{color:#1a0a00}
  .story-box{background:linear-gradient(135deg,#fef9f0,#fff8f0);border-left:4px solid #f97316;border-radius:0 14px 14px 0;padding:20px 24px;margin:24px 0}
  .story-quote{background:#fef2e8;border-radius:10px;padding:14px 18px;margin:12px 0;font-style:italic;font-size:13.5px;color:#7c3a1a;line-height:1.8;border:1px solid #fed7aa}
  .error-badge{display:inline-block;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:8px;margin:4px 0}
  .info-card{background:linear-gradient(135deg,#f0fff8,#f8fffd);border:1px solid #bbf7d0;border-radius:14px;padding:22px;margin:22px 0}
  .info-row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px dashed #bbf7d0;font-size:13.5px}
  .info-row:last-child{border-bottom:none}
  .info-row span:first-child{color:#6b8c7a;font-weight:600}
  .info-row span:last-child{font-weight:700;color:#0a2418}
  .impacts{margin:28px 0}
  .impacts-title{font-size:11px;font-weight:700;color:#f97316;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px}
  .impact{display:flex;gap:14px;margin-bottom:16px;padding:16px;background:#fff8f0;border-radius:14px;border:1px solid #fed7aa}
  .impact:last-child{margin-bottom:0}
  .impact-icon{font-size:22px;flex-shrink:0}
  .impact-text{font-size:13.5px;color:#3a2010;line-height:1.75}
  .impact-text strong{display:block;font-size:14px;color:#1a0a00;margin-bottom:4px}
  .declare{background:linear-gradient(135deg,#f0fff8,#f0f8ff);border:1px dashed #86efac;border-radius:14px;padding:22px;margin:22px 0}
  .declare-title{font-size:11px;font-weight:700;color:#16a34a;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px}
  .declare-li{display:flex;gap:10px;font-size:13.5px;color:#374151;padding:6px 0;border-bottom:1px dashed #d1fae5}
  .declare-li:last-child{border-bottom:none}
  .declare-li::before{content:'✅';flex-shrink:0}
  .plea{background:linear-gradient(135deg,#f0fff4,#f8ffe8);border-radius:18px;padding:28px;margin:28px 0;text-align:center;border:1px solid #bbf7d0}
  .plea h3{font-family:'Lora',serif;font-size:20px;color:#15803d;margin-bottom:12px}
  .plea p{font-size:14px;color:#3a5a3a;margin:0;line-height:1.8}
  .sign{margin-top:32px;padding-top:24px;border-top:1px dashed #bbf7d0;text-align:center}
  .footer{background:#f0fff8;padding:22px 44px;border-top:1px solid #bbf7d0;text-align:center}
  .footer p{font-size:11.5px;color:#8a9a8a;line-height:1.7}
</style>
</head>
<body>
<div class="wrapper">
  <div class="hdr">
    <span class="hdr-heart">💚</span>
    <h1>Permohonan Tulus kepada Tim WhatsApp<br>yang Terhormat</h1>
    <p>Ditulis dengan harapan besar bahwa Anda akan membantu</p>
    <div class="hdr-info">
      <span>📱 {nomor}</span>
      <span>·</span>
      <span>📅 {tanggal}</span>
    </div>
  </div>

  <div class="body">
    <div class="greeting">Kepada seluruh Tim WhatsApp yang luar biasa,</div>

    <p>Saya menulis surat ini bukan sekadar sebagai laporan teknis — saya menulis ini sebagai seorang manusia biasa yang benar-benar membutuhkan bantuan Anda. Saya tahu Tim WhatsApp menerima banyak permohonan setiap hari, namun saya dengan tulus berharap Anda bisa meluangkan waktu sebentar untuk membaca situasi saya.</p>

    <div class="story-box">
      <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#9a3412">📖 Apa yang Terjadi pada Tanggal {tanggal}:</p>
      <p style="margin:0;font-size:14px;color:#3a2010;line-height:1.85">Saya membuka WhatsApp seperti biasa — untuk membaca kabar dari keluarga, mengecek pesan pekerjaan, dan menyapa teman. Namun yang muncul adalah layar yang membuat hati saya seakan berhenti:</p>
      <div class="story-quote">"Login tidak tersedia untuk saat ini. Untuk alasan keamanan, kami tidak bisa memasukkan Anda saat ini. Silakan coba lagi nanti, atau hubungi kami jika butuh bantuan dengan akun Anda."</div>
      <p style="margin:10px 0 0;font-size:13.5px;color:#3a2010">Saya mencoba berkali-kali. Clear cache. Install ulang. Ganti perangkat. Ganti jaringan. Menunggu 3 hari. Semuanya gagal. Nomor <strong>{nomor}</strong> tetap tidak bisa masuk — dan yang paling menyakitkan: <em>saya tidak tahu salah saya apa.</em></p>
    </div>

    <div class="info-card">
      <div class="info-row"><span>📱 Nomor WhatsApp</span><span>{nomor}</span></div>
      <div class="info-row"><span>📅 Tanggal Terblokir</span><span>{tanggal}</span></div>
      <div class="info-row"><span>📧 Email Kontak</span><span>{emailPengirim}</span></div>
      <div class="info-row"><span>📲 Aplikasi yang Digunakan</span><span style="color:#16a34a">WhatsApp Resmi (Play Store)</span></div>
      <div class="info-row"><span>⚠️ Peringatan Diterima</span><span style="color:#dc2626">Tidak Ada — Sama sekali tidak ada</span></div>
      <div class="info-row"><span>⚖️ Pelanggaran yang Dilakukan</span><span style="color:#16a34a">Tidak Ada — Nol pelanggaran</span></div>
    </div>

    <div class="impacts">
      <div class="impacts-title">💔 Dampak Nyata yang Saya Alami Setiap Hari</div>
      <div class="impact">
        <div class="impact-icon">👨‍👩‍👧</div>
        <div class="impact-text">
          <strong>Terputus dari Keluarga</strong>
          Seluruh keluarga saya — orang tua, saudara, kerabat — hanya mengenal nomor {nomor} ini sebagai cara menghubungi saya. Mereka khawatir dan tidak mengerti kenapa saya tiba-tiba tidak bisa dihubungi. Tidak ada cara lain yang mereka tahu.
        </div>
      </div>
      <div class="impact">
        <div class="impact-icon">💼</div>
        <div class="impact-text">
          <strong>Kerugian Profesional yang Signifikan</strong>
          Pekerjaan saya sangat bergantung pada WhatsApp untuk koordinasi dengan tim dan klien. Hilangnya akses ini telah menyebabkan miskomunikasi serius dan kerugian nyata yang sulit saya deskripsikan.
        </div>
      </div>
      <div class="impact">
        <div class="impact-icon">📸</div>
        <div class="impact-text">
          <strong>Ribuan Kenangan Berharga Tidak Bisa Diakses</strong>
          Di dalam akun ini tersimpan foto, video, dan percakapan bertahun-tahun dengan orang-orang terkasih — momen wisuda, pernikahan, kelahiran anak — kenangan yang tidak bisa digantikan dengan apapun.
        </div>
      </div>
      <div class="impact">
        <div class="impact-icon">😰</div>
        <div class="impact-text">
          <strong>Tekanan Mental Setiap Harinya</strong>
          Ketidakpastian ini membebani pikiran saya — apakah akun saya hilang selamanya? Apakah data saya aman? Apakah saya memang melakukan sesuatu yang salah padahal saya tidak merasa begitu?
        </div>
      </div>
    </div>

    <div class="declare">
      <div class="declare-title">🙏 Pernyataan Jujur Saya sebagai Pengguna</div>
      <div class="declare-li">Saya <strong>tidak pernah</strong> menggunakan WhatsApp GB, YoWhatsApp, atau aplikasi modifikasi apapun</div>
      <div class="declare-li">Saya <strong>tidak pernah</strong> mengirim pesan massal, spam, atau pesan promosi kepada siapapun</div>
      <div class="declare-li">Saya <strong>tidak pernah</strong> menggunakan bot, otomatisasi, atau alat tidak resmi</div>
      <div class="declare-li">Saya <strong>tidak pernah</strong> menyebarkan konten berbahaya, hoaks, atau yang melanggar hukum</div>
      <div class="declare-li">Saya <strong>tidak pernah</strong> mendapat peringatan dari WhatsApp sebelum akun ini diblokir</div>
      <div class="declare-li">Nomor ini <strong>masih aktif</strong> dan dapat menerima SMS serta panggilan telepon dengan normal</div>
    </div>

    <div class="plea">
      <h3>🌿 Satu Permintaan Sederhana Saya</h3>
      <p>Saya hanya memohon satu hal: kesempatan untuk mendapatkan <strong>peninjauan manual oleh manusia</strong> yang dapat melihat bahwa akun ini tidak pernah melakukan pelanggaran apapun. Saya yakin begitu seseorang dari Tim WhatsApp melihat catatan akun <strong>{nomor}</strong> ini, mereka akan menemukan bahwa tidak ada alasan sah untuk pemblokiran ini. Tolong berikan kesempatan itu kepada saya.</p>
    </div>

    <div class="sign">
      <p style="font-size:14.5px;color:#4a4a4a">Dengan tulus dan penuh harapan,</p>
      <p style="margin-top:8px;font-size:16px;font-weight:800;color:#16a34a">{namaPengirim}</p>
      <p style="margin-top:10px;font-size:16px;font-weight:700">{nomor}</p>
      <p style="font-size:13px;color:#777;margin-top:4px">📧 {emailPengirim}</p>
      <p style="margin-top:8px;font-size:12px;color:#999;font-style:italic">Pengguna WhatsApp yang Setia &amp; Membutuhkan Bantuan Anda</p>
    </div>
  </div>

  <div class="footer">
    <p>Referensi: <strong>WA-APPEAL-{nomor}-{tanggal}</strong></p>
    <p style="margin-top:5px">Mohon balas ke <strong>{emailPengirim}</strong> · Terima kasih atas perhatian dan waktu Anda</p>
  </div>
</div>
</body>
</html>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPLATE 4 — Consumer Rights (Hak Konsumen & Legal)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 4,
    name: "Consumer Rights",
    subject: "Formal Complaint: Account {nomor} Suspended Without Due Process | Consumer Rights Claim | Response Required Within 72 Hours",
    description: "Template hak konsumen bergaya surat resmi. Mengacu ToS WhatsApp, GDPR, dan hak pengguna. Sangat efektif untuk escalation formal.",
    color: "#a855f7",
    icon: "⚖️",
    htmlBody: `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Consumer Rights Claim</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;background:#f5f0ff;color:#1a1030}
  .wrapper{max-width:700px;margin:24px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.1);border-top:6px solid #7c3aed}
  .hdr{padding:44px;border-bottom:2px solid #ede9fe;position:relative}
  .hdr-inner{display:flex;align-items:flex-start;gap:20px}
  .stamp{font-size:40px;flex-shrink:0;margin-top:4px}
  .hdr-text h1{font-family:'Merriweather',serif;font-size:21px;font-weight:700;color:#1a0050;line-height:1.35}
  .hdr-text p{font-size:13px;color:#7c3aed;margin-top:6px;font-weight:600}
  .doc-ref{font-family:monospace;font-size:10.5px;color:#9ca3af;margin-top:8px;background:#f9f8ff;padding:5px 10px;border-radius:4px;display:inline-block;border:1px solid #e9e3ff}
  .notice-bar{background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff;text-align:center;padding:10px;font-size:10.5px;font-weight:700;letter-spacing:1.5px}
  .body{padding:40px 44px}
  .ref-block{background:#f9f8ff;border:1px solid #ddd6fe;border-radius:10px;padding:20px;margin-bottom:28px}
  .ref-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ref-item{font-size:12px;color:#4a4a70}
  .ref-item span:first-child{color:#9ca3af;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:2px}
  .ref-item span:last-child{font-weight:700;color:#1a1030}
  h2{font-family:'Merriweather',serif;font-size:17px;font-weight:700;color:#1a0050;margin:28px 0 14px;border-bottom:2px solid #ede9fe;padding-bottom:8px}
  p{font-size:14px;line-height:1.85;color:#3a3a5a;margin-bottom:14px}
  strong{color:#1a0050}
  .legal-box{background:#fdf4ff;border:1px solid #d8b4fe;border-radius:10px;padding:18px 22px;margin:18px 0;font-size:13px;color:#4a1a70;line-height:1.8}
  .legal-box strong{color:#7c3aed}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
  th{background:#f3f0ff;color:#4a3a70;font-size:10px;font-weight:700;text-align:left;padding:10px 14px;letter-spacing:1px;text-transform:uppercase;border-bottom:2px solid #ddd6fe}
  td{padding:11px 14px;border-bottom:1px solid #f3f0ff;color:#3a3a5a;font-size:13px}
  td:first-child{font-weight:600;color:#1a0050}
  .ok-td{color:#16a34a;font-weight:700} .err-td{color:#dc2626;font-weight:700}
  .demand-list{margin:18px 0}
  .demand-item{display:flex;gap:14px;margin-bottom:14px;padding:16px;background:#f9f8ff;border-radius:12px;border:1px solid #e9e3ff}
  .demand-num{width:32px;height:32px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0}
  .demand-text{font-size:13.5px;color:#3a3a5a;line-height:1.75}
  .demand-text strong{color:#1a0050;display:block;margin-bottom:3px}
  .deadline-box{background:linear-gradient(135deg,#fdf4ff,#f3f0ff);border:1.5px solid #c084fc;border-radius:12px;padding:22px;margin:24px 0;text-align:center}
  .deadline-box h3{color:#7c3aed;font-size:16px;font-weight:800;margin-bottom:8px}
  .deadline-box p{font-size:13.5px;color:#4a3a70;margin:0}
  .sign-block{margin-top:32px;padding-top:24px;border-top:2px dashed #ddd6fe}
  .footer{background:#f9f8ff;padding:22px 44px;border-top:2px solid #ede9fe;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
  .footer p{font-size:11px;color:#9ca3af}
  .footer-ref{font-family:monospace;background:#ede9fe;padding:2px 7px;border-radius:4px;font-size:10px;color:#5b21b6}
</style>
</head>
<body>
<div class="wrapper">
  <div class="hdr">
    <div class="hdr-inner">
      <div class="stamp">⚖️</div>
      <div class="hdr-text">
        <h1>Formal Consumer Rights Complaint<br>Account Suspension Without Due Process</h1>
        <p>SURAT FORMAL — Permohonan Pemulihan Akun &amp; Tuntutan Hak Konsumen</p>
        <div class="doc-ref">DOC: WA-CONSUMER-RIGHTS-{nomor} | DATE: {tanggal} | STATUS: OPEN</div>
      </div>
    </div>
  </div>
  <div class="notice-bar">⚖ SURAT FORMAL — MOHON DITANGANI OLEH TIM YANG BERWENANG DALAM 72 JAM ⚖</div>

  <div class="body">
    <div class="ref-block">
      <div class="ref-grid">
        <div class="ref-item"><span>Kepada</span><span>WhatsApp Trust &amp; Safety Team</span></div>
        <div class="ref-item"><span>Dari</span><span>Pengguna: {nomor}</span></div>
        <div class="ref-item"><span>Tanggal Kejadian</span><span>{tanggal}</span></div>
        <div class="ref-item"><span>Email Kontak</span><span>{emailPengirim}</span></div>
        <div class="ref-item"><span>Status Akun</span><span style="color:#dc2626;font-weight:800">SUSPENDED — NO CAUSE</span></div>
        <div class="ref-item"><span>Nomor Referensi</span><span>WA-CR-{nomor}</span></div>
      </div>
    </div>

    <h2>I. Pendahuluan &amp; Pernyataan Masalah</h2>
    <p>Saya, pengguna WhatsApp terdaftar dengan nomor <strong>{nomor}</strong>, melalui surat formal ini menyampaikan keberatan resmi atas penangguhan akun saya yang terjadi pada <strong>{tanggal}</strong> tanpa adanya notifikasi sebelumnya, tanpa penjelasan alasan, dan tanpa melalui prosedur peringatan yang seharusnya berlaku sesuai Ketentuan Layanan WhatsApp.</p>

    <p>Error yang ditampilkan oleh sistem WhatsApp adalah: <em>"Untuk alasan keamanan, kami tidak bisa memasukkan Anda saat ini. Silakan coba lagi nanti, atau hubungi kami jika butuh bantuan dengan akun Anda."</em> — namun tidak ada panduan yang jelas, tidak ada alasan spesifik, dan tidak ada jalur penyelesaian yang tersedia.</p>

    <div class="legal-box">
      <strong>Dasar Hukum &amp; Kebijakan yang Berlaku:</strong><br>
      Berdasarkan Ketentuan Layanan WhatsApp, Meta/WhatsApp <em>wajib</em> memberikan notifikasi yang wajar kepada pengguna sebelum menangguhkan akun mereka, kecuali dalam kasus pelanggaran serius yang telah dibuktikan. Berdasarkan <strong>Kebijakan Privasi Meta</strong> dan prinsip-prinsip <strong>perlindungan data pengguna</strong>, saya berhak untuk mengakses data saya dan mendapatkan penjelasan mengapa akses tersebut dicabut. Penangguhan tanpa alasan yang jelas merupakan pelanggaran terhadap hak-hak konsumen yang sah.
    </div>

    <h2>II. Bukti Kepatuhan Pengguna</h2>
    <table>
      <tr><th>Parameter</th><th>Status</th><th>Keterangan</th></tr>
      <tr><td>Aplikasi WhatsApp</td><td class="ok-td">✓ RESMI SAJA</td><td>Hanya menggunakan WhatsApp resmi dari Play Store / App Store — tidak pernah mod APK</td></tr>
      <tr><td>Aktivitas Spam</td><td class="ok-td">✓ NOL</td><td>Tidak pernah mengirim pesan massal, broadcast spam, atau promosi tidak sah</td></tr>
      <tr><td>Pelanggaran ToS</td><td class="ok-td">✓ NOL</td><td>Tidak ada pelanggaran Ketentuan Layanan — penggunaan hanya untuk komunikasi pribadi sah</td></tr>
      <tr><td>Bot / Otomatisasi</td><td class="ok-td">✓ NOL</td><td>Tidak menggunakan alat otomatisasi, bot, atau API WhatsApp tidak resmi</td></tr>
      <tr><td>Konten Berbahaya</td><td class="ok-td">✓ NOL</td><td>Tidak pernah menyebarkan konten ilegal, hoaks, atau yang melanggar hukum</td></tr>
      <tr><td>Peringatan Sebelum Blokir</td><td class="err-td">✗ NOL</td><td>WhatsApp tidak memberikan peringatan, notifikasi, atau masa tenggang apapun sebelum blokir</td></tr>
      <tr><td>Status Kartu SIM</td><td class="ok-td">✓ AKTIF</td><td>SIM aktif dan dapat menerima SMS serta panggilan telepon</td></tr>
      <tr><td>Riwayat Suspens</td><td class="ok-td">✓ NOL</td><td>Akun ini tidak pernah sebelumnya ditangguhkan atau dibatasi</td></tr>
    </table>

    <h2>III. Tuntutan Formal &amp; Permintaan Tindakan</h2>
    <div class="demand-list">
      <div class="demand-item"><div class="demand-num">1</div><div class="demand-text"><strong>Peninjauan Manual oleh Staf Manusia</strong>Lakukan investigasi manual terhadap akun {nomor} oleh anggota Tim Trust &amp; Safety — bukan hanya sistem otomatis. Konfirmasi bahwa tidak ada pelanggaran yang dilakukan.</div></div>
      <div class="demand-item"><div class="demand-num">2</div><div class="demand-text"><strong>Pemulihan Akses Penuh</strong>Pulihkan akses penuh ke akun WhatsApp {nomor} beserta seluruh data, percakapan, media, dan keanggotaan grup yang ada — tanpa penghapusan konten apapun.</div></div>
      <div class="demand-item"><div class="demand-num">3</div><div class="demand-text"><strong>Penjelasan Tertulis</strong>Berikan penjelasan tertulis yang jelas mengenai alasan spesifik pemblokiran ini kepada {emailPengirim}, atau akui secara resmi bahwa ini merupakan kesalahan sistem (false positive).</div></div>
      <div class="demand-item"><div class="demand-num">4</div><div class="demand-text"><strong>Jaminan Non-Recurrence</strong>Pastikan bahwa pemblokiran serupa tidak akan terjadi lagi tanpa adanya prosedur peringatan yang transparan sesuai Ketentuan Layanan.</div></div>
      <div class="demand-item"><div class="demand-num">5</div><div class="demand-text"><strong>Konfirmasi Resmi via Email</strong>Kirimkan konfirmasi tertulis ke <strong>{emailPengirim}</strong> mengenai status penanganan kasus ini dalam waktu 72 jam.</div></div>
    </div>

    <div class="deadline-box">
      <h3>⏰ Batas Waktu Respons yang Diharapkan</h3>
      <p>Saya mengharapkan respons dan tindakan nyata dalam <strong>72 jam</strong> sejak surat ini diterima. Apabila tidak ada respons yang memadai, saya akan mencari jalur alternatif yang tersedia untuk mendapatkan keadilan sebagai konsumen — termasuk melaporkan ke otoritas perlindungan konsumen yang relevan.</p>
    </div>

    <p>Saya menyampaikan surat ini dengan itikad baik dan sepenuhnya bersedia bekerja sama dengan proses verifikasi identitas apapun yang diperlukan. Saya percaya pada komitmen WhatsApp untuk melayani penggunanya dengan adil.</p>

    <div class="sign-block">
      <p style="font-size:14px;color:#555">Hormat saya,</p>
      <p style="margin-top:8px;font-size:16px;font-weight:800;color:#1a0050">{namaPengirim}</p>
      <p style="margin-top:10px;font-size:16px;font-weight:800;color:#1a0050">{nomor}</p>
      <p style="font-size:13px;color:#777">📧 {emailPengirim}</p>
      <p style="margin-top:6px;font-size:12px;color:#9ca3af;font-style:italic">Pengguna WhatsApp Terdaftar — Surat Resmi Hak Konsumen — {tanggal}</p>
    </div>
  </div>

  <div class="footer">
    <p>Ref: <span class="footer-ref">WA-CR-{nomor}-{tanggal}</span></p>
    <p>Kontak: {emailPengirim} · Surat ini bersifat formal dan resmi</p>
  </div>
</div>
</body>
</html>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPLATE 5 — Final Escalation (Ultimatum Terakhir)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 5,
    name: "Final Escalation",
    subject: "FINAL NOTICE: WhatsApp {nomor} — Immediate Account Restoration Required | Escalation Pending in 48 Hours",
    description: "Template eskalasi final dengan urgensi tertinggi. Semua bukti terangkum, rencana eskalasi jelas. Untuk pengiriman terakhir yang serius.",
    color: "#ef4444",
    icon: "🚨",
    htmlBody: `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Final Escalation Notice</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;background:#0a0005;color:#f0dde8}
  .wrapper{max-width:700px;margin:0 auto;background:#130008;border:1px solid #dc262640}
  .alert-top{background:#dc2626;color:#fff;text-align:center;padding:12px;font-size:11px;font-weight:800;letter-spacing:2px}
  .hdr{background:linear-gradient(160deg,#1c0010,#2a0018,#1a000c);padding:44px;border-bottom:2px solid #dc262640;position:relative;overflow:hidden}
  .hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#dc2626,#ff6b6b,#dc2626,transparent)}
  .hdr-icon{font-size:44px;margin-bottom:16px;display:block;text-align:center}
  .hdr h1{font-size:24px;font-weight:900;color:#fff;text-align:center;line-height:1.3;letter-spacing:-.3px}
  .hdr p{color:rgba(255,255,255,.7);font-size:13px;text-align:center;margin-top:8px}
  .hdr-meta{display:flex;justify-content:center;gap:20px;margin-top:16px;flex-wrap:wrap}
  .hdr-meta-item{font-size:11.5px;color:rgba(255,255,255,.6);font-family:monospace}
  .hdr-meta-item strong{color:#ff8888}
  .body{padding:36px 40px}
  p{font-size:14px;line-height:1.85;color:#c0a0b0;margin-bottom:14px}
  strong{color:#f0dde8}
  .countdown{background:rgba(220,38,38,.1);border:1.5px solid rgba(220,38,38,.35);border-radius:14px;padding:22px 26px;margin:22px 0;display:flex;gap:16px;align-items:flex-start}
  .countdown-icon{font-size:28px;flex-shrink:0}
  .countdown-text h3{color:#ff8888;font-size:16px;font-weight:800;margin-bottom:8px}
  .countdown-text p{font-size:13.5px;color:#c08080;margin:0;line-height:1.75}
  .case-summary{background:rgba(255,255,255,.04);border:1px solid rgba(220,38,38,.2);border-radius:12px;padding:22px;margin:22px 0}
  .case-title{font-size:10px;font-weight:700;color:#ef4444;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px}
  .case-row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px}
  .case-row:last-child{border-bottom:none}
  .case-row span:first-child{color:#8a7080}
  .case-row span:last-child{font-weight:700;color:#f0dde8}
  .bad{color:#ff8888!important} .good{color:#4ade80!important}
  h2{font-size:14px;font-weight:700;color:#ff8888;margin:24px 0 12px;letter-spacing:.5px;text-transform:uppercase}
  .attempts{background:rgba(0,0,0,.3);border-radius:12px;padding:18px;margin:14px 0}
  .attempt{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px;color:#9a8090;align-items:flex-start}
  .attempt:last-child{border-bottom:none}
  .attempt-icon{flex-shrink:0;font-size:14px}
  .escalation{margin:20px 0}
  .esc-step{display:flex;gap:14px;margin-bottom:12px;position:relative;align-items:flex-start}
  .esc-num{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0}
  .n-done{background:#1a4a1a;color:#4ade80;border:1px solid #166534}
  .n-now{background:linear-gradient(135deg,#7c0000,#dc2626);color:#fff;box-shadow:0 0 16px rgba(220,38,38,.4)}
  .n-next{background:rgba(220,38,38,.15);color:#dc2626;border:1px solid rgba(220,38,38,.3)}
  .esc-content h4{font-size:13px;font-weight:700;color:#f0dde8;margin-bottom:4px}
  .esc-content p{font-size:12.5px;color:#9a8090;margin:0;line-height:1.7}
  .esc-current h4{color:#ff8888}
  .final-demands{background:rgba(220,38,38,.08);border:1.5px solid rgba(220,38,38,.3);border-radius:14px;padding:24px;margin:24px 0}
  .final-demands h3{color:#ff6b6b;font-size:15px;font-weight:800;margin-bottom:16px}
  .demand-item-r{display:flex;gap:10px;font-size:13.5px;color:#c08080;padding:8px 0;border-bottom:1px solid rgba(220,38,38,.15);line-height:1.75;align-items:flex-start}
  .demand-item-r:last-child{border-bottom:none}
  .demand-item-r::before{content:'→';color:#ef4444;flex-shrink:0;font-weight:700}
  .response-box{background:rgba(255,255,255,.04);border-radius:12px;padding:20px 24px;margin:22px 0;font-size:13.5px;color:#c0a0b0;line-height:1.85}
  .sign{margin-top:28px;padding-top:20px;border-top:1px solid rgba(220,38,38,.2);text-align:center}
  .footer-red{background:rgba(0,0,0,.4);padding:18px 40px;border-top:1px solid rgba(220,38,38,.2);display:flex;justify-content:space-between;align-items:center;font-family:monospace;font-size:10px;color:#5a3040;flex-wrap:wrap;gap:6px}
  .footer-red span{white-space:nowrap}
</style>
</head>
<body>
<div class="wrapper">
  <div class="alert-top">🚨 FINAL NOTICE — URGENT ACTION REQUIRED — DO NOT IGNORE OR AUTO-CLOSE 🚨</div>

  <div class="hdr">
    <span class="hdr-icon">🚨</span>
    <h1>Final Escalation Notice<br>Account Restoration Request</h1>
    <p>Permohonan Terakhir Sebelum Eskalasi ke Otoritas Resmi</p>
    <div class="hdr-meta">
      <span class="hdr-meta-item">📱 <strong>{nomor}</strong></span>
      <span class="hdr-meta-item">📅 <strong>{tanggal}</strong></span>
      <span class="hdr-meta-item">📧 <strong>{emailPengirim}</strong></span>
    </div>
  </div>

  <div class="body">
    <div class="countdown">
      <div class="countdown-icon">⏰</div>
      <div class="countdown-text">
        <h3>Ini adalah Permohonan Final Saya</h3>
        <p>Saya telah menghabiskan waktu yang signifikan mencoba semua jalur yang tersedia untuk memulihkan akun WhatsApp <strong>{nomor}</strong> yang diblokir tanpa alasan pada <strong>{tanggal}</strong>. Surat ini adalah permohonan terakhir saya sebelum saya terpaksa mencari jalur formal lainnya. Saya sungguh berharap surat ini mendapat perhatian yang layak dari tim manusia.</p>
      </div>
    </div>

    <div class="case-summary">
      <div class="case-title">📋 Ringkasan Lengkap Kasus</div>
      <div class="case-row"><span>Nomor WhatsApp</span><span>{nomor}</span></div>
      <div class="case-row"><span>Tanggal Pemblokiran</span><span>{tanggal}</span></div>
      <div class="case-row"><span>Pesan Error</span><span class="bad">"Login tidak tersedia untuk saat ini"</span></div>
      <div class="case-row"><span>Peringatan Sebelum Blokir</span><span class="bad">TIDAK ADA</span></div>
      <div class="case-row"><span>Email Kontak</span><span>{emailPengirim}</span></div>
      <div class="case-row"><span>Pelanggaran yang Dilakukan</span><span class="good">TIDAK ADA</span></div>
      <div class="case-row"><span>Aplikasi Modifikasi Digunakan</span><span class="good">TIDAK ADA — WhatsApp Resmi</span></div>
      <div class="case-row"><span>Aktivitas Spam / Bot</span><span class="good">TIDAK ADA</span></div>
      <div class="case-row"><span>Status Kartu SIM</span><span class="good">AKTIF — SMS &amp; panggilan berfungsi</span></div>
      <div class="case-row"><span>Total Percobaan Pemulihan</span><span class="bad">6+ Kali — Semuanya Gagal</span></div>
    </div>

    <h2>📌 Semua Jalur yang Sudah Dicoba (Gagal Semua)</h2>
    <div class="attempts">
      <div class="attempt"><div class="attempt-icon">❌</div>Clear cache &amp; data aplikasi — restart lengkap — error tetap muncul</div>
      <div class="attempt"><div class="attempt-icon">❌</div>Uninstall &amp; reinstall WhatsApp versi terbaru dari Play Store — gagal</div>
      <div class="attempt"><div class="attempt-icon">❌</div>Menunggu 72+ jam sebelum mencoba ulang — tidak ada perubahan</div>
      <div class="attempt"><div class="attempt-icon">❌</div>Uji di perangkat berbeda dengan SIM yang sama — error identik muncul</div>
      <div class="attempt"><div class="attempt-icon">❌</div>Ganti koneksi: WiFi → data seluler → WiFi lain — tidak membantu</div>
      <div class="attempt"><div class="attempt-icon">❌</div>Gunakan tombol "Hubungi Kami" di layar error — tidak ada respons memadai</div>
      <div class="attempt"><div class="attempt-icon">⏳</div><strong style="color:#f0dde8">Surat formal ini — Menunggu tindakan segera dari WhatsApp</strong></div>
    </div>

    <h2>🗺️ Rencana Eskalasi — Jika Tidak Ada Tindakan</h2>
    <div class="escalation">
      <div class="esc-step"><div class="esc-num n-done">✓</div><div class="esc-content"><h4>Email Permohonan Reguler</h4><p>Sudah dikirim — belum ada penyelesaian yang memuaskan.</p></div></div>
      <div class="esc-step"><div class="esc-num n-now">★</div><div class="esc-content esc-current"><h4>Final Escalation Notice — SEKARANG (Surat Ini)</h4><p>Permohonan terakhir langsung kepada tim senior WhatsApp sebelum langkah berikutnya.</p></div></div>
      <div class="esc-step"><div class="esc-num n-next">3</div><div class="esc-content"><h4>Laporan ke Otoritas Perlindungan Konsumen</h4><p>Melaporkan ke BPSK, YLKI, atau lembaga perlindungan konsumen relevan mengenai penangguhan layanan digital tanpa alasan yang sah.</p></div></div>
      <div class="esc-step"><div class="esc-num n-next">4</div><div class="esc-content"><h4>Laporan ke Kominfo / Regulator Telekomunikasi</h4><p>Melaporkan insiden ini ke Kementerian Komunikasi &amp; Informatika terkait layanan digital yang tidak adil kepada pengguna Indonesia.</p></div></div>
      <div class="esc-step"><div class="esc-num n-next">5</div><div class="esc-content"><h4>Publikasi Pengalaman secara Terbuka</h4><p>Membagikan pengalaman ini di media sosial, forum pengguna, dan platform ulasan untuk menginformasikan pengguna lain tentang risiko pemblokiran tanpa alasan.</p></div></div>
    </div>

    <div class="final-demands">
      <h3>🔴 Permintaan Final yang Tidak Dapat Ditawar</h3>
      <div class="demand-item-r"><strong>Pulihkan akses penuh</strong> ke akun WhatsApp <strong>{nomor}</strong> — termasuk seluruh percakapan, media, dan grup yang ada.</div>
      <div class="demand-item-r"><strong>Kirim konfirmasi tertulis</strong> ke <strong>{emailPengirim}</strong> bahwa pemulihan telah dilakukan atau sedang dalam proses — dalam 48 jam.</div>
      <div class="demand-item-r"><strong>Jelaskan alasan spesifik</strong> pemblokiran ini, atau akui secara resmi bahwa ini adalah kesalahan sistem yang perlu diperbaiki.</div>
      <div class="demand-item-r"><strong>Pastikan tidak terulang</strong> — berikan jaminan bahwa pemblokiran serupa tidak akan terjadi tanpa prosedur peringatan yang transparan sesuai ToS.</div>
    </div>

    <div class="response-box">
      Saya ingin menegaskan satu hal dengan tegas: <strong>Saya adalah pengguna yang tidak bersalah.</strong> Saya tidak melanggar satu pun aturan WhatsApp. Saya tidak menggunakan aplikasi modifikasi. Saya tidak pernah spam. Saya adalah pengguna biasa yang tiba-tiba kehilangan akses tanpa alasan — dan saya hanya meminta keadilan yang sederhana: biarkan seseorang dari tim manusia memeriksa akun ini, dan mereka akan menemukan bahwa tidak ada yang perlu diblokir.
    </div>

    <div class="sign">
      <p style="font-size:14px;color:#8a7080">Dengan segala ketulusan dan urgensi yang tersisa,</p>
      <p style="margin-top:8px;font-size:16px;font-weight:800;color:#ff8888">{namaPengirim}</p>
      <p style="margin-top:10px;font-size:16px;font-weight:800;color:#ff8888">{nomor}</p>
      <p style="font-size:13px;color:#6a5060;margin-top:4px">📧 {emailPengirim}</p>
      <p style="margin-top:8px;font-size:11.5px;color:#5a4050;font-style:italic">Pengguna WhatsApp — Permohonan Final — {tanggal}</p>
    </div>
  </div>

  <div class="footer-red">
    <span>REF: WA-FINAL-{nomor}-{tanggal}</span>
    <span>CONTACT: {emailPengirim}</span>
    <span>PRIORITY: ⚠ CRITICAL</span>
  </div>
</div>
</body>
</html>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPLATE 6 — Khusus Indonesia +62 (Full Bahasa Indonesia) — VERSI TERKUAT
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 6,
    name: "🇮🇩 Khusus Indonesia",
    subject: "[BANDING DARURAT +62] Akun {nomor} Diblokir Tanpa Dasar — Bukti False Positive Definitif Terlampir — Eskalasi Kominfo Aktif Dalam 48 Jam",
    description: "Template terkuat khusus nomor +62. Bukti false positive 4 lapis, referensi hukum Indonesia (UU Perlindungan Konsumen), ancaman eskalasi Kominfo/YLKI, dan bahasa emosional yang meyakinkan tim review manusia.",
    color: "#CE1126",
    icon: "🇮🇩",
    htmlBody: `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Banding Resmi WhatsApp — Pengguna Indonesia</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',Arial,sans-serif;background:#f5f0f0;color:#1a1a2e}
  .wrapper{max-width:700px;margin:24px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.13)}
  .hdr{background:linear-gradient(150deg,#8b0000 0%,#CE1126 40%,#e8192c 70%,#ff4d5e 100%);padding:0;position:relative;overflow:hidden}
  .hdr-stripe{height:7px;background:linear-gradient(90deg,#CE1126 50%,#ffffff 50%)}
  .hdr-inner{padding:42px 44px 36px;text-align:center;position:relative;z-index:2}
  .hdr::before{content:'';position:absolute;top:-60px;right:-60px;width:220px;height:220px;background:rgba(255,255,255,.05);border-radius:50%}
  .hdr::after{content:'';position:absolute;bottom:-50px;left:-50px;width:170px;height:170px;background:rgba(0,0,0,.06);border-radius:50%}
  .id-flag{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.35);padding:6px 18px;border-radius:100px;margin-bottom:18px}
  .flag-strip{display:flex;flex-direction:column;width:28px;height:20px;border-radius:3px;overflow:hidden;border:1.5px solid rgba(255,255,255,.4)}
  .flag-r{height:50%;background:#CE1126}
  .flag-w{height:50%;background:#fff}
  .flag-label{font-size:10px;font-weight:800;color:#fff;letter-spacing:2.5px;text-transform:uppercase}
  .urgent-badge{display:inline-block;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.32);color:#fff;font-size:9.5px;font-weight:800;padding:5px 16px;border-radius:100px;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px}
  .hdr h1{color:#fff;font-size:25px;font-weight:900;letter-spacing:-.4px;line-height:1.3;text-shadow:0 2px 10px rgba(0,0,0,.25)}
  .hdr-desc{color:rgba(255,255,255,.82);font-size:13px;margin-top:8px;line-height:1.6}
  .hdr-sub{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.12);border-radius:8px;padding:8px 18px;margin-top:14px;font-size:12px;color:rgba(255,255,255,.92);font-weight:600}
  .alert-bar{background:#111;color:#fff;text-align:center;padding:11px 16px;font-size:10.5px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase}
  .alert-bar em{color:#ff6b6b;font-style:normal}
  .body{padding:44px}
  p{font-size:14px;line-height:1.9;color:#4a4a60;margin-bottom:16px}
  strong{color:#1a1a2e}
  h2{font-size:11.5px;font-weight:800;color:#CE1126;letter-spacing:1.8px;text-transform:uppercase;margin:30px 0 14px;padding-bottom:8px;border-bottom:2px solid #fecaca}
  .id-card{background:linear-gradient(135deg,#fff5f5,#fffafa);border:1.5px solid #fecaca;border-radius:16px;padding:24px 28px;margin:20px 0;position:relative;overflow:hidden}
  .id-card::before{content:'';position:absolute;left:0;top:0;width:4px;height:100%;background:linear-gradient(180deg,#CE1126,#ff4d5e)}
  .id-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px dashed #fecaca;gap:12px}
  .id-row:last-child{border-bottom:none;padding-bottom:0}
  .id-key{font-size:10.5px;font-weight:700;color:#9a7070;text-transform:uppercase;letter-spacing:.5px;flex-shrink:0}
  .id-val{font-weight:700;color:#1a0a0a;font-size:13px;text-align:right}
  .id-val.ok{color:#15803d}
  .id-val.err{color:#CE1126}
  .err-box{background:#fff5f5;border:1.5px solid #fca5a5;border-radius:14px;padding:22px 26px;margin:22px 0}
  .err-label{font-size:10px;font-weight:800;color:#CE1126;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px}
  .err-msg{font-size:13.5px;color:#7f1d1d;line-height:1.85;font-style:italic;background:#fee2e2;padding:13px 16px;border-radius:10px;border-left:4px solid #CE1126;margin-bottom:12px}
  .err-note{font-size:12.5px;color:#991b1b;line-height:1.8}
  .statement{background:linear-gradient(135deg,#f0fff4,#f7fff7);border:1.5px solid #86efac;border-radius:16px;padding:26px;margin:24px 0}
  .statement-title{font-size:10.5px;font-weight:800;color:#16a34a;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px}
  .stmt-item{display:flex;gap:12px;padding:9px 0;border-bottom:1px dashed #bbf7d0;font-size:13.5px;color:#374151;align-items:flex-start;line-height:1.7}
  .stmt-item:last-child{border-bottom:none;padding-bottom:0}
  .chk{color:#16a34a;font-weight:900;font-size:15px;flex-shrink:0;margin-top:2px}
  .arr{color:#CE1126;font-weight:900;flex-shrink:0;margin-top:2px}
  .timeline{margin:20px 0}
  .tl-item{display:flex;gap:16px;margin-bottom:18px;align-items:flex-start}
  .tl-item:last-child{margin-bottom:0}
  .tl-dot{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;flex-shrink:0;color:#fff}
  .tl-fail{background:linear-gradient(135deg,#CE1126,#e8192c)}
  .tl-wait{background:linear-gradient(135deg,#d97706,#f59e0b)}
  .tl-body{padding-top:6px;flex:1}
  .tl-body h4{font-size:13.5px;font-weight:700;color:#1a1a2e;margin-bottom:5px}
  .tl-body p{font-size:12.5px;color:#6b7280;margin:0;line-height:1.65}
  .demand-box{background:linear-gradient(145deg,#1a0505,#2d0a0a,#1a0505);border-radius:18px;padding:30px 32px;margin:28px 0}
  .demand-box h3{color:#fff;font-size:17px;font-weight:900;margin-bottom:8px}
  .demand-sub{color:rgba(255,255,255,.62);font-size:12.5px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.1)}
  .demand-item{display:flex;gap:12px;font-size:13px;color:rgba(255,255,255,.9);padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07);align-items:flex-start;line-height:1.7}
  .demand-item:last-child{border-bottom:none;padding-bottom:0}
  .d-num{width:28px;height:28px;background:rgba(206,17,38,.55);border:1px solid rgba(255,100,100,.4);color:#fca5a5;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;margin-top:1px}
  .personal{background:linear-gradient(135deg,#fffbeb,#fff8f0);border:1.5px solid #fde68a;border-radius:16px;padding:32px 28px 26px;margin:26px 0;font-size:14px;line-height:1.95;color:#78350f;font-style:italic;position:relative}
  .personal::before{content:'“';font-size:64px;color:#fde68a;position:absolute;top:-8px;left:18px;font-family:Georgia,serif;line-height:1}
  .appeal-box{background:linear-gradient(135deg,#CE1126,#9a0d1e);border-radius:16px;padding:28px 30px;margin:28px 0;text-align:center}
  .appeal-box h3{color:#fff;font-size:18px;font-weight:900;margin-bottom:10px}
  .appeal-box p{color:rgba(255,255,255,.86);font-size:13.5px;line-height:1.82;margin:0}
  .ref-num{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;font-family:monospace;font-size:11px;padding:6px 16px;border-radius:6px;margin-top:14px;letter-spacing:1px}
  .sign{margin-top:32px;padding-top:24px;border-top:1.5px dashed #fecaca}
  .footer{background:#fff5f5;padding:22px 44px;border-top:1.5px solid #fecaca;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
  .fl{font-size:11px;color:#9a7070;line-height:1.7}
  .fr{font-size:10.5px;font-weight:700;color:#CE1126;letter-spacing:.5px}
  .ref{font-family:monospace;background:#fee2e2;padding:2px 8px;border-radius:5px;font-size:10px;color:#7f1d1d}
</style>
</head>
<body>
<div class="wrapper">
  <div class="hdr-stripe"></div>
  <div class="hdr">
    <div class="hdr-inner">
      <div class="id-flag">
        <div class="flag-strip"><div class="flag-r"></div><div class="flag-w"></div></div>
        <span class="flag-label">Warga Negara Indonesia</span>
      </div>
      <div class="urgent-badge">&#9888; Banding Resmi &#8212; Penanganan Segera Diperlukan</div>
      <h1>Permohonan Pemulihan Akun WhatsApp<br>Nomor Indonesia {nomor}</h1>
      <p class="hdr-desc">Surat Banding Formal kepada Tim Dukungan &amp; Keamanan WhatsApp</p>
      <div class="hdr-sub">&#128197; Tanggal: {tanggal} &nbsp;&middot;&nbsp; &#128231; {emailPengirim}</div>
    </div>
  </div>
  <div class="alert-bar">DIPERLUKAN TINJAUAN MANUAL &mdash; <em>Masalah Berlangsung Lama &mdash; Jangan Tutup Otomatis</em></div>

  <div class="body">
    <p>Yth. Tim Dukungan &amp; Keamanan WhatsApp (<em>Trust &amp; Safety Team</em>),</p>
    <p>Saya, pengguna WhatsApp asal <strong>Indonesia</strong> dengan nomor telepon <strong>{nomor}</strong>, dengan hormat mengajukan surat banding resmi ini untuk memohon penanganan segera atas masalah akses akun saya yang telah berlangsung sejak <strong>{tanggal}</strong>.</p>
    <p>Akun saya terus menampilkan pesan error <em>"Login tidak tersedia untuk saat ini"</em> meskipun saya <strong>tidak pernah melanggar satu pun ketentuan layanan WhatsApp</strong>, selalu menggunakan aplikasi resmi, dan nomor Indonesia +62 saya tetap aktif normal. Saya dengan sangat memohon agar seorang anggota tim manusia meninjau kasus ini secara langsung dan segera memperbaiki masalah yang sudah berlarut-larut ini.</p>

    <h2>&#128203; Data Identitas &amp; Detail Akun</h2>
    <div class="id-card">
      <div class="id-row"><span class="id-key">&#128241; Nomor WhatsApp</span><span class="id-val">{nomor}</span></div>
      <div class="id-row"><span class="id-key">&#127988; Kode Negara</span><span class="id-val">+62 &mdash; Indonesia</span></div>
      <div class="id-row"><span class="id-key">&#128197; Masalah Dimulai</span><span class="id-val err">{tanggal}</span></div>
      <div class="id-row"><span class="id-key">&#128680; Status Akun</span><span class="id-val err">LOGIN TIDAK TERSEDIA &mdash; DIBLOKIR</span></div>
      <div class="id-row"><span class="id-key">&#128242; Aplikasi Digunakan</span><span class="id-val ok">WhatsApp Resmi (Play Store / App Store)</span></div>
      <div class="id-row"><span class="id-key">&#128246; Status Nomor Telepon</span><span class="id-val ok">AKTIF &mdash; SMS &amp; panggilan normal</span></div>
      <div class="id-row"><span class="id-key">&#9888; Peringatan Sebelumnya</span><span class="id-val err">TIDAK ADA &mdash; Diblokir tanpa notifikasi</span></div>
      <div class="id-row"><span class="id-key">&#9878; Pelanggaran Ketentuan</span><span class="id-val ok">TIDAK ADA &mdash; Riwayat akun bersih</span></div>
      <div class="id-row"><span class="id-key">&#128231; Email Kontak</span><span class="id-val">{emailPengirim}</span></div>
    </div>

    <h2>&#128683; Detail Pesan Error di Perangkat Saya</h2>
    <div class="err-box">
      <div class="err-label">Pesan Error Tepat yang Muncul di Layar</div>
      <div class="err-msg">"Untuk alasan keamanan, kami tidak bisa memasukkan Anda saat ini. Silakan coba lagi nanti, atau hubungi kami jika butuh bantuan dengan akun Anda."</div>
      <div class="err-note"><strong>&#9888; Catatan Penting:</strong> Pesan ini muncul terus-menerus sejak <strong>{tanggal}</strong> tanpa perubahan apapun. Saya telah mencoba berbagai solusi teknis secara mandiri, namun semuanya gagal. Ini bukan masalah perangkat atau koneksi internet — ini adalah <strong>pemblokiran di tingkat akun/server WhatsApp</strong> yang hanya dapat diselesaikan oleh tim teknis WhatsApp secara langsung. Masalah yang sama terus berulang setiap kali saya mencoba login, tanpa kemajuan apapun hingga hari ini.</div>
    </div>

    <h2>&#9989; Pernyataan Resmi Kepatuhan — Pengguna Indonesia yang Sah</h2>
    <div class="statement">
      <div class="statement-title">&#128220; Bukti Kepatuhan Penuh terhadap Ketentuan Layanan WhatsApp</div>
      <div class="stmt-item"><span class="chk">&#10003;</span>Saya adalah <strong>Warga Negara Indonesia (WNI)</strong> yang menggunakan nomor operator Indonesia (+62) secara sah. Kartu SIM ini terdaftar secara resmi atas nama saya sesuai peraturan registrasi SIM yang berlaku di Indonesia.</div>
      <div class="stmt-item"><span class="chk">&#10003;</span>Saya <strong>TIDAK PERNAH</strong> menggunakan aplikasi WhatsApp modifikasi seperti GB WhatsApp, WhatsApp Plus, YoWhatsApp, FMWhatsApp, atau APK tidak resmi lainnya. Hanya WhatsApp original dari Play Store / App Store yang saya gunakan.</div>
      <div class="stmt-item"><span class="chk">&#10003;</span>Saya <strong>TIDAK PERNAH</strong> mengirim pesan massal, spam, broadcast tidak diminta, atau konten promosi kepada siapapun melalui WhatsApp saya.</div>
      <div class="stmt-item"><span class="chk">&#10003;</span>Saya <strong>TIDAK PERNAH</strong> menggunakan bot, skrip otomatisasi, alat pihak ketiga, atau menyalahgunakan WhatsApp Business API dalam bentuk apapun.</div>
      <div class="stmt-item"><span class="chk">&#10003;</span>Saya <strong>TIDAK PERNAH</strong> melecehkan, mengancam, menipu, atau menyalahgunakan pengguna WhatsApp lain dengan cara apapun.</div>
      <div class="stmt-item"><span class="chk">&#10003;</span>Saya <strong>TIDAK PERNAH</strong> membagikan konten ilegal, kekerasan, SARA, pornografi, atau konten yang melanggar hak cipta melalui WhatsApp.</div>
      <div class="stmt-item"><span class="chk">&#10003;</span>WhatsApp saya digunakan <strong>semata-mata untuk komunikasi pribadi dan profesional yang sah</strong> — berkomunikasi dengan keluarga, teman, dan rekan kerja di Indonesia setiap harinya.</div>
      <div class="stmt-item"><span class="chk">&#10003;</span>Akun ini <strong>tidak pernah sebelumnya dibatasi, diperingatkan, atau diblokir</strong> dalam bentuk apapun oleh WhatsApp sebelum insiden ini terjadi.</div>
    </div>

    <h2>&#128295; Kronologi Upaya Mandiri yang Telah Saya Lakukan</h2>
    <div class="timeline">
      <div class="tl-item">
        <div class="tl-dot tl-fail">1</div>
        <div class="tl-body">
          <h4>Hapus Cache &amp; Data Aplikasi &#8594; Restart Penuh Perangkat</h4>
          <p>Dilakukan berulang kali — pesan error yang sama terus muncul tanpa perubahan apapun setelah restart lengkap perangkat.</p>
        </div>
      </div>
      <div class="tl-item">
        <div class="tl-dot tl-fail">2</div>
        <div class="tl-body">
          <h4>Uninstall Total &amp; Reinstall WhatsApp Versi Terbaru dari Play Store</h4>
          <p>Aplikasi diunduh ulang dari sumber resmi Google Play Store — ketika mencoba login kembali dengan nomor {nomor}, error yang identik langsung muncul kembali.</p>
        </div>
      </div>
      <div class="tl-item">
        <div class="tl-dot tl-fail">3</div>
        <div class="tl-body">
          <h4>Menunggu 24, 48, hingga 72+ Jam Sebelum Mencoba Login Ulang</h4>
          <p>Menunggu dengan harapan sistem WhatsApp memulihkan akses secara otomatis — tidak ada perubahan atau perbaikan setelah periode tunggu tersebut.</p>
        </div>
      </div>
      <div class="tl-item">
        <div class="tl-dot tl-fail">4</div>
        <div class="tl-body">
          <h4>Uji Coba pada Perangkat Berbeda Menggunakan SIM yang Sama</h4>
          <p>Pesan error yang persis sama muncul di perangkat lain — membuktikan masalah ada di tingkat akun/server WhatsApp, bukan pada perangkat saya.</p>
        </div>
      </div>
      <div class="tl-item">
        <div class="tl-dot tl-fail">5</div>
        <div class="tl-body">
          <h4>Berganti Koneksi Internet: WiFi &#8594; Data Seluler &#8594; Jaringan Provider Lain</h4>
          <p>Dicoba dengan berbagai jaringan dan provider internet di Indonesia — hasil tetap sama, error tidak hilang dengan pergantian jaringan apapun.</p>
        </div>
      </div>
      <div class="tl-item">
        <div class="tl-dot tl-fail">6</div>
        <div class="tl-body">
          <h4>Menggunakan Tombol "Hubungi Kami" di Layar Error</h4>
          <p>Sudah digunakan berkali-kali melalui jalur bantuan resmi WhatsApp — hingga saat ini belum ada resolusi yang memadai dan masalah terus berlanjut tanpa penyelesaian.</p>
        </div>
      </div>
      <div class="tl-item">
        <div class="tl-dot tl-wait">&#9733;</div>
        <div class="tl-body">
          <h4>Pengajuan Surat Banding Resmi Ini &mdash; Memohon Tindakan Langsung Tim WhatsApp</h4>
          <p>Ini adalah langkah terakhir yang tersedia bagi saya. Saya memohon dengan sangat agar tim manusia WhatsApp meninjau kasus ini secara langsung dan segera mengambil tindakan perbaikan yang nyata dan tuntas.</p>
        </div>
      </div>
    </div>

    <h2>&#9888; Mengapa Masalah Ini Wajib Ditangani Segera</h2>
    <p>Bagi jutaan orang Indonesia, WhatsApp bukan sekadar aplikasi pesan — ini adalah <strong>infrastruktur komunikasi sehari-hari utama</strong> yang menghubungkan keluarga, pekerjaan, dan kehidupan sosial. Kehilangan akses ke nomor {nomor} ini telah menimbulkan dampak nyata yang sangat signifikan:</p>
    <div class="statement" style="background:linear-gradient(135deg,#fff5f5,#fff0f0);border-color:#fca5a5">
      <div class="stmt-item"><span class="arr">&#8594;</span>Terputusnya komunikasi vital dengan anggota keluarga yang hampir seluruhnya menggunakan WhatsApp sebagai satu-satunya sarana komunikasi digital utama.</div>
      <div class="stmt-item"><span class="arr">&#8594;</span>Kehilangan akses ke grup-grup kerja, pendidikan, dan komunitas yang berisi informasi, koordinasi, dan pengumuman penting.</div>
      <div class="stmt-item"><span class="arr">&#8594;</span>Hilangnya seluruh riwayat percakapan, dokumen penting, foto-foto kenangan, dan media berharga yang tersimpan di dalam akun ini.</div>
      <div class="stmt-item"><span class="arr">&#8594;</span>Ketidaknyamanan dan kerugian yang terus berlanjut setiap harinya tanpa ada penjelasan atau solusi yang jelas dari pihak WhatsApp mengenai penyebab pemblokiran ini.</div>
    </div>

    <div class="personal">
      Saya ingin menyampaikan dari lubuk hati yang paling dalam: <strong>saya adalah warga Indonesia biasa yang tidak mengerti mengapa akun saya tiba-tiba diblokir tanpa alasan yang jelas.</strong> Saya tidak melakukan satu pun pelanggaran. Saya hanya menggunakan WhatsApp untuk berkomunikasi dengan keluarga dan teman-teman saya, persis seperti yang dilakukan oleh ratusan juta orang Indonesia setiap harinya. Yang saya butuhkan hanyalah satu tinjauan yang adil oleh manusia — bukan sistem otomatis — yang akan membuktikan bahwa tidak ada pelanggaran apapun dalam riwayat akun ini. Tolong berikan kesempatan yang adil itu kepada saya.
    </div>

    <div style="background:linear-gradient(135deg,#fff5f5,#fef2f2);border:2px solid #CE1126;border-radius:16px;padding:28px 32px;margin:24px 0">
      <h2 style="color:#CE1126;font-size:17px;font-weight:900;margin:0 0 18px;letter-spacing:-.2px">&#x1F50D; BUKTI DEFINITIF: Ini Adalah False Positive Sistem Otomatis</h2>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="background:#fff;border-left:4px solid #CE1126;border-radius:8px;padding:14px 18px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#CE1126">BUKTI 1 — Riwayat Akun Bersih Sempurna</p>
          <p style="margin:0;font-size:13px;color:#555;line-height:1.7">Akun <strong>{nomor}</strong> tidak memiliki satu pun peringatan, flag, atau riwayat pelanggaran sejak pertama kali aktif. Tidak ada spam, tidak ada broadcast massal, tidak ada aplikasi pihak ketiga. Penggunaan 100% organik dan personal.</p>
        </div>
        <div style="background:#fff;border-left:4px solid #CE1126;border-radius:8px;padding:14px 18px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#CE1126">BUKTI 2 — Error Persisten di Semua Perangkat &amp; Jaringan</p>
          <p style="margin:0;font-size:13px;color:#555;line-height:1.7">Pemblokiran tetap terjadi setelah reinstall penuh, ganti perangkat (3+ perangkat berbeda), ganti jaringan (WiFi rumah, data seluler, WiFi publik), dan nonaktifkan VPN. Ini membuktikan masalah ada di <strong>sisi server WhatsApp</strong>, bukan di perangkat saya.</p>
        </div>
        <div style="background:#fff;border-left:4px solid #CE1126;border-radius:8px;padding:14px 18px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#CE1126">BUKTI 3 — Tidak Ada Eskalasi Bertahap</p>
          <p style="margin:0;font-size:13px;color:#555;line-height:1.7">Pemblokiran permanen diterapkan secara tiba-tiba tanpa peringatan awal, tanpa kesempatan klarifikasi, dan tanpa proses eskalasi bertahap yang adil. Pola ini sangat khas dari kesalahan sistem deteksi otomatis (<em>automated false positive</em>), bukan pelanggaran nyata yang sengaja dilakukan.</p>
        </div>
        <div style="background:#fff;border-left:4px solid #CE1126;border-radius:8px;padding:14px 18px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#CE1126">BUKTI 4 — Layanan Komunikasi Lain Berjalan Normal</p>
          <p style="margin:0;font-size:13px;color:#555;line-height:1.7">Nomor operator <strong>+62</strong> ini aktif dan berfungsi sempurna untuk SMS, telepon, dan aplikasi lain. Tidak ada pembatasan dari operator. Hanya WhatsApp yang bermasalah — ini membuktikan masalah bukan dari perangkat, operator, atau perilaku pengguna, melainkan dari logika deteksi sisi server WhatsApp.</p>
        </div>
      </div>
    </div>

    <div style="background:linear-gradient(135deg,#f0fff4,#ecfdf5);border:2px solid #16a34a;border-radius:16px;padding:24px 28px;margin:20px 0">
      <h2 style="color:#15803d;font-size:16px;font-weight:900;margin:0 0 14px">&#9878; Landasan Hukum &amp; Konsekuensi Eskalasi</h2>
      <p style="margin:0 0 12px;font-size:13px;color:#555;line-height:1.75">Sebagai Warga Negara Indonesia, saya dilindungi oleh <strong>UU No. 8 Tahun 1999 tentang Perlindungan Konsumen</strong> (Pasal 4: hak atas kenyamanan dan keamanan layanan) dan <strong>UU No. 11 Tahun 2008 tentang ITE</strong>. Pemutusan akses layanan digital tanpa dasar yang jelas merupakan bentuk pelanggaran hak konsumen yang dapat dilaporkan secara resmi.</p>
      <p style="margin:0;font-size:13px;color:#15803d;font-weight:700;line-height:1.75">Jika tidak ada respons konkret dalam <strong>48 jam</strong>, saya akan melanjutkan eskalasi ke: (1) <strong>Kementerian Kominfo RI</strong> melalui kanal pengaduan resmi aduankominfo.id, (2) <strong>YLKI (Yayasan Lembaga Konsumen Indonesia)</strong>, dan (3) <strong>media sosial &amp; komunitas pengguna Indonesia</strong> untuk mempublikasikan kasus ini secara luas. Saya berharap penyelesaian dapat terjadi melalui jalur baik-baik terlebih dahulu.</p>
    </div>

    <div class="demand-box">
      <h3>Permintaan Resmi kepada Tim WhatsApp</h3>
      <p class="demand-sub">Sebagai pengguna Indonesia yang sah dan telah lama mempercayai layanan WhatsApp, saya secara resmi memohon tindakan konkret berikut:</p>
      <div class="demand-item">
        <div class="d-num">1</div>
        <span>Lakukan <strong>tinjauan manual langsung oleh anggota tim manusia</strong> — bukan sistem otomatis — terhadap akun <strong>{nomor}</strong> dan verifikasi bahwa tidak ada satu pun pelanggaran yang pernah dilakukan dalam riwayat akun ini.</span>
      </div>
      <div class="demand-item">
        <div class="d-num">2</div>
        <span><strong>Pulihkan penuh akses ke akun</strong> {nomor} beserta seluruh riwayat percakapan, media, dan keanggotaan grup yang ada, tanpa pengurangan apapun.</span>
      </div>
      <div class="demand-item">
        <div class="d-num">3</div>
        <span>Kirimkan <strong>konfirmasi tertulis resmi</strong> ke <strong>{emailPengirim}</strong> bahwa pemulihan telah diproses, disertai penjelasan yang jelas dan transparan mengenai penyebab pemblokiran ini.</span>
      </div>
      <div class="demand-item">
        <div class="d-num">4</div>
        <span>Apabila ini merupakan <strong>kesalahan sistem (false positive)</strong>, lakukan pengakuan resmi dan perbaikan sistem agar kejadian serupa tidak lagi menimpa pengguna Indonesia yang tidak bersalah lainnya di masa mendatang.</span>
      </div>
      <div class="demand-item">
        <div class="d-num">5</div>
        <span><strong>Berikan respons dan tindak lanjut nyata dalam 48 jam</strong> sejak surat ini diterima — masalah ini telah berlangsung jauh terlalu lama dan sudah waktunya diselesaikan secara tuntas oleh pihak WhatsApp.</span>
      </div>
    </div>

    <div class="appeal-box">
      <h3>&#128591; Ini adalah Banding Resmi Saya kepada Tim WhatsApp</h3>
      <p>Saya memahami sepenuhnya bahwa WhatsApp harus melindungi platform dari penyalahgunaan, dan saya sangat menghormati upaya tersebut. Saya pun bersedia sepenuhnya bekerja sama dengan proses verifikasi identitas apapun yang diperlukan tim Anda. Yang saya mohonkan hanyalah satu hal: <strong>tinjauan yang adil dan jujur oleh seorang anggota tim manusia.</strong> Saya yakin sepenuhnya bahwa pemeriksaan tersebut tidak akan menemukan satu pun pelanggaran dalam akun saya.</p>
      <div class="ref-num">REF: WA-ID62-APPEAL-{nomor}-{tanggal}</div>
    </div>

    <div class="sign">
      <p style="font-size:14px;color:#9a7070">Dengan hormat, tulus, dan penuh harapan,</p>
      <p style="margin-top:8px;font-size:16px;font-weight:800;color:#CE1126">{namaPengirim}</p>
      <p style="margin-top:10px;font-size:17px;font-weight:900;color:#CE1126">{nomor}</p>
      <p style="font-size:13px;color:#7a5060;margin-top:4px">&#128231; {emailPengirim}</p>
      <p style="margin-top:6px;font-size:12px;color:#9a8080;font-style:italic">Warga Negara Indonesia &mdash; Pengguna WhatsApp Resmi &mdash; Surat Banding Formal &mdash; {tanggal}</p>
    </div>
  </div>

  <div class="footer">
    <div class="fl">Referensi: <span class="ref">WA-ID62-{nomor}-{tanggal}</span><br>Balas ke: <strong>{emailPengirim}</strong> &mdash; Surat Banding Resmi Pengguna Indonesia +62</div>
    <div class="fr">&#x1F1EE;&#x1F1E9; Indonesia &middot; +62 &middot; {tanggal}</div>
  </div>
</div>
</body>
</html>`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPLATE 7 — Premium Full Technical (Opsi 💎 Lengkap)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 7,
    name: "💎 Premium Full",
    subject: "URGENT: Account Restricted - Immediate Review Required - {nomor} - Complete Technical Analysis Included",
    description: "Template Premium paling lengkap dan komprehensif. 4 blok bukti definitif, troubleshooting exhaustive, compliance statement, dan escalation demand. Efektif untuk semua nomor internasional.",
    color: "#075E54",
    icon: "💎",
    htmlBody: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>URGENT Account Recovery Request</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5">
<div style="font-family:'Arial',sans-serif;line-height:1.8;color:#222;max-width:900px;margin:0 auto;padding:20px;background-color:#f5f5f5">
  <div style="background:linear-gradient(135deg,#075E54 0%,#25D366 100%);color:white;padding:30px;border-radius:12px;margin-bottom:25px;box-shadow:0 6px 15px rgba(0,0,0,0.15);text-align:center">
    <h1 style="margin:0;font-size:28px;font-weight:bold;letter-spacing:1px">⚠️ URGENT ACCOUNT RECOVERY REQUEST</h1>
    <p style="margin:10px 0 0;font-size:16px;opacity:.95">False Positive Detection - Immediate Review Required</p>
  </div>

  <div style="background:white;padding:30px;border-radius:12px;border-left:8px solid #075E54;margin-bottom:20px;box-shadow:0 3px 10px rgba(0,0,0,0.08)">
    <h2 style="color:#075E54;font-size:22px;margin-top:0;border-bottom:3px solid #25D366;padding-bottom:15px">Account Information</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:15px">
      <div><strong>Phone Number:</strong><br/><span style="color:#075E54;font-size:18px;font-weight:bold">{nomor}</span></div>
      <div><strong>Account Owner:</strong><br/><span style="color:#075E54;font-size:18px;font-weight:bold">{namaPengirim}</span></div>
      <div><strong>Status:</strong><br/><span style="color:#cc0000;font-size:18px;font-weight:bold">⚠️ RESTRICTED</span></div>
      <div><strong>Issue Type:</strong><br/><span style="color:#cc0000">False Positive Detection</span></div>
      <div><strong>Date of Issue:</strong><br/><span style="color:#555">{tanggal}</span></div>
      <div><strong>Compliance History:</strong><br/><span style="color:#16a34a;font-weight:bold">PERFECT — ZERO VIOLATIONS</span></div>
    </div>
  </div>

  <div style="background:white;padding:25px;border-radius:12px;margin-bottom:20px;box-shadow:0 3px 10px rgba(0,0,0,0.08)">
    <h2 style="color:#075E54;font-size:20px;margin-top:0">The Problem — False Positive Detection</h2>
    <p>My account has been incorrectly flagged and restricted. I, <strong>{namaPengirim}</strong>, am the legitimate sole owner of this account and have:</p>
    <ul style="margin:15px 0;padding-left:25px">
      <li><strong>NEVER sent spam or violated Terms of Service</strong></li>
      <li><strong>ALWAYS used only the official WhatsApp application</strong></li>
      <li><strong>ZERO warnings, flags, or prior violations</strong></li>
      <li><strong>PERFECT account compliance history since creation</strong></li>
      <li><strong>LEGITIMATE personal communications only</strong></li>
      <li><strong>NO third-party apps, automation, or bulk messaging</strong></li>
    </ul>
    <p style="background:#fff3cd;padding:20px;border-left:5px solid #ffc107;border-radius:5px;margin:20px 0">
      <strong style="color:#856404">⚠️ This is a FALSE POSITIVE error in your automated detection system.</strong><br/>
      My account is 100% legitimate and should be restored immediately.
    </p>
  </div>

  <div style="background:white;padding:25px;border-radius:12px;margin-bottom:20px;box-shadow:0 3px 10px rgba(0,0,0,0.08)">
    <h2 style="color:#075E54;font-size:20px;margin-top:0">Troubleshooting Completed — Definitive Server-Side Proof</h2>
    <p>I have already performed comprehensive troubleshooting (the error persists across multiple devices and networks, <strong>definitively confirming this is a backend server-side issue</strong>):</p>
    <ul style="margin:15px 0;padding-left:25px">
      <li>✓ Waited 24+ hours as instructed in restriction notice</li>
      <li>✓ Uninstalled and completely reinstalled WhatsApp application</li>
      <li>✓ Cleared all app cache and data</li>
      <li>✓ Attempted login from multiple networks (WiFi, mobile data, roaming)</li>
      <li>✓ Tried from 3+ different devices (multiple phones and tablets)</li>
      <li>✓ Updated WhatsApp to the absolute latest available version</li>
      <li>✓ Verified phone number is active with carrier</li>
      <li>✓ Confirmed device is not rooted/jailbroken</li>
      <li>✓ Tested with WiFi, VPN, and all security apps disabled</li>
      <li>✓ Verified zero malware or suspicious applications on device</li>
    </ul>
    <p style="color:#cc0000;font-weight:bold;margin-top:15px">Since error persists across ALL devices and networks → This is a BACKEND SERVER ISSUE. Only WhatsApp's technical team can resolve this.</p>
  </div>

  <div style="background:#e8f5e9;padding:25px;border-radius:12px;border-left:5px solid #4caf50;margin-bottom:20px">
    <h2 style="color:#2e7d32;font-size:20px;margin-top:0">4-Point Definitive Evidence: This Is a System Error</h2>
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:16px">
      <div style="background:#fff;border-left:4px solid #2e7d32;border-radius:8px;padding:14px 18px">
        <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#2e7d32">EVIDENCE 1 — Perfect Account History</p>
        <p style="margin:0;font-size:13px;color:#555;line-height:1.7">Account <strong>{nomor}</strong> created years ago with zero warnings, zero prior restrictions, and zero violations. All messages are genuine personal communications with zero mass messaging or automation of any kind.</p>
      </div>
      <div style="background:#fff;border-left:4px solid #2e7d32;border-radius:8px;padding:14px 18px">
        <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#2e7d32">EVIDENCE 2 — Restriction Persists Across Full Device Reset</p>
        <p style="margin:0;font-size:13px;color:#555;line-height:1.7">Error persists on multiple different devices, different networks, and fresh app installations with no third-party apps. This <strong>proves the problem is server-side</strong>, completely impossible to resolve by client-side actions.</p>
      </div>
      <div style="background:#fff;border-left:4px solid #2e7d32;border-radius:8px;padding:14px 18px">
        <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#2e7d32">EVIDENCE 3 — Zero Prior Warning — Sudden Permanent Restriction</p>
        <p style="margin:0;font-size:13px;color:#555;line-height:1.7">Permanent restriction applied with zero prior warnings, zero graduated enforcement, and zero opportunity to clarify or appeal. This pattern is characteristic of <em>automated false positive detection</em>, not genuine policy violations.</p>
      </div>
      <div style="background:#fff;border-left:4px solid #2e7d32;border-radius:8px;padding:14px 18px">
        <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#2e7d32">EVIDENCE 4 — All Other Services Work Normally</p>
        <p style="margin:0;font-size:13px;color:#555;line-height:1.7">Phone carrier confirms number <strong>{nomor}</strong> is fully active and clean. SMS, calls, and other apps work perfectly. Only WhatsApp restriction applied — definitively proving account is not compromised and problem is WhatsApp-side only.</p>
      </div>
    </div>
  </div>

  <div style="background:white;padding:25px;border-radius:12px;border-left:8px solid #ff9800;margin-bottom:20px;box-shadow:0 3px 10px rgba(0,0,0,0.08)">
    <h2 style="color:#e65100;font-size:20px;margin-top:0">⚡ Urgent Actions Required — Within 24 Hours</h2>
    <ol style="margin:15px 0;padding-left:25px">
      <li style="margin-bottom:10px"><strong>REVIEW</strong> — Immediately review account <strong>{nomor}</strong>; verify it is 100% legitimate</li>
      <li style="margin-bottom:10px"><strong>VERIFY</strong> — Confirm I, <strong>{namaPengirim}</strong>, have not violated any Terms of Service</li>
      <li style="margin-bottom:10px"><strong>INVESTIGATE</strong> — Determine why the automated system incorrectly flagged a legitimate account</li>
      <li style="margin-bottom:10px"><strong>REMOVE</strong> — Remove the incorrect restriction flag from the account</li>
      <li style="margin-bottom:10px"><strong>RESTORE</strong> — Restore full, complete account access immediately</li>
      <li style="margin-bottom:10px"><strong>CONFIRM</strong> — Send confirmation to <strong>{emailPengirim}</strong> that the account is accessible again</li>
    </ol>
    <p style="margin-top:20px;color:#ff0000;font-weight:bold;font-size:15px">⏰ TIME-SENSITIVE: Every day of restriction causes irreversible damage to personal and professional relationships. This requires resolution within 24 hours.</p>
  </div>

  <div style="background:white;padding:25px;border-radius:12px;text-align:center;border-top:4px solid #075E54;box-shadow:0 3px 10px rgba(0,0,0,0.08);margin-bottom:20px">
    <p style="color:#075E54;font-weight:bold;font-size:18px;margin:0 0 15px">This Is a Legitimate Account Being Wrongly Restricted</p>
    <p style="color:#666;font-size:14px;margin:0 0 15px">I am a legitimate WhatsApp user committed to all Terms of Service. I only use the official WhatsApp application. I never send spam, harassment, or automated messages. This account is SAFE, LEGITIMATE, and WORTHY of immediate restoration.</p>
    <p style="color:#075E54;font-weight:bold;font-size:15px;margin:0 0 20px">Please restore my account immediately. Thank you for your urgent attention.</p>
    <div style="border-top:1px dashed #25D366;padding-top:18px;margin-top:5px">
      <p style="margin:0;font-size:15px;font-weight:800;color:#075E54">{namaPengirim}</p>
      <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#333">{nomor}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#666">📧 {emailPengirim}</p>
      <p style="margin:6px 0 0;font-size:12px;color:#999;font-style:italic">Legitimate WhatsApp Account Owner — Date: {tanggal}</p>
    </div>
  </div>
</div>
</body>
</html>`,
  },
];