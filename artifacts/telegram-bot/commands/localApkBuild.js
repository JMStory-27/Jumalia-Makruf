'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const JDK       = '/nix/store/023zqb5jvvjhv5l1b0fzdaqxy8c7ilcl-adoptopenjdk-openj9-bin-11.0.11/bin';
const AAPT2     = '/nix/store/4dvbi9mkj92hkirxhxrc9glwhyxcg3w1-aapt-8.0.2-9289358/bin/aapt2';
const APKSIGNER = '/nix/store/fhmi90kjidpkkmcppc15knvy1c3a35jj-apksigner-34.0.5-unstable-2024-03-06/bin/apksigner';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const SMALI_JARS = [
  '/tmp/smali.jar', '/tmp/dexlib2.jar', '/tmp/smali-util.jar',
  '/tmp/antlr.jar', '/tmp/antlr-runtime.jar', '/tmp/jcommander.jar', '/tmp/guava.jar',
];
const ANDROID_JAR = '/tmp/android.jar';
const SMALI_CP    = SMALI_JARS.join(':');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, ...opts });
  if (r.status !== 0 || r.error) {
    const stderr = r.stderr?.toString() || '';
    throw new Error(`${path.basename(cmd)} failed (${r.status ?? r.error?.code}): ${stderr.slice(0, 500)}`);
  }
  return r.stdout?.toString() || '';
}

function jarsReady() {
  return [...SMALI_JARS, ANDROID_JAR].every(j => {
    try { return fs.statSync(j).size > 10_000; } catch { return false; }
  });
}

async function downloadJars(onProgress) {
  const deps = [
    ['https://repo1.maven.org/maven2/org/smali/smali/2.5.2/smali-2.5.2.jar',                     '/tmp/smali.jar'],
    ['https://repo1.maven.org/maven2/org/smali/dexlib2/2.5.2/dexlib2-2.5.2.jar',                 '/tmp/dexlib2.jar'],
    ['https://repo1.maven.org/maven2/org/smali/util/2.5.2/util-2.5.2.jar',                       '/tmp/smali-util.jar'],
    ['https://repo1.maven.org/maven2/org/antlr/antlr/3.5.2/antlr-3.5.2.jar',                    '/tmp/antlr.jar'],
    ['https://repo1.maven.org/maven2/org/antlr/antlr-runtime/3.5.2/antlr-runtime-3.5.2.jar',     '/tmp/antlr-runtime.jar'],
    ['https://repo1.maven.org/maven2/com/beust/jcommander/1.64/jcommander-1.64.jar',             '/tmp/jcommander.jar'],
    ['https://repo1.maven.org/maven2/com/google/guava/guava/27.1-android/guava-27.1-android.jar', '/tmp/guava.jar'],
    ['https://repo1.maven.org/maven2/com/google/android/android/4.1.1.4/android-4.1.1.4.jar',    '/tmp/android.jar'],
  ];
  await onProgress('⬇️ Download build tools (smali + android.jar)…');
  await Promise.all(deps.map(async ([url, dest]) => {
    try { if (fs.statSync(dest).size > 10_000) return; } catch {}
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Download ${url} gagal: ${r.status}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  }));
}

