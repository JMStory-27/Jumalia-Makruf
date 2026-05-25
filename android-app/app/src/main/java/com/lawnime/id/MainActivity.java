package com.lawnime.id;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends AppCompatActivity {

    private static final String APP_URL = "https://jmstory-27.github.io/Jumalia-Makruf/anime/";
    static final String CHANNEL_ID = "lawnime_notifications";
    private static final String NOTIF_ACTION_OPEN = "com.lawnime.id.OPEN";

    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout offlineLayout;
    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<String> filePickerLauncher;
    private ActivityResultLauncher<String[]> permLauncher;
    private final AtomicInteger notifId = new AtomicInteger(2000);

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Status bar dark
        getWindow().setStatusBarColor(0xFF05050F);
        getWindow().setNavigationBarColor(0xFF05050F);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        offlineLayout = findViewById(R.id.offlineLayout);
        Button retryBtn = findViewById(R.id.retryButton);
        retryBtn.setOnClickListener(v -> loadApp());

        createNotificationChannel();
        setupPermissionLauncher();
        setupFilePickerLauncher();
        requestPermissions();
        setupWebView();
        loadApp();
    }

    private void loadApp() {
        if (!isOnline()) {
            webView.setVisibility(View.GONE);
            offlineLayout.setVisibility(View.VISIBLE);
        } else {
            offlineLayout.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.loadUrl(APP_URL);
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " LawnimeApp/1.0");

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setScrollBarStyle(View.SCROLLBARS_OUTSIDE_OVERLAY);
        webView.setScrollbarFadingEnabled(true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                if (p < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(p);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }

            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb,
                                              FileChooserParams params) {
                filePathCallback = cb;
                filePickerLauncher.launch("*/*");
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                                                            GeolocationPermissions.Callback cb) {
                cb.invoke(origin, true, false);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                injectBridge();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req,
                                        WebResourceError error) {
                if (req.isForMainFrame()) {
                    if (!isOnline()) {
                        runOnUiThread(() -> {
                            webView.setVisibility(View.GONE);
                            offlineLayout.setVisibility(View.VISIBLE);
                        });
                    }
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (url.startsWith("https://jmstory-27.github.io") ||
                    url.startsWith("https://api.github.com") ||
                    url.startsWith("https://graphql.anilist.co")) {
                    return false;
                }
                if (url.startsWith("mailto:") || url.startsWith("tel:") ||
                    url.startsWith("whatsapp:")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception ignored) {}
                    return true;
                }
                // open other external links in browser
                if (!url.contains("jmstory-27.github.io") && url.startsWith("https://")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                        return true;
                    } catch (Exception ignored) {}
                }
                return false;
            }
        });
    }

    private void injectBridge() {
        String js = "javascript:(function(){"
            + "if(window.__lawnimeBridge)return;"
            + "window.__lawnimeBridge=true;"
            // Grant notification permission immediately
            + "try{"
            + "var _orig=window.Notification||function(){};"
            + "function LN(title,opts){"
            + "  if(window.AndroidBridge)window.AndroidBridge.showNotification(title,(opts&&opts.body)?String(opts.body):'');"
            + "}"
            + "LN.permission='granted';"
            + "LN.requestPermission=function(cb){"
            + "  var r='granted';"
            + "  if(typeof cb==='function')cb(r);"
            + "  return Promise.resolve(r);"
            + "};"
            + "try{Object.defineProperty(window,'Notification',{get:function(){return LN;}});}catch(e){window.Notification=LN;}"
            + "}catch(e){}"
            // Signal to app that bridge is ready
            + "if(window.AndroidBridge)window.AndroidBridge.bridgeReady();"
            + "})()";
        webView.loadUrl(js);
    }

    // ── JavaScript Bridge ──────────────────────────────────────────────────────

    public class AndroidBridge {
        @JavascriptInterface
        public void showNotification(String title, String body) {
            postNotification(title, body);
        }

        @JavascriptInterface
        public void bridgeReady() {
            // bridge installed, app can use notifications
        }

        @JavascriptInterface
        public String getVersion() { return "1.0.0"; }

        @JavascriptInterface
        public boolean isAndroidApp() { return true; }
    }

    void postNotification(String title, String body) {
        new Handler(Looper.getMainLooper()).post(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) return;
            }
            Intent openIntent = new Intent(this, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

            NotificationCompat.Builder nb = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_VIBRATE)
                .setVibrate(new long[]{0, 250, 100, 250})
                .setLights(Color.parseColor("#5865F2"), 600, 600)
                .setColor(Color.parseColor("#5865F2"))
                .setAutoCancel(true)
                .setContentIntent(pi);

            NotificationManagerCompat.from(this).notify(notifId.getAndIncrement(), nb.build());
        });
    }

    // ── Notification Channel ───────────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, getString(R.string.channel_name),
                NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription(getString(R.string.channel_desc));
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 250, 100, 250});
            ch.enableLights(true);
            ch.setLightColor(Color.parseColor("#5865F2"));
            ch.setShowBadge(true);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    // ── Permissions ────────────────────────────────────────────────────────────

    private void setupPermissionLauncher() {
        permLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(), results -> {});
    }

    private void requestPermissions() {
        List<String> needed = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED)
                needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        String[] permsToCheck = {
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        };
        for (String p : permsToCheck) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED)
                needed.add(p);
        }
        if (!needed.isEmpty())
            permLauncher.launch(needed.toArray(new String[0]));
    }

    // ── File Picker ────────────────────────────────────────────────────────────

    private void setupFilePickerLauncher() {
        filePickerLauncher = registerForActivityResult(
            new ActivityResultContracts.GetContent(), uri -> {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(uri != null ? new Uri[]{uri} : new Uri[0]);
                    filePathCallback = null;
                }
            });
    }

    // ── Connectivity ───────────────────────────────────────────────────────────

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkInfo ni = cm.getActiveNetworkInfo();
        return ni != null && ni.isConnected();
    }

    // ── Back navigation ────────────────────────────────────────────────────────

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        webView.destroy();
    }
}
