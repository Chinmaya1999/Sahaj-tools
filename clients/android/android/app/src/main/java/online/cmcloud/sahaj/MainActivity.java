package online.cmcloud.sahaj;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private SplashOverlay splash;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins and listeners must be registered before the bridge starts.
        registerPlugin(SahajNativePlugin.class);
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            // The page (or the offline page, if the site could not be reached) has loaded: let the splash finish and fade out.
            @Override public void onPageLoaded(WebView webView) { hideSplashSoon(); }
            @Override public void onReceivedError(WebView webView) { hideSplashSoon(); }
        });
        super.onCreate(savedInstanceState);
        splash = new SplashOverlay(this);
        splash.show();
    }

    void hideSplashSoon() {
        // a short extra beat lets the website paint its first screen before the splash fades
        if (splash != null) getWindow().getDecorView().postDelayed(() -> splash.requestHide(), 250);
    }

    boolean isSplashVisible() { return splash != null && splash.isVisible(); }

    /**
     * The WebView keeps cookies in memory and writes them to disk lazily. If Android stops the app soon after sign-in
     * the login would be lost, so write them out every time the app leaves the foreground.
     */
    @Override
    public void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }
}
