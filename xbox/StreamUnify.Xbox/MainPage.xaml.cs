using System;
using System.IO;
using Windows.ApplicationModel;
using Windows.Data.Json;
using Windows.Gaming.Input;
using Windows.System;
using Windows.UI.Core;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
namespace StreamUnify.Xbox
{
    public sealed partial class MainPage : Page
    {
        const string Origin = "https://streamunify-xbox.example";
        readonly DispatcherTimer controller = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };
        GamepadButtons previous;
        string lastDirection;
        DateTime repeatAt, backAt;
        bool keyboardVisible, ready;
        public MainPage()
        {
            InitializeComponent();
            Loaded += async (s, e) => await Start();
            controller.Tick += Poll;
            var keyboard = InputPane.GetForCurrentView();
            keyboard.Showing += (s, e) => keyboardVisible = true;
            keyboard.Hiding += (s, e) => { keyboardVisible = false; previous = GamepadButtons.A; repeatAt = DateTime.UtcNow.AddMilliseconds(400); };
            SystemNavigationManager.GetForCurrentView().BackRequested += (s, e) => { e.Handled = true; if (!keyboardVisible) Back(); };
            Application.Current.Suspending += (s, e) => controller.Stop();
            Application.Current.Resuming += async (s, e) => { previous = GamepadButtons.None; controller.Start(); if (ready) await Browser.ExecuteScriptAsync("window.streamUnifyResume?.()"); };
        }
        async System.Threading.Tasks.Task Start()
        {
            try
            {
                if (ready) return;
                await Browser.EnsureCoreWebView2Async();
                var core = Browser.CoreWebView2;
                core.SetVirtualHostNameToFolderMapping("streamunify-xbox.example", Path.Combine(Package.Current.InstalledLocation.Path, "Web"), CoreWebView2HostResourceAccessKind.DenyCors);
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.NavigationStarting += (s, e) => { if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) || uri.GetLeftPart(UriPartial.Authority) != Origin) e.Cancel = true; };
                core.NewWindowRequested += (s, e) => e.Handled = true;
                core.PermissionRequested += (s, e) => e.State = CoreWebView2PermissionState.Deny;
                core.WebMessageReceived += async (s, e) =>
                {
                    if (!e.Source.StartsWith(Origin + "/", StringComparison.Ordinal)) return;
                    try
                    {
                        var message = JsonObject.Parse(e.TryGetWebMessageAsString());
                        if (message.GetNamedString("type") == "keyboard") { InputPane.GetForCurrentView().TryShow(); return; }
                        if (message.GetNamedString("type") != "legal") return;
                        var url = message.GetNamedString("url");
                        if (url == "https://www.streamunify.com/privacy" || url == "https://www.streamunify.com/terms") await Launcher.LaunchUriAsync(new Uri(url));
                    }
                    catch { /* Ignore malformed or unsupported messages. No credentials are logged. */ }
                };
                core.NavigationCompleted += (s, e) => { Failure.Visibility = e.IsSuccess ? Visibility.Collapsed : Visibility.Visible; };
                core.Navigate(Origin + "/index.html");
                ready = true; Failure.Visibility = Visibility.Collapsed; controller.Start();
            }
            catch { Failure.Visibility = Visibility.Visible; }
        }
        async void Retry_Click(object sender, RoutedEventArgs e) { if (ready) Browser.CoreWebView2.Reload(); else await Start(); }
        async void Command(string value)
        {
            if (!ready) return;
            try { await Browser.ExecuteScriptAsync("window.streamUnifyCommand?.('" + value + "')"); }
            catch { /* Navigation or suspension can interrupt a controller command. */ }
        }
        void Back() { if ((DateTime.UtcNow - backAt).TotalMilliseconds < 250) return; backAt = DateTime.UtcNow; Command("back"); }
        void Poll(object sender, object args)
        {
            if (Gamepad.Gamepads.Count == 0) { previous = GamepadButtons.None; lastDirection = null; return; }
            var reading = Gamepad.Gamepads[0].GetCurrentReading();
            var buttons = reading.Buttons;
            if (keyboardVisible) { previous = buttons; return; }
            var now = DateTime.UtcNow;
            var direction = buttons.HasFlag(GamepadButtons.DPadUp) || reading.LeftThumbstickY > .6 ? "up" :
                buttons.HasFlag(GamepadButtons.DPadDown) || reading.LeftThumbstickY < -.6 ? "down" :
                buttons.HasFlag(GamepadButtons.DPadLeft) || reading.LeftThumbstickX < -.6 ? "left" :
                buttons.HasFlag(GamepadButtons.DPadRight) || reading.LeftThumbstickX > .6 ? "right" : null;
            if (direction != null && (direction != lastDirection || now >= repeatAt)) { Command(direction); repeatAt = now.AddMilliseconds(direction == lastDirection ? 150 : 400); }
            lastDirection = direction;
            if (buttons.HasFlag(GamepadButtons.A) && !previous.HasFlag(GamepadButtons.A)) Command("select");
            if (buttons.HasFlag(GamepadButtons.B) && !previous.HasFlag(GamepadButtons.B)) Back();
            previous = buttons;
        }
    }
}
