import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// Native passkey ceremony only. Supabase verifies every credential and issues sessions.
import AuthenticationServices

class StreamUnifyViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(StreamUnifyPasskeysPlugin())
    }
}

@objc(StreamUnifyPasskeysPlugin)
public class StreamUnifyPasskeysPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "StreamUnifyPasskeysPlugin"
    public let jsName = "StreamUnifyPasskeys"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]
    private var pendingCall: CAPPluginCall?
    private var controller: ASAuthorizationController?
    private var anchor: ASPresentationAnchor?
    private func decode(_ value: String?) -> Data? {
        guard var value = value else { return nil }
        value = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        value += String(repeating: "=", count: (4 - value.count % 4) % 4)
        return Data(base64Encoded: value)
    }
    private func encode(_ value: Data) -> String {
        value.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) { call.resolve(["available": true]) }
        else { call.resolve(["available": false]) }
    }
    @objc func register(_ call: CAPPluginCall) { begin(call, registering: true) }
    @objc func authenticate(_ call: CAPPluginCall) { begin(call, registering: false) }
    private func begin(_ call: CAPPluginCall, registering: Bool) {
        DispatchQueue.main.async {
            guard #available(iOS 16.0, *) else { call.reject("Passkeys require iOS 16 or later", "unsupported"); return }
            guard self.pendingCall == nil else { call.reject("A passkey request is already open", "busy"); return }
            guard let options = call.getObject("options"), let challenge = self.decode(options["challenge"] as? String), let window = self.bridge?.viewController?.view.window else { call.reject("Invalid passkey request", "invalid_request"); return }
            let rp = options["rp"] as? [String: Any]
            let domain = registering ? rp?["id"] as? String : options["rpId"] as? String
            // Prevent JavaScript or a remote page from requesting another relying party.
            guard domain == "www.streamunify.com" else { call.reject("Invalid relying party", "invalid_request"); return }
            let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: "www.streamunify.com")
            let request: ASAuthorizationRequest
            if registering {
                guard let user = options["user"] as? [String: Any], let name = user["name"] as? String, let userID = self.decode(user["id"] as? String) else { call.reject("Invalid user", "invalid_request"); return }
                let creation = provider.createCredentialRegistrationRequest(challenge: challenge, name: name, userID: userID)
                creation.userVerificationPreference = .required
                request = creation
            } else {
                let assertion = provider.createCredentialAssertionRequest(challenge: challenge)
                assertion.userVerificationPreference = .required
                request = assertion
            }
            self.pendingCall = call
            self.anchor = window
            let controller = ASAuthorizationController(authorizationRequests: [request])
            self.controller = controller
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor! }
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { pendingCall = nil; self.controller = nil; anchor = nil }
        if #available(iOS 16.0, *) {
            var credential: [String: Any]
            if let registration = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration, let attestation = registration.rawAttestationObject {
                credential = ["id": encode(registration.credentialID), "rawId": encode(registration.credentialID), "type": "public-key", "authenticatorAttachment": "platform", "clientExtensionResults": [:], "response": ["clientDataJSON": encode(registration.rawClientDataJSON), "attestationObject": encode(attestation), "transports": ["internal"]]]
            } else if let assertion = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
                credential = ["id": encode(assertion.credentialID), "rawId": encode(assertion.credentialID), "type": "public-key", "authenticatorAttachment": "platform", "clientExtensionResults": [:], "response": ["clientDataJSON": encode(assertion.rawClientDataJSON), "authenticatorData": encode(assertion.rawAuthenticatorData), "signature": encode(assertion.signature), "userHandle": encode(assertion.userID)]]
            } else { pendingCall?.reject("Unsupported credential", "invalid_credential"); return }
            pendingCall?.resolve(["credential": credential])
        }
    }
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        pendingCall?.reject("Passkey request did not complete", (error as? ASAuthorizationError)?.code == .canceled ? "cancelled" : "passkey_failed")
        pendingCall = nil; self.controller = nil; anchor = nil
    }
}
