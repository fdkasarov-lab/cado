/**
 * WEBVIEW NATIVE BRIDGE — FCM Push Notifications
 * ═══════════════════════════════════════════════════════════════════════════
 * Your web app gets FCM tokens from the native wrapper and saves them to
 * your server. Choose the section for your wrapper.
 *
 * HOW IT WORKS:
 *   1. Native app gets the FCM token on launch
 *   2. Native app injects it into the WebView as window.NativeFCMToken
 *      (OR posts a message the web app listens for)
 *   3. Web app sends token to your server via POST /fcm/token
 *   4. Server stores token in user.fcmTokens array
 *   5. Server sends FCM push via firebase-admin when needed
 */


/* ═══════════════════════════════════════════════════════════════════════════
   OPTION A — REACT NATIVE WEBVIEW
   npm install @react-native-firebase/app @react-native-firebase/messaging
   ─────────────────────────────────────────────────────────────────────── */

// App.js (React Native)
/*
import React, { useEffect, useRef } from 'react'
import { WebView } from 'react-native-webview'
import messaging from '@react-native-firebase/messaging'

export default function App() {
    const webViewRef = useRef(null)

    useEffect(() => {
        setupFCM()
    }, [])

    async function setupFCM() {
        // 1. Request permission (iOS requires explicit request)
        const authStatus = await messaging().requestPermission()
        const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL

        if (!enabled) return

        // 2. Get FCM token
        const token = await messaging().getToken()

        // 3. Inject token into WebView before page loads
        // The web app checks window.NativeFCMToken on startup
        if (webViewRef.current && token) {
            webViewRef.current.injectJavaScript(`
                window.NativeFCMToken = "${token}";
                // If web app already loaded, trigger token save manually
                if (window.__setupFCMPush && window.CurrentUser) {
                    window.__setupFCMPush(window.CurrentUser.getUsername());
                }
                true;
            `)
        }

        // 4. Handle token refresh
        messaging().onTokenRefresh(newToken => {
            webViewRef.current?.injectJavaScript(`
                window.NativeFCMToken = "${newToken}";
                true;
            `)
        })

        // 5. Handle background/killed app — when user taps notification
        messaging().onNotificationOpenedApp(remoteMessage => {
            const data = remoteMessage.data
            webViewRef.current?.injectJavaScript(`
                window.dispatchEvent(new CustomEvent('nativeNotificationClick', {
                    detail: ${JSON.stringify(data)}
                }));
                true;
            `)
        })

        // Check if app was opened from a killed state via notification
        const initialMessage = await messaging().getInitialNotification()
        if (initialMessage) {
            // App just opened from killed state via notification tap
            // WebView might not be ready yet — handle after load
        }
    }

    return (
        <WebView
            ref={webViewRef}
            source={{ uri: 'https://YOUR_APP_URL' }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            // Required for microphone (voice calls)
            mediaCapturePermissionGrantType="grant"
        />
    )
}
*/


/* ═══════════════════════════════════════════════════════════════════════════
   OPTION B — CAPACITOR (Ionic / Vue / Angular / React)
   npm install @capacitor/push-notifications
   ─────────────────────────────────────────────────────────────────────── */

/*
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId:    'com.yourapp.chat',
    appName:  'YourApp',
    webDir:   'public',
    server: {
        url:             'https://YOUR_APP_URL',  // your server URL
        cleartext:        true,
        androidScheme:   'https',
    },
    plugins: {
        PushNotifications: {
            presentationOptions: ['badge', 'sound', 'alert']
        }
    }
}
export default config


// In your main app file (e.g. main.ts or App.vue):
import { PushNotifications } from '@capacitor/push-notifications'

async function setupCapacitorPush(username: string) {
    // Request permission
    const permission = await PushNotifications.requestPermissions()
    if (permission.receive !== 'granted') return

    // Register with FCM/APNs
    await PushNotifications.register()

    // Get the FCM token
    PushNotifications.addListener('registration', async (token) => {
        console.log('FCM Token:', token.value)
        // Save to your server
        await fetch('https://YOUR_APP_URL/fcm/token', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username, token: token.value })
        })
    })

    PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error:', err)
    })

    // Handle notification received while app is in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push received:', notification)
        // The web layer handles foreground via onMessage() in firebase SDK
    })

    // Handle notification tap (app was in background/killed)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification.data
        // Route to correct chat or show call modal
        if (data.type === 'call') {
            // Handle incoming call action
        }
        if (data.chatId) {
            // Open specific chat
        }
    })
}
*/


/* ═══════════════════════════════════════════════════════════════════════════
   OPTION C — CUSTOM ANDROID (Kotlin/Java + WebView)
   implementation 'com.google.firebase:firebase-messaging:23.+'
   ─────────────────────────────────────────────────────────────────────── */

