package com.nhzhongguo.codexmax.ui.screen

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nhzhongguo.codexmax.CodexMonitorService
import com.nhzhongguo.codexmax.R
import com.nhzhongguo.codexmax.ui.state.ConnectionStateViewModel
import com.nhzhongguo.codexmax.ui.state.Screen
import com.nhzhongguo.codexmax.ui.state.WebViewHolder
import com.nhzhongguo.codexmax.ui.theme.Background
import com.nhzhongguo.codexmax.ui.theme.Primary
import com.nhzhongguo.codexmax.ui.theme.Surface

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun BrowserScreen(
    viewModel: ConnectionStateViewModel,
    webViewHolder: WebViewHolder,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val connection = state.activeConnection ?: return

    var fileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    var pageLoadRequestId by remember { mutableStateOf(0) }
    var pageLoaded by remember { mutableStateOf(false) }

    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
        onResult = { result ->
            val callback = fileCallback
            fileCallback = null
            callback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            )
        },
    )

    // Page load timeout
    LaunchedEffect(connection.normalizedUrl()) {
        val requestId = ++pageLoadRequestId
        pageLoaded = false
        kotlinx.coroutines.delay(20_000L)
        if (requestId == pageLoadRequestId && !pageLoaded &&
            state.screen == Screen.Browser
        ) {
            viewModel.onConnectionFailed(context.getString(R.string.connection_timed_out))
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Progress bar
        if (state.pageProgressVisible) {
            LinearProgressIndicator(
                progress = { state.pageProgress / 100f },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp),
                color = Primary,
                trackColor = Surface,
            )
        }

        // WebView
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    setBackgroundColor(0xFF101419.toInt())

                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        allowContentAccess = true
                        allowFileAccess = false
                        mediaPlaybackRequiresUserGesture = false
                        cacheMode = WebSettings.LOAD_NO_CACHE
                        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        loadsImagesAutomatically = true
                        blockNetworkImage = false
                        loadWithOverviewMode = false
                        useWideViewPort = false
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            safeBrowsingEnabled = true
                        }
                    }

                    addJavascriptInterface(
                        object {
                            @android.webkit.JavascriptInterface
                            fun reload() {
                                post { reload() }
                            }

                            @android.webkit.JavascriptInterface
                            fun disconnect() {
                                post {
                                    viewModel.disconnect()
                                }
                            }
                        },
                        "ChatGPTAZNative",
                    )

                    webChromeClient = object : WebChromeClient() {
                        override fun onShowFileChooser(
                            view: WebView?,
                            callback: ValueCallback<Array<Uri>>?,
                            params: FileChooserParams?,
                        ): Boolean {
                            fileCallback?.onReceiveValue(null)
                            fileCallback = callback
                            return try {
                                val intent = params?.createIntent()?.apply {
                                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                                }
                                if (intent != null) {
                                    filePicker.launch(intent)
                                }
                                true
                            } catch (e: RuntimeException) {
                                fileCallback = null
                                false
                            }
                        }

                        override fun onProgressChanged(view: WebView?, newProgress: Int) {
                            viewModel.updateProgress(newProgress)
                        }
                    }

                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                            pageLoaded = false
                            viewModel.updateProgress(0)
                        }

                        override fun onPageCommitVisible(view: WebView?, url: String?) {
                            pageLoaded = true
                            viewModel.onPageLoaded()
                            applyWebViewportInsets(this@apply)
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            pageLoaded = true
                            viewModel.onPageLoaded()
                            applyWebViewportInsets(this@apply)
                            // Start monitor service and check for updates
                            CodexMonitorService.start(context, connection.normalizedUrl())
                        }

                        override fun shouldOverrideUrlLoading(
                            view: WebView?,
                            request: WebResourceRequest?,
                        ): Boolean {
                            val requestUrl = request?.url?.toString() ?: return false
                            if (connection.hasSameOrigin(requestUrl)) return false
                            try {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(requestUrl)))
                            } catch (e: RuntimeException) {
                                viewModel.showSnackbar(
                                    context.getString(R.string.external_link_failed)
                                )
                            }
                            return true
                        }

                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?,
                        ) {
                            if (request?.isForMainFrame == true) {
                                viewModel.onConnectionFailed(
                                    context.getString(R.string.connection_failed)
                                )
                            }
                        }

                        override fun onReceivedHttpError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            errorResponse: WebResourceResponse?,
                        ) {
                            if (request?.isForMainFrame != true) return
                            val code = errorResponse?.statusCode ?: 0
                            val message = if (code == 401) {
                                context.getString(R.string.token_invalid)
                            } else {
                                context.getString(R.string.http_error, code)
                            }
                            viewModel.onConnectionFailed(message)
                        }

                        override fun onRenderProcessGone(
                            view: WebView?,
                            detail: RenderProcessGoneDetail?,
                        ): Boolean {
                            viewModel.onConnectionFailed(
                                context.getString(R.string.webview_process_failed)
                            )
                            return true
                        }
                    }

                    webViewHolder.webView = this
                    loadUrl(connection.normalizedUrl())
                }
            },
            update = { webView ->
                // Apply viewport insets whenever keyboard height changes
                applyWebViewportInsets(webView)
            },
            onRelease = { webView ->
                webView.stopLoading()
                webView.destroy()
                webViewHolder.webView = null
            },
            modifier = Modifier
                .fillMaxSize()
                .background(Background),
        )
    }
}

private fun applyWebViewportInsets(webView: WebView) {
    val script = "(function(){var d=document.documentElement;" +
        "d.style.setProperty('--native-safe-area-top','0px');" +
        "d.style.setProperty('--native-safe-area-bottom','0px');" +
        "d.style.setProperty('--native-keyboard-height','0px');" +
        "d.dataset.nativeSafeArea='true';" +
        "window.dispatchEvent(new Event('chatgptwininsetschange'));})();"
    webView.evaluateJavascript(script, null)
}
