'use strict';

/**
 * wa-checker.js — WA Number Status via Encrypted Registration API
 *
 * Signature mapping (from raw API testing):
 *
 * BANNED (number-level WA ban):
 *   reason: "blocked" + violation_type present (e.g. 15) + NO custom_block_screen
 *   Fields: appeal_token, in_app_ban_appeal, login, reason, status, violation_type
 *
 * IP/CLIENT BLOCKED (Replit datacenter IP flagged by WA):
 *   custom_block_screen present + reason: "blocked" + NO violation_type
 *   → tells us nothing about the number, return UNKNOWN
 *
 * PER-NUMBER COOLDOWN (SMS was sent to this number recently):
 *   reason: "too_recent" + retry_after or sms_wait (seconds)
 *
 * IP RATE LIMIT (too many requests from our IP):
 *   reason: "too_many"  → tells us nothing about the number
 *
 * NOT REGISTERED (number not in WA database):
 *   /exist: reason: "incorrect"
 *
 * REGISTERED (number IS on WA):
 *   /exist: status: "ok"
 *   OR /code wa_old: status: "sent"
 *
 * SMS: OK (not on WA, can receive SMS):
 *   /code sms: status: "sent"
 */

const crypto  = require('crypto');
const https   = require('https');
const curveJs = require('curve25519-js');
const { v4: uuidv4 } = require('uuid');

// WA registration server public key (X25519, 32 bytes)
const REG_PUBLIC_KEY = Buffer.from(
  '8e8c0f74c3ebc5d7a6865c6c3c843856b06121cce8ea774d22fb6f122512302d', 'hex'
);

const IOS_STATIC_TOKEN = '0a1mLfGUIBVrMKF1RdvLI5lkRBvof6vn0fD2QRSM';
const IOS_VERSION      = '2.26.9.75';
const IOS_UA           = `WhatsApp/${IOS_VERSION} iOS/17.4.1 Device/iPhone15,4`;

// ── token ────────────────────────────────────────────────────────────────────
function computeToken(national) {
  const vHash = crypto.createHash('md5').update(IOS_VERSION, 'utf8').digest('hex');
  return crypto.createHash('md5').update(IOS_STATIC_TOKEN + vHash + national, 'utf8').digest('hex');
}

// ── X25519 helpers ────────────────────────────────────────────────────────────
function generateKeyPair() {
  const seed = crypto.randomBytes(32);
  const kp   = curveJs.generateKeyPair(seed);
  return {
    private: Buffer.from(kp.private),
    public:  Buffer.concat([Buffer.from([0x05]), Buffer.from(kp.public)])
  };
}
function sign(priv32, msg) { return Buffer.from(curveJs.sign(priv32, msg)); }
function stripPrefix(buf)  { return (buf.length === 33 && buf[0] === 0x05) ? buf.slice(1) : buf; }

