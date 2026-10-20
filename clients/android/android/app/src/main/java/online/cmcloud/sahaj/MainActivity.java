package online.cmcloud.sahaj;

import android.os.Bundle;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge starts.
        registerPlugin(SahajNativePlugin.class);
        super.onCreate(savedInstanceState);
    }

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
