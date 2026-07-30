// One-time script: push icon + workflow, trigger GitHub Actions build
import { readFileSync, writeFileSync } from 'fs';

const OWNER = process.env.GITHUB_OWNER || 'JMStory-27';
const REPO  = process.env.GITHUB_REPO  || 'Jumalia-Makruf';
const TOKEN = process.env.GITHUB_TOKEN;
const GAME_URL = `https://${OWNER}.github.io/${REPO}/web/chess-master/`;
const APK_DEST = 'web/chess-master/chess-master-lawrenz.apk';

async function ghApi(method, urlPath, body) {
  const res = await fetch('https://api.github.com' + urlPath, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'AlbumAbadiBot',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 300) }; }
  if (!res.ok && method !== 'GET') {
    throw new Error(`${method} ${urlPath} → ${res.status}: ${json.message || json._raw}`);
  }
  return { ok: res.ok, status: res.status, json };
}

async function upsertFile(path, b64, message) {
  const get = await ghApi('GET', `/repos/${OWNER}/${REPO}/contents/${path}`);
  const body = { message, content: b64, branch: 'main' };
  if (get.ok && get.json.sha) body.sha = get.json.sha;
  return ghApi('PUT', `/repos/${OWNER}/${REPO}/contents/${path}`, body);
}

