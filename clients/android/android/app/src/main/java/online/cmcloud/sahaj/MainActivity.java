package online.cmcloud.sahaj;

import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

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
        // Draw edge-to-edge on every Android version, and inset the page ourselves (see applySystemBarInsets).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);
        applySystemBarInsets();
        splash = new SplashOverlay(this);
        splash.show();
    }

    /**
     * Keeps the page clear of the status bar, gesture bar, notch and keyboard in exactly the same way on every phone.
     * Capacitor can instead hand the insets to the page when the phone's WebView is new enough, which made the layout differ
     * between phones, so that behaviour is turned off in capacitor.config.ts ("insetsHandling": "disable") and replaced by this.
     * The insets are consumed here, so CSS env(safe-area-inset-*) is 0 inside the page and the website must not add its own.
     */
    private void applySystemBarInsets() {
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            int bars = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets b = insets.getInsets(bars);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            v.setPadding(b.left, b.top, b.right, keyboard ? ime.bottom : b.bottom);
            return new WindowInsetsCompat.Builder(insets).setInsets(bars, Insets.NONE).build();
        });
        ViewCompat.requestApplyInsets(decor);
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