// ─── Smali: LawnimeChromeClient — handles HTML5 video fullscreen + landscape ──
// BUG FIX v1.0.6: onShowCustomView used .registers 7 with 3 params (this+View+Callback)
// meaning p0=v4, p1=v5, p2=v6. Code wrote to v4 (LayoutParams) and v5 (-1), overwriting
// p0 and p1. Fixed by using .registers 9 so local regs are v0-v5, params are v6/v7/v8.
function buildChromeClientSmali(appId) {
  const pkg = appId.replace(/\./g, '/');
  return `.class public L${pkg}/LawnimeChromeClient;
.super Landroid/webkit/WebChromeClient;

.field public mAct:L${pkg}/MainActivity;
.field public mCallback:Landroid/webkit/WebChromeClient$CustomViewCallback;
.field public mCustomView:Landroid/view/View;
.field public mOrigOrientation:I

.method public constructor <init>(L${pkg}/MainActivity;)V
    .registers 3
    invoke-direct {p0}, Landroid/webkit/WebChromeClient;-><init>()V
    iput-object p1, p0, L${pkg}/LawnimeChromeClient;->mAct:L${pkg}/MainActivity;
    return-void
.end method

.method public onShowCustomView(Landroid/view/View;Landroid/webkit/WebChromeClient$CustomViewCallback;)V
    .registers 9
    # .registers 9, method params = 3 (this, View, Callback)
    # parameter registers: p0=v6, p1=v7, p2=v8
    # local registers: v0..v5  (safe to write without overwriting params)
    iget-object v0, p0, L${pkg}/LawnimeChromeClient;->mCustomView:Landroid/view/View;
    if-eqz v0, :show
    invoke-interface {p2}, Landroid/webkit/WebChromeClient$CustomViewCallback;->onCustomViewHidden()V
    return-void
    :show
    iput-object p1, p0, L${pkg}/LawnimeChromeClient;->mCustomView:Landroid/view/View;
    iput-object p2, p0, L${pkg}/LawnimeChromeClient;->mCallback:Landroid/webkit/WebChromeClient$CustomViewCallback;
    iget-object v0, p0, L${pkg}/LawnimeChromeClient;->mAct:L${pkg}/MainActivity;
    invoke-virtual {v0}, L${pkg}/MainActivity;->getRequestedOrientation()I
    move-result v1
    iput v1, p0, L${pkg}/LawnimeChromeClient;->mOrigOrientation:I
    iget-object v0, p0, L${pkg}/LawnimeChromeClient;->mAct:L${pkg}/MainActivity;
    invoke-virtual {v0}, L${pkg}/MainActivity;->getWindow()Landroid/view/Window;
    move-result-object v2
    invoke-virtual {v2}, Landroid/view/Window;->getDecorView()Landroid/view/View;
    move-result-object v3
    check-cast v3, Landroid/view/ViewGroup;
    new-instance v4, Landroid/view/ViewGroup$LayoutParams;
    const/4 v5, -0x1
    invoke-direct {v4, v5, v5}, Landroid/view/ViewGroup$LayoutParams;-><init>(II)V
    invoke-virtual {v3, p1, v4}, Landroid/view/ViewGroup;->addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V
    iget-object v0, p0, L${pkg}/LawnimeChromeClient;->mAct:L${pkg}/MainActivity;
    const/4 v1, 0x0
    invoke-virtual {v0, v1}, L${pkg}/MainActivity;->setRequestedOrientation(I)V
    return-void
.end method

.method public onPermissionRequest(Landroid/webkit/PermissionRequest;)V
    .registers 2
    invoke-virtual {p1}, Landroid/webkit/PermissionRequest;->getResources()[Ljava/lang/String;
    move-result-object v0
    invoke-virtual {p1, v0}, Landroid/webkit/PermissionRequest;->grant([Ljava/lang/String;)V
    return-void
.end method

.method public onGeolocationPermissionsShowPrompt(Ljava/lang/String;Landroid/webkit/GeolocationPermissions$Callback;)V
    .registers 5
    const/4 v0, 0x1
    invoke-interface {p2, p1, v0, v0}, Landroid/webkit/GeolocationPermissions$Callback;->invoke(Ljava/lang/String;ZZ)V
    return-void
.end method

.method public onHideCustomView()V
    .registers 5
    # .registers 5, method params = 1 (this only) → p0=v4, locals: v0..v3
    iget-object v0, p0, L${pkg}/LawnimeChromeClient;->mCustomView:Landroid/view/View;
    if-eqz v0, :done
    iget-object v1, p0, L${pkg}/LawnimeChromeClient;->mAct:L${pkg}/MainActivity;
    invoke-virtual {v1}, L${pkg}/MainActivity;->getWindow()Landroid/view/Window;
    move-result-object v2
    invoke-virtual {v2}, Landroid/view/Window;->getDecorView()Landroid/view/View;
    move-result-object v3
    check-cast v3, Landroid/view/ViewGroup;
    invoke-virtual {v3, v0}, Landroid/view/ViewGroup;->removeView(Landroid/view/View;)V
    iget-object v2, p0, L${pkg}/LawnimeChromeClient;->mCallback:Landroid/webkit/WebChromeClient$CustomViewCallback;
    invoke-interface {v2}, Landroid/webkit/WebChromeClient$CustomViewCallback;->onCustomViewHidden()V
    const/4 v2, 0x0
    iput-object v2, p0, L${pkg}/LawnimeChromeClient;->mCustomView:Landroid/view/View;
    iget-object v1, p0, L${pkg}/LawnimeChromeClient;->mAct:L${pkg}/MainActivity;
    iget v2, p0, L${pkg}/LawnimeChromeClient;->mOrigOrientation:I
    invoke-virtual {v1, v2}, L${pkg}/MainActivity;->setRequestedOrientation(I)V
    :done
    return-void
.end method`;
}

