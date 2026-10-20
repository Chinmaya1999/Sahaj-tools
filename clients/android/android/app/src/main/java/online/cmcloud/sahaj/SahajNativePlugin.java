package online.cmcloud.sahaj;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Printing for the Sahaj website running inside the app. Android's WebView has no print dialog of its own, so
 * window.print() would do nothing. These methods hand the page (or a snippet of HTML) to the system print service,
 * which can print or "Save as PDF".
 */
@CapacitorPlugin(name = "SahajNative")
public class SahajNativePlugin extends Plugin {

    /** Keeps the off-screen WebView alive until the system print service has finished with it. */
    private WebView printHtmlView;

    private void startPrint(WebView source, String name, PluginCall call) {
        try {
            PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            PrintDocumentAdapter adapter = source.createPrintDocumentAdapter(name);
            pm.print(name, adapter, new PrintAttributes.Builder().build());
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the print dialog: " + e.getMessage());
        }
    }

    /** Prints the page currently on screen (uses the site's print stylesheet). */
    @PluginMethod
    public void print(PluginCall call) {
        final String name = call.getString("name", "Sahaj");
        getActivity().runOnUiThread(() -> startPrint(getBridge().getWebView(), name, call));
    }

    /** Prints a self-contained HTML document, for example a receipt, without showing it first. */
    @PluginMethod
    public void printHtml(PluginCall call) {
        final String html = call.getString("html");
        final String name = call.getString("name", "Sahaj");
        if (html == null || html.isEmpty()) {
            call.reject("Nothing to print");
            return;
        }
        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getActivity());
            view.getSettings().setJavaScriptEnabled(false); // receipts are static; never run script in this view
            view.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView v, String url) {
                    startPrint(v, name, call);
                }
            });
            printHtmlView = view;
            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    /** The website calls this once its first screen is painted; harmless if the splash is already gone. */
    @PluginMethod
    public void hideSplash(PluginCall call) {
        if (getActivity() instanceof MainActivity) getActivity().runOnUiThread(() -> ((MainActivity) getActivity()).hideSplashSoon());
        call.resolve();
    }

    /** Whether the launch splash is still on screen (used by the device tests). */
    @PluginMethod
    public void splashState(PluginCall call) {
        JSObject r = new JSObject();
        r.put("visible", getActivity() instanceof MainActivity && ((MainActivity) getActivity()).isSplashVisible());
        call.resolve(r);
    }
}
