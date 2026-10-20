import Capacitor
import UIKit
import WebKit

/// Printing for the Sahaj website running inside the app. WKWebView ignores window.print(), so the website
/// calls these methods instead; they open the standard iOS print sheet (which can print or "Save to Files" as PDF).
@objc(SahajNativePlugin)
public class SahajNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SahajNativePlugin"
    public let jsName = "SahajNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printHtml", returnType: CAPPluginReturnPromise)
    ]

    /// Kept alive until the print sheet has finished with it.
    private var htmlView: WKWebView?
    private var htmlLoader: HtmlLoader?

    /// Prints the page currently on screen (uses the site's print stylesheet).
    @objc public func print(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "Sahaj"
        DispatchQueue.main.async {
            guard let web = self.bridge?.webView else { call.reject("There is no page to print"); return }
            self.present(web.viewPrintFormatter(), name: name, call: call)
        }
    }

    /// Prints a self-contained HTML document (for example a receipt) without showing it first.
    @objc public func printHtml(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), !html.isEmpty else { call.reject("Nothing to print"); return }
        let name = call.getString("name") ?? "Sahaj"
        DispatchQueue.main.async {
            let config = WKWebViewConfiguration()
            config.defaultWebpagePreferences.allowsContentJavaScript = false // receipts are static; never run script here
            let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 612, height: 792), configuration: config)
            let loader = HtmlLoader { [weak self] in self?.present(view.viewPrintFormatter(), name: name, call: call) }
            view.navigationDelegate = loader
            self.htmlView = view
            self.htmlLoader = loader
            view.loadHTMLString(html, baseURL: nil)
        }
    }

    private func present(_ formatter: UIViewPrintFormatter, name: String, call: CAPPluginCall) {
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = name
        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printFormatter = formatter
        controller.present(animated: true) { _, _, error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }
}

private final class HtmlLoader: NSObject, WKNavigationDelegate {
    private let onFinish: () -> Void
    init(onFinish: @escaping () -> Void) { self.onFinish = onFinish }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { onFinish() }
}