// ── encoding ──────────────────────────────────────────────────────────────────
function toBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}
function intToBytes(n, len) {
  const buf = Buffer.alloc(len);
  for (let i = len - 1; i >= 0; i--) { buf[i] = n & 0xff; n >>= 8; }
  return buf;
}
function toUrlHex(buf) {
  return Array.from(buf).map(b => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
}
function buildForm(pairs) {
  const parts = [];
  for (let i = 0; i < pairs.length; i += 2) {
    if (pairs[i + 1] == null) continue;
    parts.push(pairs[i] + '=' + pairs[i + 1]);
  }
  return parts.join('&');
}

// ── AES-256-GCM encrypt ───────────────────────────────────────────────────────
function encryptPayload(plaintext) {
  const seed   = crypto.randomBytes(32);
  const ephKp  = curveJs.generateKeyPair(seed);
  const ephPub = Buffer.from(ephKp.public);
  const shared = Buffer.from(curveJs.sharedKey(ephKp.private, REG_PUBLIC_KEY));
  const iv     = Buffer.alloc(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', shared, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return toBase64Url(Buffer.concat([ephPub, enc, tag]));
}

// ── phone parsing ─────────────────────────────────────────────────────────────
const TWO_DIGIT_CCS = new Set([
  '20','27','30','31','32','33','34','36','39','40','41','43','44','45',
  '46','47','48','49','51','52','53','54','55','56','57','58','60','61',
  '62','63','64','65','66','81','82','84','86','90','91','92','93','94','95','98'
]);
const THREE_DIGIT_CCS = new Set([
  '355','213','376','244','374','297','994','387','880','226','591','238',
  '237','236','242','225','269','506','357','253','291','240','251','372',
  '241','995','594','233','299','220','224','245','592','246','964','354','962',
  '996','855','686','850','965','856','423','231','266','370','218','221',
  '960','265','976','258','264','977','674','505','687','227','968','507',
  '675','680','595','974','250','677','248','963','503','268','235','228',
  '676','256','255','234','358','380','353','420','966','971','972'
]);

function parsePhone(raw) {
  const str = String(raw).replace(/\D/g, '');
  if (THREE_DIGIT_CCS.has(str.slice(0, 3))) return { cc: str.slice(0, 3), national: str.slice(3) };
  if (TWO_DIGIT_CCS.has(str.slice(0, 2)))   return { cc: str.slice(0, 2), national: str.slice(2) };
  return { cc: str.slice(0, 1), national: str.slice(1) };
}

const COUNTRY_META = {
  '1':  { mcc: '310', mnc: '410' }, '7':  { mcc: '250', mnc: '01' },
  '20': { mcc: '602', mnc: '01' }, '27': { mcc: '655', mnc: '10' },
  '44': { mcc: '234', mnc: '30' }, '49': { mcc: '262', mnc: '01' },
  '55': { mcc: '724', mnc: '05' }, '60': { mcc: '502', mnc: '12' },
  '62': { mcc: '510', mnc: '01' }, '63': { mcc: '515', mnc: '01' },
  '65': { mcc: '525', mnc: '01' }, '66': { mcc: '520', mnc: '01' },
  '81': { mcc: '440', mnc: '10' }, '82': { mcc: '450', mnc: '05' },
  '84': { mcc: '452', mnc: '01' }, '86': { mcc: '460', mnc: '00' },
  '90': { mcc: '286', mnc: '01' }, '91': { mcc: '404', mnc: '20' },
  '92': { mcc: '410', mnc: '01' }, '234': { mcc: '621', mnc: '20' },
  '966': { mcc: '420', mnc: '01' }, '971': { mcc: '424', mnc: '02' },
  '880': { mcc: '470', mnc: '01' },
};
function getMeta(cc) { return COUNTRY_META[cc] || { mcc: '000', mnc: '000' }; }

// ── ephemeral store ───────────────────────────────────────────────────────────
function createStore(phoneNumber) {
  const noiseKP = generateKeyPair();
  const identKP = generateKeyPair();
  const spkKP   = generateKeyPair();
  const spkId   = (crypto.randomBytes(3).readUIntBE(0, 3) & 0xffffff) || 1;
  const sig     = sign(identKP.private, spkKP.public);
  return {
    phoneNumber,
    noiseKP, identKP, spkKP, spkId, sig,
    regId:      (crypto.randomBytes(2).readUInt16BE(0) & 0x3fff) + 1,
    fdid:       uuidv4(),
    deviceId:   crypto.randomBytes(16),
    identityId: crypto.randomBytes(16),
  };
}

// ── HTTP POST ─────────────────────────────────────────────────────────────────
function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: 'v.whatsapp.net',
      port: 443,
      path: '/v2' + path,
      method: 'POST',
      timeout: 18000,
      headers: {
        'User-Agent':     IOS_UA,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': bodyBuf.length,
        'Accept':         'application/json',
      }
    }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(text)); }
        catch (_) { resolve({ raw: text }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('WA API timeout')));
    req.write(bodyBuf);
    req.end();
  });
}

// ── build encrypted request ───────────────────────────────────────────────────
async function sendRequest(path, store, extraPairs) {
  const { cc, national } = parsePhone(store.phoneNumber);
  const token = computeToken(national);

  const plain = buildForm([
    'cc',         cc,
    'in',         national,
    'rc',         '0',
    'lg',         'en',
    'lc',         'US',
    'authkey',    toBase64Url(stripPrefix(store.noiseKP.public)),
    'e_regid',    toBase64Url(intToBytes(store.regId, 4)),
    'e_keytype',  toBase64Url(Buffer.from([5])),
    'e_ident',    toBase64Url(stripPrefix(store.identKP.public)),
    'e_skey_id',  toBase64Url(intToBytes(store.spkId, 3)),
    'e_skey_val', toBase64Url(stripPrefix(store.spkKP.public)),
    'e_skey_sig', toBase64Url(store.sig),
    'fdid',       store.fdid.toUpperCase(),
    'expid',      toBase64Url(store.deviceId),
    'id',         toUrlHex(store.identityId),
    'token',      token,
    ...(extraPairs || [])
  ]);

  const enc = encryptPayload(plain);
  return httpPost(path, 'ENC=' + enc);
}

// ── response classifiers (based on actual raw API response signatures) ────────

// NUMBER IS BANNED: reason=blocked + violation_type present + NO custom_block_screen
// Confirmed signature: { appeal_token, in_app_ban_appeal, login, reason:"blocked", status:"fail", violation_type:"15" }
function isNumberBanned(r) {
  return r &&
    r.reason === 'blocked' &&
    r.violation_type !== undefined &&
    !r.custom_block_screen;
}

// OUR IP IS BLOCKED (datacenter flagged): custom_block_screen present + NO violation_type
// This tells us NOTHING about the number itself
function isIpBlocked(r) {
  return r && !!r.custom_block_screen && r.violation_type === undefined;
}

// PER-NUMBER COOLDOWN: reason=too_recent (previous SMS/code was sent to this number recently)
// Contains real retry_after / sms_wait in seconds
function isPerNumberCooldown(r) {
  return r && r.reason === 'too_recent';
}

// IP RATE LIMIT (too many requests from our IP — tells us nothing about number)
function isIpRateLimit(r) {
  return r && r.reason === 'too_many';
}

