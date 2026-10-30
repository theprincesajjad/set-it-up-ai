import ExpoModulesCore
import PassKit
import UIKit

/// Apple Wallet for Local Loyalty (docs/engineering/wallet.md, "Mobile app").
///  - `canAddPasses()`: the device can hold passes (PKAddPassesViewController.canAddPasses()).
///  - `addPassFromUrl(url)`: download the signed .pkpass (the API's 10-minute link), present Apple's Add sheet, resolve with
///    "added" (the pass is in Wallet afterwards), "cancelled", or reject with a code the JS side maps to a message.
///  - `LlAddPassButton`: Apple's own PKAddPassButton (Apple's guideline for apps), firing `onPress`.
public class LlPassKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LlPassKit")

    Function("canAddPasses") { () -> Bool in
      PKAddPassesViewController.canAddPasses()
    }

    AsyncFunction("addPassFromUrl") { (urlString: String, promise: Promise) in
      guard let url = URL(string: urlString), url.scheme == "https" || url.scheme == "http" else {
        promise.reject("ERR_BAD_URL", "Not a pass URL")
        return
      }
      var request = URLRequest(url: url)
      request.setValue("application/vnd.apple.pkpass", forHTTPHeaderField: "Accept")
      URLSession.shared.dataTask(with: request) { data, response, error in
        if let error = error {
          promise.reject("ERR_NETWORK", error.localizedDescription)
          return
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200, let data = data else {
          promise.reject(status == 503 ? "ERR_NOT_CONFIGURED" : "ERR_HTTP_\(status)", "The pass could not be downloaded")
          return
        }
        let pass: PKPass
        do {
          pass = try PKPass(data: data)
        } catch {
          promise.reject("ERR_INVALID_PASS", error.localizedDescription)
          return
        }
        DispatchQueue.main.async {
          let library = PKPassLibrary()
          guard let vc = PKAddPassesViewController(pass: pass) else {
            promise.reject("ERR_CANNOT_ADD", "This device cannot add passes")
            return
          }
          let delegate = AddPassDelegate { added in
            promise.resolve(added || library.containsPass(pass) ? "added" : "cancelled")
          }
          vc.delegate = delegate
          objc_setAssociatedObject(vc, &AddPassDelegate.key, delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
          guard let top = Self.topViewController() else {
            promise.reject("ERR_NO_VIEW", "Nothing to present from")
            return
          }
          top.present(vc, animated: true)
        }
      }.resume()
    }

    View(LlAddPassButtonView.self) {
      Events("onPress")
      Prop("style") { (view: LlAddPassButtonView, style: String) in
        view.setStyle(style == "blackOutline" ? .blackOutline : .black)
      }
    }
  }

  static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    var top = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }
}

final class AddPassDelegate: NSObject, PKAddPassesViewControllerDelegate {
  static var key: UInt8 = 0
  private let done: (Bool) -> Void
  init(done: @escaping (Bool) -> Void) { self.done = done }
  func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
    controller.dismiss(animated: true) { self.done(false) }
  }
}

/// Apple's PKAddPassButton: the system draws the correct artwork and language.
final class LlAddPassButtonView: ExpoView {
  let onPress = EventDispatcher()
  private var button = PKAddPassButton(addPassButtonStyle: .black)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    mount()
  }

  func setStyle(_ style: PKAddPassButtonStyle) {
    button.removeFromSuperview()
    button = PKAddPassButton(addPassButtonStyle: style)
    mount()
  }

  private func mount() {
    button.addTarget(self, action: #selector(tap), for: .touchUpInside)
    button.frame = bounds
    button.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(button)
  }

  @objc private func tap() { onPress([:]) }

  override func layoutSubviews() {
    super.layoutSubviews()
    button.frame = bounds
  }
}
