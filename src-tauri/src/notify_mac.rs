//! Native macOS notifications via UNUserNotificationCenter.
//!
//! `tauri-plugin-notification` is fire-and-forget on desktop: clicks emit
//! nothing, and in dev mode the sender attribution is wrong. This module
//! sends through the system framework so the notification carries the app's
//! own icon and click responses reach a delegate, which deep-links back into
//! the frontend via the `notification:clicked` event (or a parked "pending"
//! slot when the click is what launched the app).
//!
//! Only works from a real .app bundle — `has_bundle()` gates everything so a
//! bare `tauri dev` binary falls back to the plugin path (the center traps
//! on processes without a bundle identifier).

use std::sync::Mutex;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{Bool, ProtocolObject};
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass};
use objc2_foundation::{NSBundle, NSDictionary, NSError, NSObject, NSObjectProtocol, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNMutableNotificationContent, UNNotification,
    UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse,
    UNNotificationSound, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};
use tauri::{AppHandle, Emitter, Manager};

const USER_INFO_PATH_KEY: &str = "path";

/// Click target parked for the cold-start case: the click launches the app,
/// the delegate fires before the frontend listens, and the frontend pulls
/// this via `take_pending_notification_click` once its stores are loaded.
static PENDING_CLICK: Mutex<Option<String>> = Mutex::new(None);

pub fn take_pending() -> Option<String> {
    PENDING_CLICK.lock().unwrap().take()
}

/// UNUserNotificationCenter raises an Objective-C exception when the process
/// has no bundle (plain `tauri dev` binary), so this must gate every access.
fn has_bundle() -> bool {
    NSBundle::mainBundle().bundleIdentifier().is_some()
}

struct Ivars {
    app: AppHandle,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "SilexNotificationDelegate"]
    #[ivars = Ivars]
    struct NotificationDelegate;

    unsafe impl NSObjectProtocol for NotificationDelegate {}

    unsafe impl UNUserNotificationCenterDelegate for NotificationDelegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &block2::Block<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            // Without this, macOS suppresses notifications while the app is
            // frontmost.
            completion_handler.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::Sound,));
        }

        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn did_receive(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            completion_handler: &block2::Block<dyn Fn()>,
        ) {
            let path = {
                let content = response.notification().request().content();
                let user_info = content.userInfo();
                let key = NSString::from_str(USER_INFO_PATH_KEY);
                user_info
                    .objectForKey(&key)
                    .and_then(|v| v.downcast::<NSString>().ok())
                    .map(|s| s.to_string())
            };
            if let Some(path) = path {
                *PENDING_CLICK.lock().unwrap() = Some(path.clone());
                let app = self.ivars().app.clone();
                // The delegate is called on an arbitrary queue; window
                // operations must run on the main thread.
                let handle = app.clone();
                let _ = handle.run_on_main_thread(move || {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.unminimize();
                        let _ = win.set_focus();
                    }
                    let _ = app.emit("notification:clicked", path);
                });
            }
            completion_handler.call(());
        }
    }
);

impl NotificationDelegate {
    fn new(app: AppHandle) -> Retained<Self> {
        let this = Self::alloc().set_ivars(Ivars { app });
        unsafe { msg_send![super(this), init] }
    }
}

/// Registers the delegate and requests authorization. Call once from setup;
/// must happen early so a launch-by-click still delivers its response.
pub fn init(app: AppHandle) {
    if !has_bundle() {
        return;
    }
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let delegate = NotificationDelegate::new(app);
    center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    // The center holds the delegate weakly; keep it alive for the
    // app's lifetime.
    std::mem::forget(delegate);
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound | UNAuthorizationOptions::Badge,
        &RcBlock::new(|_granted: Bool, _error: *mut NSError| {}),
    );
}

/// Sends a notification whose click opens `target_path` in the app.
/// Returns false when the native path is unavailable (no bundle) so the
/// caller can fall back to the notification plugin.
pub fn send(title: &str, body: &str, target_path: &str) -> bool {
    if !has_bundle() {
        return false;
    }
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(title));
    if !body.is_empty() {
        content.setBody(&NSString::from_str(body));
    }
    content.setSound(Some(&UNNotificationSound::defaultSound()));
    let key = NSString::from_str(USER_INFO_PATH_KEY);
    let value = NSString::from_str(target_path);
    let typed: Retained<NSDictionary<NSString, NSString>> =
        NSDictionary::from_slices(&[&*key], &[&*value]);
    // Erase the generics: ObjC generics are compile-time only, so the
    // untyped NSDictionary the API wants is the same object.
    let user_info: Retained<NSDictionary> = unsafe { Retained::cast_unchecked(typed) };
    // Safety: userInfo only has to be plist-typed; ours is NSString → NSString.
    unsafe { content.setUserInfo(&user_info) };
    let id = NSString::from_str(&format!(
        "silex-reminder-{}",
        crate::commands::now_millis()
    ));
    let request =
        UNNotificationRequest::requestWithIdentifier_content_trigger(&id, &content, None);
    center.addNotificationRequest_withCompletionHandler(&request, None);
    true
}
