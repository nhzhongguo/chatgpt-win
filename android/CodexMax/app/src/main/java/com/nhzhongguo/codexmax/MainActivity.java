package com.nhzhongguo.codexmax;

import android.annotation.SuppressLint;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.graphics.Insets;
import androidx.core.os.LocaleListCompat;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.progressindicator.LinearProgressIndicator;
import com.google.android.material.snackbar.Snackbar;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanIntentResult;
import com.journeyapps.barcodescanner.ScanOptions;

public final class MainActivity extends AppCompatActivity {
    private static final long PAGE_LOAD_TIMEOUT_MS = 20_000L;

    private FrameLayout root;
    private View connectionScreen;
    private View browserScreen;
    private EditText addressInput;
    private TextView statusText;
    private MaterialButton recentButton;
    private MaterialButton languageToggle;
    private LinearProgressIndicator progress;
    private WebView webView;
    private ConnectionStore connectionStore;
    private ConnectionUrl activeConnection;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private int pageLoadRequestId;
    private boolean pageLoaded;
    private Insets latestSystemBars = Insets.NONE;
    private int latestKeyboardHeight;

    private final ActivityResultLauncher<ScanOptions> scanner = registerForActivityResult(
            new ScanContract(),
            this::onScanResult
    );

    private final ActivityResultLauncher<Intent> filePicker = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                ValueCallback<Uri[]> callback = fileCallback;
                fileCallback = null;
                if (callback == null) return;
                callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(
                        result.getResultCode(),
                        result.getData()
                ));
            }
    );

    private final ActivityResultLauncher<String> notificationPermission = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            granted -> {
                if (!granted) showMessage(getString(R.string.notification_permission_denied));
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);
        splashScreen.setOnExitAnimationListener(provider -> {
            provider.getIconView().animate()
                    .alpha(0f)
                    .scaleX(1.12f)
                    .scaleY(1.12f)
                    .setDuration(260L)
                    .start();
            provider.getView().animate()
                    .alpha(0f)
                    .setDuration(420L)
                    .withEndAction(provider::remove)
                    .start();
        });
        getWindow().setStatusBarColor(getColor(R.color.background));
        getWindow().setNavigationBarColor(getColor(R.color.background));
        new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView())
                .setAppearanceLightStatusBars(false);

        connectionStore = new ConnectionStore(this);
        bindViews();
        configureSystemBars();
        configureBrowser();
        configureActions();
        refreshRecentConnection();
        requestNotificationPermissionIfNeeded();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (browserScreen.getVisibility() != View.VISIBLE) {
                    finish();
                } else if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    showConnectionScreen();
                }
            }
        });
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    private void bindViews() {
        root = findViewById(R.id.root);
        connectionScreen = findViewById(R.id.connection_screen);
        browserScreen = findViewById(R.id.browser_screen);
        addressInput = findViewById(R.id.address_input);
        statusText = findViewById(R.id.connection_status);
        recentButton = findViewById(R.id.recent_button);
        languageToggle = findViewById(R.id.language_toggle);
        progress = findViewById(R.id.browser_progress);
        webView = findViewById(R.id.web_view);
    }

    private void configureActions() {
        findViewById(R.id.scan_button).setOnClickListener(view -> startScanner());
        findViewById(R.id.connect_button).setOnClickListener(view -> connect(addressInput.getText().toString()));
        recentButton.setOnClickListener(view -> connect(connectionStore.load()));
        recentButton.setOnLongClickListener(view -> {
            connectionStore.clear();
            addressInput.setText("");
            refreshRecentConnection();
            showStatus(getString(R.string.recent_cleared), false);
            return true;
        });
        languageToggle.setOnClickListener(view -> toggleLanguage());

    }

    private void toggleLanguage() {
        String language = getResources().getConfiguration().locale.getLanguage();
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(
                "zh".equals(language) ? "en" : "zh-CN"
        ));
    }

    private void configureSystemBars() {
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets systemBars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            latestSystemBars = systemBars;
            latestKeyboardHeight = Math.max(0, ime.bottom - systemBars.bottom);
            // Keep the native app chrome and its WebView outside every device's
            // status bar, cutout, navigation bar, and gesture area.
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            applyWebViewportInsets();
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    private void applyWebViewportInsets() {
        if (webView == null) return;
        // The root already applies these insets around the embedded WebView.
        // Sending zero avoids a second WebView safe-area offset on Android,
        // while still explicitly identifying the page as native-safe-area aware.
        String script = "(function(){var d=document.documentElement;"
                + "d.style.setProperty('--native-safe-area-top','0px');"
                + "d.style.setProperty('--native-safe-area-bottom','0px');"
                + "d.style.setProperty('--native-keyboard-height','" + latestKeyboardHeight + "px');"
                + "d.dataset.nativeSafeArea='true';"
                + "window.dispatchEvent(new Event('chatgptwininsetschange'));})();";
        webView.evaluateJavascript(script, null);
    }

    private void startScanner() {
        if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            showStatus(getString(R.string.camera_unavailable), true);
            return;
        }
        ScanOptions options = new ScanOptions()
                .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                .setPrompt(getString(R.string.scan_prompt))
                .setBeepEnabled(false)
                .setOrientationLocked(true)
                .setCaptureActivity(ScanActivity.class);
        scanner.launch(options);
    }

    private void onScanResult(ScanIntentResult result) {
        if (result.getContents() != null) connect(result.getContents());
    }

    private void connect(String rawUrl) {
        ConnectionUrl.ParseResult result = ConnectionUrl.parse(rawUrl);
        if (!result.isValid()) {
            showStatus(result.error(), true);
            return;
        }
        activeConnection = result.value();
        connectionStore.save(activeConnection.normalizedUrl());
        addressInput.setText(activeConnection.normalizedUrl());
        refreshRecentConnection();
        showBrowserScreen();
        schedulePageLoadTimeout();
        webView.loadUrl(activeConnection.normalizedUrl());
    }

    private void showBrowserScreen() {
        showStatus("", false);
        connectionScreen.setVisibility(View.GONE);
        browserScreen.setVisibility(View.VISIBLE);
        progress.setVisibility(View.VISIBLE);
    }

    private void showConnectionScreen() {
        CodexMonitorService.stop(this);
        webView.stopLoading();
        browserScreen.setVisibility(View.GONE);
        connectionScreen.setVisibility(View.VISIBLE);
        progress.setVisibility(View.GONE);
        activeConnection = null;
        pageLoaded = false;
        pageLoadRequestId++;
    }

    private void refreshRecentConnection() {
        String recent = connectionStore.load();
        ConnectionUrl.ParseResult parsed = ConnectionUrl.parse(recent);
        boolean available = parsed.isValid();
        recentButton.setVisibility(available ? View.VISIBLE : View.GONE);
        if (available && addressInput.getText().toString().isBlank()) addressInput.setText(recent);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureBrowser() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        webView.addJavascriptInterface(new NativeControlBridge(), "ChatGPTAZNative");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params
            ) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    filePicker.launch(intent);
                    return true;
                } catch (RuntimeException error) {
                    fileCallback = null;
                    showMessage(getString(R.string.file_picker_failed));
                    return false;
                }
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgressCompat(newProgress, true);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                pageLoaded = false;
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                pageLoaded = true;
                progress.setVisibility(View.GONE);
                applyWebViewportInsets();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
                progress.setVisibility(View.GONE);
                applyWebViewportInsets();
                if (activeConnection != null) {
                    CodexMonitorService.start(MainActivity.this, activeConnection.normalizedUrl());
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (activeConnection != null && activeConnection.hasSameOrigin(request.getUrl().toString())) {
                    return false;
                }
                openExternal(request.getUrl());
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) failConnection(R.string.connection_failed);
            }

            @Override
            public void onReceivedHttpError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceResponse response
            ) {
                if (!request.isForMainFrame()) return;
                if (response.getStatusCode() == 401) {
                    failConnection(R.string.token_invalid);
                } else {
                    failConnection(getString(R.string.http_error, response.getStatusCode()));
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                failConnection(R.string.webview_process_failed);
                return true;
            }
        });
    }

    private final class NativeControlBridge {
        @JavascriptInterface
        public void reload() {
            runOnUiThread(() -> webView.reload());
        }

        @JavascriptInterface
        public void disconnect() {
            runOnUiThread(MainActivity.this::showConnectionScreen);
        }
    }

    private void schedulePageLoadTimeout() {
        final int requestId = ++pageLoadRequestId;
        pageLoaded = false;
        mainHandler.postDelayed(() -> {
            if (requestId != pageLoadRequestId || pageLoaded
                    || browserScreen.getVisibility() != View.VISIBLE) return;
            failConnection(R.string.connection_timed_out);
        }, PAGE_LOAD_TIMEOUT_MS);
    }

    private void failConnection(int messageResource) {
        failConnection(getString(messageResource));
    }

    private void failConnection(String message) {
        if (browserScreen.getVisibility() != View.VISIBLE) return;
        showConnectionScreen();
        showStatus(message, true);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (RuntimeException error) {
            showMessage(getString(R.string.external_link_failed));
        }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS);
        }
    }

    private void showStatus(String message, boolean error) {
        statusText.setText(message);
        statusText.setTextColor(getColor(error ? R.color.danger : R.color.text_secondary));
        statusText.setVisibility(message.isBlank() ? View.GONE : View.VISIBLE);
    }

    private void showMessage(String message) {
        Snackbar.make(findViewById(R.id.root), message, Snackbar.LENGTH_LONG).show();
    }
}