// ─── Workflow YAML ────────────────────────────────────────────────────────────
const workflowYaml = `name: Build Chess Master Lawrenz APK

on:
  workflow_dispatch:
    inputs:
      rebuild:
        description: Force rebuild
        required: false
        default: 'yes'

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
    - uses: actions/checkout@v4
      with:
        token: \${{ secrets.GITHUB_TOKEN }}

    - uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'

    - uses: android-actions/setup-android@v3

    - name: Install SDK platform and build-tools
      run: |
        sdkmanager "build-tools;34.0.0" "platforms;android-34" --sdk_root="$ANDROID_HOME"

    - name: Install ImageMagick
      run: sudo apt-get install -y imagemagick 2>/dev/null || true

    - name: Generate signing keystore
      run: |
        keytool -genkeypair -v \\
          -keystore /tmp/cml.jks -alias cmlkey \\
          -keyalg RSA -keysize 2048 -validity 36500 \\
          -dname 'CN=Chess Master Lawrenz, O=Lawrenz Games, L=Jakarta, ST=DKI Jakarta, C=ID' \\
          -storepass CML@Lawrenz2024 -keypass CML@Lawrenz2024 -noprompt

    - name: Create Android project
      run: |
        set -e
        PROJ=/tmp/cml
        mkdir -p \$PROJ/app/src/main/java/com/lawrenz/chessmaster
        mkdir -p \$PROJ/app/src/main/res/values
        mkdir -p \$PROJ/app/src/main/res/xml

        for D in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
          SIZE=48
          [ "\$D" = "hdpi" ]    && SIZE=72
          [ "\$D" = "xhdpi" ]   && SIZE=96
          [ "\$D" = "xxhdpi" ]  && SIZE=144
          [ "\$D" = "xxxhdpi" ] && SIZE=192
          mkdir -p \$PROJ/app/src/main/res/mipmap-\$D
          if [ -f "web/chess-master/icon.png" ]; then
            convert "web/chess-master/icon.png" -resize \${SIZE}x\${SIZE} \\
              \$PROJ/app/src/main/res/mipmap-\$D/ic_launcher.png 2>/dev/null \\
              || cp "web/chess-master/icon.png" \$PROJ/app/src/main/res/mipmap-\$D/ic_launcher.png
          else
            convert -size \${SIZE}x\${SIZE} xc:'#0a0a1a' \\
              \$PROJ/app/src/main/res/mipmap-\$D/ic_launcher.png 2>/dev/null || true
          fi
        done

        cat > \$PROJ/app/src/main/res/xml/network_security_config.xml << 'NSC'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors><certificates src="system"/></trust-anchors>
  </base-config>
</network-security-config>
NSC

        cat > \$PROJ/app/src/main/AndroidManifest.xml << 'MANIFEST'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.VIBRATE"/>
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
  <uses-permission android:name="android.permission.CAMERA"/>
  <uses-permission android:name="android.permission.RECORD_AUDIO"/>
  <application
      android:allowBackup="false"
      android:hardwareAccelerated="true"
      android:networkSecurityConfig="@xml/network_security_config"
      android:label="Chess Master Lawrenz"
      android:icon="@mipmap/ic_launcher"
      android:roundIcon="@mipmap/ic_launcher"
      android:supportsRtl="true">
    <activity android:name=".MainActivity"
        android:exported="true"
        android:screenOrientation="portrait"
        android:configChanges="orientation|screenSize|keyboardHidden|uiMode|density"
        android:theme="@android:style/Theme.NoTitleBar.Fullscreen"
        android:windowSoftInputMode="adjustResize"
        android:launchMode="singleTop">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity>
  </application>
</manifest>
MANIFEST

        cat > \$PROJ/app/src/main/res/values/strings.xml << 'STRINGS'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">Chess Master Lawrenz</string>
</resources>
STRINGS

        cat > \$PROJ/settings.gradle << 'SETTINGS'
pluginManagement {
  repositories { google(); gradlePluginPortal(); mavenCentral() }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories { google(); mavenCentral() }
}
rootProject.name = "ChessMasterLawrenz"
include ':app'
SETTINGS

        cat > \$PROJ/build.gradle << 'ROOT'
plugins {
  id 'com.android.application' version '8.2.2' apply false
}
ROOT

        cat > \$PROJ/app/build.gradle << 'APPBUILD'
plugins { id 'com.android.application' }
android {
  namespace 'com.lawrenz.chessmaster'
  compileSdk 34
  defaultConfig {
    applicationId 'com.lawrenz.chessmaster'
    minSdk 21
    targetSdk 34
    versionCode 1
    versionName '1.0'
  }
  signingConfigs {
    release {
      storeFile file('/tmp/cml.jks')
      storePassword 'CML@Lawrenz2024'
      keyAlias 'cmlkey'
      keyPassword 'CML@Lawrenz2024'
      v1SigningEnabled true
      v2SigningEnabled true
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.release
      minifyEnabled false
      shrinkResources false
      debuggable false
    }
  }
  compileOptions {
    sourceCompatibility JavaVersion.VERSION_1_8
    targetCompatibility JavaVersion.VERSION_1_8
  }
  splits { abi { enable false } density { enable false } }
  bundle { language { enableSplit = false } }
}
APPBUILD

        cat > \$PROJ/app/src/main/java/com/lawrenz/chessmaster/MainActivity.java << 'JAVA'
package com.lawrenz.chessmaster;
import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import java.util.ArrayList;
public class MainActivity extends Activity {
    private static final int REQ_PERMS = 1001;
    private WebView w;
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 19) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
        requestNeededPermissions();
        w = new WebView(this);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setGeolocationEnabled(false);
        s.setAllowFileAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUserAgentString(
            "Mozilla/5.0 (Linux; Android 10; Mobile) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/120.0.0.0 Mobile Safari/537.36");
        w.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (r.getUrl().toString().startsWith("https://")) {
                    v.loadUrl(r.getUrl().toString()); return true;
                }
                return false;
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest req) { req.grant(req.getResources()); }
        });
        if (saved != null) w.restoreState(saved);
        else w.loadUrl("https://${OWNER}.github.io/${REPO}/web/chess-master/");
        setContentView(w);
    }
    private void requestNeededPermissions() {
        if (Build.VERSION.SDK_INT < 23) return;
        String[] needed = {Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO};
        ArrayList<String> toAsk = new ArrayList<>();
        for (String p : needed)
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) toAsk.add(p);
        if (!toAsk.isEmpty()) requestPermissions(toAsk.toArray(new String[0]), REQ_PERMS);
    }
    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); if (w!=null) w.saveState(o); }
    @Override public void onBackPressed() { if (w!=null&&w.canGoBack()) w.goBack(); else super.onBackPressed(); }
    @Override protected void onResume()  { super.onResume();  if (w!=null) w.onResume();  }
    @Override protected void onPause()   { if (w!=null) w.onPause();  super.onPause();   }
    @Override protected void onDestroy() { if (w!=null){w.destroy();w=null;} super.onDestroy(); }
}
JAVA
        echo "Android project created"

    - name: Build Release APK
      run: |
        cd /tmp/cml
        gradle assembleRelease --no-daemon -q 2>&1
        ls -lh app/build/outputs/apk/release/

    - name: Save APK to repo
      run: |
        mkdir -p web/chess-master
        cp /tmp/cml/app/build/outputs/apk/release/app-release.apk ${APK_DEST}
        ls -lh ${APK_DEST}
        git config user.name "ChessMasterBot"
        git config user.email "bot@lawrenz.dev"
        git add -f ${APK_DEST}
        git commit -m "📱 Chess Master Lawrenz APK v1.0 [skip ci]" || echo "nothing to commit"
        git push
      env:
        GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

    - name: Print download URL
      run: |
        echo "APK URL: https://${OWNER}.github.io/${REPO}/${APK_DEST}"
`;

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('📱 Building Chess Master Lawrenz APK...');
  console.log(`   Repo: ${OWNER}/${REPO}`);
  console.log(`   Game: ${GAME_URL}`);

  // 1. Push icon
  const icon = readFileSync('/home/runner/workspace/artifacts/telegram-bot/public/icon.png');
  console.log(`\n1️⃣  Pushing icon (${(icon.length/1024).toFixed(0)} KB)...`);
  await upsertFile('web/chess-master/icon.png', icon.toString('base64'),
    '🖼 Chess Master Lawrenz icon [skip ci]');
  console.log('   ✅ Icon uploaded');

  // 2. Push workflow
  console.log('\n2️⃣  Pushing GitHub Actions workflow...');
  await upsertFile('.github/workflows/build-chess-master-apk.yml',
    Buffer.from(workflowYaml, 'utf8').toString('base64'),
    '⚙️ Add Chess Master Lawrenz build workflow [skip ci]');
  console.log('   ✅ Workflow pushed');

  // 3. Trigger
  console.log('\n3️⃣  Triggering workflow run...');
  const trig = await ghApi('POST',
    `/repos/${OWNER}/${REPO}/actions/workflows/build-chess-master-apk.yml/dispatches`,
    { ref: 'main', inputs: { rebuild: String(Date.now()) } });
  if (!trig.ok) throw new Error(`Trigger: ${trig.json.message || trig.status}`);
  console.log('   ✅ Triggered!');

  // 4. Get run
  await new Promise(r => setTimeout(r, 7000));
  const runs = await ghApi('GET',
    `/repos/${OWNER}/${REPO}/actions/workflows/build-chess-master-apk.yml/runs?per_page=1&branch=main`);
  const run = runs.json.workflow_runs?.[0];
  if (!run) throw new Error('Run not found');
  
  console.log(`\n4️⃣  Run started!`);
  console.log(`   ID: ${run.id}`);
  console.log(`   Status: ${run.status}`);
  console.log(`   Monitor: https://github.com/${OWNER}/${REPO}/actions/runs/${run.id}`);
  console.log(`\n   Estimated time: 5-10 minutes`);
  console.log(`\n   APK download (after build):`)
  console.log(`   https://${OWNER}.github.io/${REPO}/${APK_DEST}`);

  writeFileSync('/tmp/cml_run_id.txt', JSON.stringify({ runId: run.id, owner: OWNER, repo: REPO, apkDest: APK_DEST }));
  console.log('\n✅ Script done. Build running on GitHub Actions!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