/*
// MyFirebaseMessagingService.kt
class MyFirebaseMessagingService : FirebaseMessagingService() {

    // Called when FCM token is created or refreshed
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Store token locally to inject into WebView
        getSharedPreferences("fcm", MODE_PRIVATE)
            .edit()
            .putString("token", token)
            .apply()
    }

    // Called when notification arrives while app is in FOREGROUND
    override fun onMessageReceived(message: RemoteMessage) {
        // App is open — let WebView handle it
        // WebView onMessage() already handles this
    }
}

// MainActivity.kt
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false

        // Get stored FCM token and inject into WebView
        val token = getSharedPreferences("fcm", MODE_PRIVATE).getString("token", null)

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                if (token != null) {
                    view.evaluateJavascript(
                        "window.NativeFCMToken = '$token'; true;",
                        null
                    )
                }
            }
        }

        webView.loadUrl("https://YOUR_APP_URL")
        setContentView(webView)

        // Request FCM token if not available
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val freshToken = task.result
                webView.evaluateJavascript(
                    "window.NativeFCMToken = '$freshToken'; true;",
                    null
                )
            }
        }
    }
}
*/


/* ═══════════════════════════════════════════════════════════════════════════
   OPTION D — CUSTOM iOS (Swift + WKWebView)
   pod 'Firebase/Messaging'
   ─────────────────────────────────────────────────────────────────────── */

/*
// AppDelegate.swift
import UIKit
import Firebase
import FirebaseMessaging
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate, UNUserNotificationCenterDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions ...) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self

        // Request notification permissions
        UNUserNotificationCenter.current().delegate = self
        let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
        UNUserNotificationCenter.current().requestAuthorization(options: authOptions) { granted, _ in
            print("Push permission granted: \(granted)")
        }
        application.registerForRemoteNotifications()
        return true
    }

    // Called when FCM token is refreshed
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        // Post to WebView
        NotificationCenter.default.post(
            name: .fcmTokenRefreshed,
            object: nil,
            userInfo: ["token": token]
        )
    }
}

// ViewController.swift (with WKWebView)
class ViewController: UIViewController {
    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        webView = WKWebView(frame: view.bounds)
        view.addSubview(webView)
        webView.load(URLRequest(url: URL(string: "https://YOUR_APP_URL")!))

        // Listen for FCM token and inject into WebView
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(injectToken(_:)),
            name: .fcmTokenRefreshed,
            object: nil
        )

        // Get current token
        Messaging.messaging().token { token, error in
            if let token = token {
                self.injectFCMToken(token)
            }
        }
    }

    @objc func injectToken(_ notification: Notification) {
        if let token = notification.userInfo?["token"] as? String {
            injectFCMToken(token)
        }
    }

    func injectFCMToken(_ token: String) {
        let js = "window.NativeFCMToken = '\(token)'; true;"
        webView.evaluateJavaScript(js)
    }
}
*/


/* ═══════════════════════════════════════════════════════════════════════════
   SETUP CHECKLIST
   ─────────────────────────────────────────────────────────────────────── */
/*
SERVER SIDE:
  ✅ npm install firebase-admin
  ✅ Download service account JSON → src/firebase-service-account.json
  ✅ Add to .gitignore: src/firebase-service-account.json
  ✅ firebase-service.js added to project root
  ✅ main.js updated with FCM calls
  ✅ user.js updated with fcmTokens field

WEB SIDE:
  ✅ public/firebase-messaging-sw.js — replace YOUR_* config values
  ✅ index.ejs Firebase config — replace YOUR_* config values
  ✅ index.ejs VAPID_KEY — from Firebase Console → Cloud Messaging → Web Push
  ✅ Add app icons: public/icons/icon-192.png and public/icons/badge-72.png

FIREBASE CONSOLE:
  ✅ Enable Cloud Messaging in Firebase Console
  ✅ For Android: download google-services.json → android/app/
  ✅ For iOS: download GoogleService-Info.plist → ios/Runner/
  ✅ iOS: Enable Push Notifications capability in Xcode
  ✅ iOS: Upload APNs Auth Key in Firebase Console → Project Settings → Cloud Messaging

ANDROID NOTIFICATION CHANNELS (add to android/app/src/main/res/values/strings.xml):
  <string name="default_notification_channel_id">messages</string>
  Create channels in MainActivity.onCreate():
    - ID: "messages", Name: "Chat Messages", Importance: HIGH
    - ID: "calls",    Name: "Incoming Calls", Importance: MAX + setBypassDnd(true)
*/