// ─── Smali: LawnimeUiRunnable — post JS back to main thread ──────────────────
function buildUiRunnableSmali(appId) {
  const pkg = appId.replace(/\./g, '/');
  return `.class public L${pkg}/LawnimeUiRunnable;
.super Ljava/lang/Object;
.implements Ljava/lang/Runnable;

.field private mView:Landroid/webkit/WebView;
.field private mJs:Ljava/lang/String;

.method public constructor <init>(Landroid/webkit/WebView;Ljava/lang/String;)V
    .registers 3
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, L${pkg}/LawnimeUiRunnable;->mView:Landroid/webkit/WebView;
    iput-object p2, p0, L${pkg}/LawnimeUiRunnable;->mJs:Ljava/lang/String;
    return-void
.end method

.method public run()V
    .registers 4
    iget-object v0, p0, L${pkg}/LawnimeUiRunnable;->mView:Landroid/webkit/WebView;
    iget-object v1, p0, L${pkg}/LawnimeUiRunnable;->mJs:Ljava/lang/String;
    const/4 v2, 0x0
    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    return-void
.end method`;
}

// ─── Smali: online mode — load a remote URL directly in WebView ──────────────
// (LawnimeAuthTask and LawnimeBridge removed — login not required)

// placeholder so the section comment stays in place
function _removed() {}


