package com.nhzhongguo.codexmax.ui.state

import android.webkit.WebView

/**
 * 持有 WebView 引用，用于 Activity 级别的返回键处理
 */
class WebViewHolder {
    @Volatile
    var webView: WebView? = null

    fun canGoBack(): Boolean = webView?.canGoBack() == true

    fun goBack() {
        webView?.goBack()
    }

    fun clear() {
        webView?.stopLoading()
        webView?.destroy()
        webView = null
    }
}