// SUCCESS: status=ok or status=sent
function isSuccess(r) {
  return r && (r.status === 'ok' || r.status === 'sent');
}

// ── PUBLIC: checkWANumber ─────────────────────────────────────────────────────
/**
 * Returns:
 *   { status, rawStatus, note, waitSec? }
 *
 * status values:
 *   'registered'          — nomor AKTIF di WA
 *   'registered_blocked'  — nomor BANNED oleh WA (violation_type present)
 *   'not_registered'      — tidak di WA, SMS berhasil dikirim (SMS: OK)
 *   'cooldown'            — per-nomor cooldown (SMS baru-baru ini dikirim ke nomor ini)
 *   'unknown'             — tidak bisa tentukan (IP datacenter diblokir WA)
 */
async function checkWANumber(phoneNumber) {
  phoneNumber = String(phoneNumber).replace(/\D/g, '');
  const store = createStore(phoneNumber);
  const { cc }  = parsePhone(phoneNumber);
  const meta    = getMeta(cc);
  const baseExtra = [
    'sim_mcc', meta.mcc, 'sim_mnc', meta.mnc, 'reason', '', 'cellular_strength', '1'
  ];

  // ── Step 1: /exist ────────────────────────────────────────────────────────
  // Best signal for REGISTERED (status:ok) and BANNED (reason:blocked+violation_type)
  // NOT rate-limited since it doesn't send any codes
  try {
    const r = await sendRequest('/exist', store, null);

    if (isSuccess(r)) {
      return { status: 'registered', rawStatus: 'exist:ok', note: 'Nomor aktif di WhatsApp' };
    }

    if (isNumberBanned(r)) {
      const vtype = r.violation_type;
      return {
        status: 'registered_blocked',
        rawStatus: `exist:banned:v${vtype}`,
        note: `WA banned — violation_type ${vtype}${r.in_app_ban_appeal ? ' (bisa appeal di app)' : ''}`,
      };
    }

    // reason: "incorrect" = number NOT found with this key (normal for unregistered)
    // Continue to /code for more signals
  } catch (_) {}

  // ── Step 2: /code wa_old ─────────────────────────────────────────────────
  // status:sent = REGISTERED (WA delivered OTP to existing device)
  // wa_old_wait:-1 = number NOT on WA (wa_old delivery impossible)
  try {
    const r = await sendRequest('/code', store, ['method', 'wa_old', ...baseExtra]);

    if (isSuccess(r)) {
      return { status: 'registered', rawStatus: 'wa_old:sent', note: 'Nomor aktif di WA. Code dikirim via WA.' };
    }

    if (isNumberBanned(r)) {
      return {
        status: 'registered_blocked',
        rawStatus: `wa_old:banned:v${r.violation_type}`,
        note: `WA banned — violation_type ${r.violation_type}`,
      };
    }

    // isIpRateLimit → too_many = IP rate limit, not number info. Continue.
    // wa_old_wait:-1 = strong hint number is NOT on WA. Keep this for step 3 context.
  } catch (_) {}

  // ── Step 3: /code sms ────────────────────────────────────────────────────
  // status:sent = SMS: OK (number NOT on WA but can receive SMS)
  // reason:too_recent = per-number COOLDOWN (real info about number history)
  // custom_block_screen = our IP is flagged (no number info)
  try {
    const r = await sendRequest('/code', store, ['method', 'sms', ...baseExtra]);

    if (isSuccess(r)) {
      return { status: 'not_registered', rawStatus: 'sms:sent', note: 'Tidak di WA. SMS berhasil dikirim.' };
    }

    if (isNumberBanned(r)) {
      return {
        status: 'registered_blocked',
        rawStatus: `sms:banned:v${r.violation_type}`,
        note: `WA banned — violation_type ${r.violation_type}`,
      };
    }

    if (isPerNumberCooldown(r)) {
      const waitSec = r.retry_after || r.sms_wait || null;
      const waitMin = waitSec ? Math.ceil(waitSec / 60) : null;
      return {
        status: 'cooldown',
        rawStatus: 'sms:too_recent',
        note: waitMin ? `Coba lagi dalam ${waitMin} menit` : 'Coba lagi nanti',
        waitSec,
      };
    }

    if (isIpBlocked(r)) {
      // Our datacenter IP is blocked. Can't determine number status.
      return { status: 'unknown', rawStatus: 'ip:blocked', note: 'IP datacenter diblokir WA. Tidak bisa cek.' };
    }

    if (isIpRateLimit(r)) {
      return { status: 'unknown', rawStatus: 'ip:ratelimit', note: 'Too many requests dari IP ini.' };
    }

    // Any other response — capture raw status for debugging
    const raw = r ? `${r.status||''}:${r.reason||''}` : 'no_response';
    return { status: 'unknown', rawStatus: raw, note: `Raw: ${raw}` };

  } catch (e) {
    return { status: 'unknown', rawStatus: 'error', note: e.message };
  }
}

module.exports = { checkWANumber };