// ─── Smali: online mode — load a remote URL directly in WebView ──────────────
function buildSmaliUrl(appId, url) {
  const pkg = appId.replace(/\./g, '/');
  return `.class public L${pkg}/MainActivity;
.super Landroid/app/Activity;

.field private mWebView:Landroid/webkit/WebView;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 7
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V
    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;
    move-result-object v0
    const/16 v1, 0x80
    invoke-virtual {v0, v1}, Landroid/view/Window;->addFlags(I)V
    # LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES = 1
    # Agar env(safe-area-inset-*) bekerja benar di WebView saat landscape/notch
    invoke-virtual {v0}, Landroid/view/Window;->getAttributes()Landroid/view/WindowManager$LayoutParams;
    move-result-object v1
    const/4 v2, 0x1
    iput v2, v1, Landroid/view/WindowManager$LayoutParams;->layoutInDisplayCutoutMode:I
    invoke-virtual {v0, v1}, Landroid/view/Window;->setAttributes(Landroid/view/WindowManager$LayoutParams;)V
    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1
    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setBuiltInZoomControls(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V
    const/4 v2, 0x0
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDisplayZoomControls(Z)V
    const/4 v2, 0x2
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setMixedContentMode(I)V
    const-string v2, "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 AniSubApp/1.0"
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setUserAgentString(Ljava/lang/String;)V
    new-instance v2, Landroid/webkit/WebViewClient;
    invoke-direct {v2}, Landroid/webkit/WebViewClient;-><init>()V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V
    new-instance v2, L${pkg}/LawnimeChromeClient;
    invoke-direct {v2, p0}, L${pkg}/LawnimeChromeClient;-><init>(L${pkg}/MainActivity;)V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V
    const-string v2, "${url}"
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    invoke-virtual {p0, v0}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V
    # Immersive sticky — hide navigation bar for full-screen video playback
    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;
    move-result-object v0
    invoke-virtual {v0}, Landroid/view/Window;->getDecorView()Landroid/view/View;
    move-result-object v0
    const/16 v1, 0x1706
    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V
    # Request POST_NOTIFICATIONS at runtime for Android 13+ (API 33)
    sget v3, Landroid/os/Build$VERSION;->SDK_INT:I
    const/16 v4, 0x21
    if-lt v3, v4, :skip_notif_perm
    const-string v3, "android.permission.POST_NOTIFICATIONS"
    const/4 v4, 0x1
    new-array v4, v4, [Ljava/lang/String;
    const/4 v2, 0x0
    aput-object v3, v4, v2
    const/4 v3, 0x1
    invoke-virtual {p0, v4, v3}, Landroid/app/Activity;->requestPermissions([Ljava/lang/String;I)V
    :skip_notif_perm
    return-void
.end method

.method public onBackPressed()V
    .registers 3
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :no_webview
    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z
    move-result v1
    if-eqz v1, :no_webview
    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V
    return-void
    :no_webview
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V
    return-void
.end method

.method protected onResume()V
    .registers 2
    invoke-super {p0}, Landroid/app/Activity;->onResume()V
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :end
    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V
    :end
    return-void
.end method

.method protected onPause()V
    .registers 2
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :end
    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V
    :end
    invoke-super {p0}, Landroid/app/Activity;->onPause()V
    return-void
.end method

.method protected onDestroy()V
    .registers 3
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :end
    invoke-virtual {v0}, Landroid/webkit/WebView;->destroy()V
    const/4 v1, 0x0
    iput-object v1, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    :end
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V
    return-void
.end method

.method public onWindowFocusChanged(Z)V
    .registers 4
    invoke-super {p0, p1}, Landroid/app/Activity;->onWindowFocusChanged(Z)V
    if-eqz p1, :not_focused
    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;
    move-result-object v0
    invoke-virtual {v0}, Landroid/view/Window;->getDecorView()Landroid/view/View;
    move-result-object v0
    const/16 v1, 0x1706
    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V
    :not_focused
    return-void
.end method`;
}

// ─── Smali: offline mode — load from bundled assets ──────────────────────────
function buildSmaliOffline(appId) {
  const pkg = appId.replace(/\./g, '/');
  return `.class public L${pkg}/MainActivity;
.super Landroid/app/Activity;

.field private mWebView:Landroid/webkit/WebView;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 5
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V
    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;
    move-result-object v0
    const/16 v1, 0x80
    invoke-virtual {v0, v1}, Landroid/view/Window;->addFlags(I)V
    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1
    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    const/4 v2, 0x0
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V
    const/4 v2, 0x2
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setMixedContentMode(I)V
    const-string v2, "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setUserAgentString(Ljava/lang/String;)V
    new-instance v2, Landroid/webkit/WebViewClient;
    invoke-direct {v2}, Landroid/webkit/WebViewClient;-><init>()V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V
    new-instance v2, Landroid/webkit/WebChromeClient;
    invoke-direct {v2}, Landroid/webkit/WebChromeClient;-><init>()V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V
    const-string v2, "file:///android_asset/game.html"
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    invoke-virtual {p0, v0}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V
    return-void
.end method

.method public onBackPressed()V
    .registers 3
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :no_webview
    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z
    move-result v1
    if-eqz v1, :no_webview
    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V
    return-void
    :no_webview
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V
    return-void
.end method

.method protected onResume()V
    .registers 2
    invoke-super {p0}, Landroid/app/Activity;->onResume()V
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :end
    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V
    :end
    return-void
.end method

.method protected onPause()V
    .registers 2
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :end
    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V
    :end
    invoke-super {p0}, Landroid/app/Activity;->onPause()V
    return-void
.end method

.method protected onDestroy()V
    .registers 3
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :end
    invoke-virtual {v0}, Landroid/webkit/WebView;->destroy()V
    const/4 v1, 0x0
    iput-object v1, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    :end
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V
    return-void
.end method`;
}

