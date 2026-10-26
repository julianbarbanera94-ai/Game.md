package com.farmstead.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * Hosts the HTML5 game in a full-screen WebView. Game files are served from
 * the APK's assets over https://appassets.androidplatform.net so that ES
 * modules, fetch() and localStorage behave exactly as in a desktop browser.
 */
public class MainActivity extends Activity {
    /**
     * Save-game storage exposed to the page as window.AndroidStorage. Values
     * go to the app's SharedPreferences with commit() (synchronous), so a save
     * is on disk before the call returns and survives the app being killed.
     * It is only reachable from the bundled game pages.
     */
    private class AndroidStorage {
        private final SharedPreferences prefs = getSharedPreferences("farmstead", MODE_PRIVATE);

        @JavascriptInterface
        public String getItem(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public boolean setItem(String key, String value) {
            return prefs.edit().putString(key, value).commit();
        }

        @JavascriptInterface
        public void removeItem(String key) {
            prefs.edit().remove(key).commit();
        }
    }

    /** Short vibrations for game feedback, as window.AndroidHaptics (Settings > Vibration). */
    private class AndroidHaptics {
        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            int len = Math.max(5, Math.min(ms, 400));
            if (android.os.Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(len, VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(len);
        }
    }

    private static final String START_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        webView.addJavascriptInterface(new AndroidStorage(), "AndroidStorage");
        webView.addJavascriptInterface(new AndroidHaptics(), "AndroidHaptics");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        setContentView(webView);
        hideSystemBars();
        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);
    }

    private void hideSystemBars() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // Android back button acts like Esc: closes panels / opens the pause menu.
    @Override
    public void onBackPressed() {
        webView.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape'}));"
                        + "window.dispatchEvent(new KeyboardEvent('keyup',{code:'Escape',key:'Escape'}));",
                null);
    }

    // Save before the page is paused (leaving the app, screen off, app switcher).
    @Override
    protected void onPause() {
        super.onPause();
        webView.evaluateJavascript(
                "window.farmstead && window.farmstead.running && window.farmstead.autosave('pause');",
                value -> webView.onPause());
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }
}
