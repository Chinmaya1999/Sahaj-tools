import Capacitor
import UIKit

/// The app's main screen: Capacitor's web view controller plus the app's own native plugin(s).
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SahajNativePlugin())
    }
}