/**
 * Build a signed standalone Android APK with the game bundled inside.
 *
 * @param {Buffer} gameHtmlBuf  - HTML file contents to bundle as assets/game.html
 * @param {function} onProgress - async progress callback(message)
 * @param {object}  opts
 * @param {string}  opts.appName  - Display name
 * @param {string}  opts.appId    - Package ID (e.g. com.lawrenz.chess)
 * @param {string}  [opts.cn]     - Keystore CN (defaults to appName)
 * @param {Buffer}  [opts.iconBuf]- Icon PNG buffer (defaults to public/icon.png)
 */
async function buildApk(gameHtmlBuf, onProgress, opts = {}) {
  const appName = opts.appName || 'Chess By Lawrenz';
  const appId   = opts.appId   || 'com.lawrenz.chess';
  const cn      = opts.cn      || appName;
  const ksPass  = 'Lawrenz@APK2024';
  const ksPath  = `/tmp/ks_${appId.replace(/\./g, '_')}.jks`;
  const pkg     = appId.replace(/\./g, '/');

  await onProgress('🔧 Mempersiapkan tools build…');
  if (!jarsReady()) await downloadJars(onProgress);

  const BUILD = `/tmp/apk_${Date.now()}`;
  try {
    // Create directory structure
    fs.mkdirSync(`${BUILD}/res/mipmap`,     { recursive: true });
    fs.mkdirSync(`${BUILD}/res/values`,     { recursive: true });
    fs.mkdirSync(`${BUILD}/compiled`,       { recursive: true });
    fs.mkdirSync(`${BUILD}/dex_src/${pkg}`, { recursive: true });
    fs.mkdirSync(`${BUILD}/out`,            { recursive: true });
    fs.mkdirSync(`${BUILD}/assets`,         { recursive: true });

    // ── Bundle game HTML as asset ─────────────────────────────────────────────
    fs.writeFileSync(`${BUILD}/assets/game.html`, gameHtmlBuf);

    // ── Launcher icon (convert ke PNG valid, apapun format aslinya) ──────────
    const rawIconBuf = opts.iconBuf ||
      (fs.existsSync(`${PUBLIC_DIR}/icon.png`) ? fs.readFileSync(`${PUBLIC_DIR}/icon.png`) : null);
    if (!rawIconBuf) throw new Error('Ikon tidak ditemukan.');
    let iconBuf;
    try {
      const sharp = require('sharp');
      iconBuf = await sharp(rawIconBuf).resize(512, 512, { fit: 'cover' }).png().toBuffer();
    } catch (sharpErr) {
      // sharp gagal — cek manual apakah sudah PNG (magic bytes 89 50 4E 47)
      if (rawIconBuf[0] === 0x89 && rawIconBuf[1] === 0x50) {
        iconBuf = rawIconBuf;
      } else {
        throw new Error(`Ikon bukan PNG dan konversi gagal: ${sharpErr.message}`);
      }
    }
    fs.writeFileSync(`${BUILD}/res/mipmap/ic_launcher.png`, iconBuf);

    // ── strings.xml ───────────────────────────────────────────────────────────
    fs.writeFileSync(`${BUILD}/res/values/strings.xml`,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="app_name">${appName}</string></resources>`);

    // ── AndroidManifest.xml ───────────────────────────────────────────────────
    const versionCode = opts.versionCode || '6';
    const versionName = opts.versionName || '1.0.6';
    fs.writeFileSync(`${BUILD}/AndroidManifest.xml`,
      `<?xml version="1.0" encoding="utf-8"?>\n` +
      `<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n` +
      `    package="${appId}"\n` +
      `    android:versionCode="${versionCode}" android:versionName="${versionName}"\n` +
      `    android:installLocation="auto">\n` +
      `  <uses-permission android:name="android.permission.INTERNET"/>\n` +
      `  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>\n` +
      `  <uses-permission android:name="android.permission.ACCESS_WIFI_STATE"/>\n` +
      `  <uses-permission android:name="android.permission.VIBRATE"/>\n` +
      `  <uses-permission android:name="android.permission.CAMERA"/>\n` +
      `  <uses-permission android:name="android.permission.RECORD_AUDIO"/>\n` +
      `  <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>\n` +
      `  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>\n` +
      `  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>\n` +
      `  <uses-permission android:name="android.permission.WAKE_LOCK"/>\n` +
      `  <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n` +
      `  <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>\n` +
      `  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>\n` +
      `  <uses-permission android:name="android.permission.GET_ACCOUNTS"/>\n` +
      `  <uses-permission android:name="android.permission.USE_CREDENTIALS"/>\n` +
      (opts.extraPermissions ? opts.extraPermissions.map(p => `  ${p}\n`).join('') : '') +
      `  <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="33"/>\n` +
      `  <application android:allowBackup="false" android:hardwareAccelerated="true"\n` +
      `      android:label="@string/app_name"\n` +
      `      android:icon="@mipmap/ic_launcher">\n` +
      `    <activity android:name=".MainActivity" android:exported="true"\n` +
      `        android:screenOrientation="unspecified"\n` +
      `        android:hardwareAccelerated="true"\n` +
      `        android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout"\n` +
      `        android:theme="@android:style/Theme.NoTitleBar.Fullscreen"\n` +
      `        android:windowSoftInputMode="adjustResize"\n` +
      `        android:launchMode="singleTop">\n` +
      `      <intent-filter>\n` +
      `        <action android:name="android.intent.action.MAIN"/>\n` +
      `        <category android:name="android.intent.category.LAUNCHER"/>\n` +
      `      </intent-filter>\n` +
      `    </activity>\n` +
      `  </application>\n` +
      `</manifest>`);

    // ── Smali source — custom, URL mode, or offline asset mode ─────────────
    const smali = opts.customSmali
      ? opts.customSmali
      : opts.urlToLoad
        ? buildSmaliUrl(appId, opts.urlToLoad)
        : buildSmaliOffline(appId);
    fs.writeFileSync(`${BUILD}/dex_src/${pkg}/MainActivity.smali`, smali);
    // Write fullscreen-capable WebChromeClient (URL mode or customSmali)
    if (opts.urlToLoad || opts.customSmali) {
      fs.writeFileSync(`${BUILD}/dex_src/${pkg}/LawnimeChromeClient.smali`, buildChromeClientSmali(appId));
      fs.writeFileSync(`${BUILD}/dex_src/${pkg}/LawnimeUiRunnable.smali`, buildUiRunnableSmali(appId));
    }
    // Extra smali files (e.g. AniSubWebViewClient)
    if (opts.extraSmaliFiles) {
      for (const [fname, content] of Object.entries(opts.extraSmaliFiles)) {
        fs.writeFileSync(`${BUILD}/dex_src/${pkg}/${fname}`, content);
      }
    }

    // ── Compile resources ─────────────────────────────────────────────────────
    await onProgress('📦 Kompilasi resources (icon + strings)…');
    run(AAPT2, ['compile', '--dir', `${BUILD}/res`, '-o', `${BUILD}/compiled/`]);

    // ── Link APK ──────────────────────────────────────────────────────────────
    await onProgress('🔗 Link APK base…');
    const flatFiles = fs.readdirSync(`${BUILD}/compiled`).map(f => `${BUILD}/compiled/${f}`);
    run(AAPT2, [
      'link',
      '--manifest', `${BUILD}/AndroidManifest.xml`,
      '-I', ANDROID_JAR,
      '-o', `${BUILD}/out/base.apk`,
      '--min-sdk-version', '21',
      '--target-sdk-version', '33',
      '--version-code', versionCode,
      '--version-name', versionName,
      ...flatFiles,
    ]);

    // ── Compile smali → DEX ───────────────────────────────────────────────────
    await onProgress('⚙️ Compile DEX bytecode (smali → dex)…');
    run(`${JDK}/java`, [
      '-cp', SMALI_CP,
      'org.jf.smali.Main', 'assemble',
      `${BUILD}/dex_src/`,
      '-o', `${BUILD}/out/classes.dex`,
    ]);

    // ── Write extra assets before packing ────────────────────────────────────
    if (opts.extraAssets) {
      for (const [fname, content] of Object.entries(opts.extraAssets)) {
        const assetPath = `${BUILD}/assets/${fname}`;
        fs.mkdirSync(path.dirname(assetPath), { recursive: true });
        if (Buffer.isBuffer(content)) {
          fs.writeFileSync(assetPath, content);
        } else {
          fs.writeFileSync(assetPath, Buffer.from(content, 'utf8'));
        }
      }
    }

    // ── Pack DEX + assets into APK ────────────────────────────────────────────
    await onProgress('📁 Pack APK (embed assets + dex + icon)…');
    // Add classes.dex
    run(`${JDK}/jar`, ['uf', `${BUILD}/out/base.apk`, 'classes.dex'], { cwd: `${BUILD}/out` });
    // Pack ALL files in assets/ directory
    const assetFiles = [];
    ;(function walkAssets(dir, prefix) {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        const rel = prefix + '/' + f;
        if (fs.statSync(full).isDirectory()) walkAssets(full, rel);
        else assetFiles.push(rel);
      }
    })(`${BUILD}/assets`, 'assets');
    if (assetFiles.length > 0) {
      run(`${JDK}/jar`, ['uf', `${BUILD}/out/base.apk`, ...assetFiles], { cwd: BUILD });
    }

    // ── Generate keystore ─────────────────────────────────────────────────────
    try { if (fs.statSync(ksPath).size > 100) { /* reuse */ } } catch {
      run(`${JDK}/keytool`, [
        '-genkeypair', '-v',
        '-keystore', ksPath, '-alias', 'appkey',
        '-keyalg', 'RSA', '-keysize', '2048', '-validity', '36500',
        '-dname', `CN=${cn}, O=Lawrenz Games, L=Jakarta, ST=DKI Jakarta, C=ID`,
        '-storepass', ksPass, '-keypass', ksPass, '-noprompt',
      ]);
    }

    // ── Sign APK ──────────────────────────────────────────────────────────────
    await onProgress('🔑 Sign APK dengan RSA 2048…');
    run(APKSIGNER, [
      'sign',
      '--ks', ksPath, '--ks-pass', `pass:${ksPass}`,
      '--key-pass', `pass:${ksPass}`, '--ks-key-alias', 'appkey',
      '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
      '--out', `${BUILD}/out/signed.apk`,
      `${BUILD}/out/base.apk`,
    ]);

    const apkBuf = fs.readFileSync(`${BUILD}/out/signed.apk`);
    if (apkBuf.length < 50_000) throw new Error(`APK terlalu kecil: ${apkBuf.length} bytes`);
    return apkBuf;

  } finally {
    try { fs.rmSync(BUILD, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { buildApk, jarsReady, buildChromeClientSmali, buildUiRunnableSmali };
