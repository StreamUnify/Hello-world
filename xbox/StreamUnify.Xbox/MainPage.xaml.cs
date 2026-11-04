using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
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
        ProviderLauncher providerLauncher;
        CancellationTokenSource providerCancellation;
        string providerRequest;
        GamepadButtons previous;
        string lastDirection;
        DateTime repeatAt, backAt, scrollAt;
        bool keyboardVisible, ready, editingText, editingPassword;
        public MainPage()
        {
            InitializeComponent();
            Loaded += async (s, e) => await Start();
            controller.Tick += Poll;
            var keyboard = InputPane.GetForCurrentView();
            keyboard.Showing += (s, e) => keyboardVisible = true;
            keyboard.Hiding += (s, e) => { keyboardVisible = false; previous = (Gamepad.Gamepads.Count > 0 ? Gamepad.Gamepads[0].GetCurrentReading().Buttons : GamepadButtons.None) | GamepadButtons.A; repeatAt = DateTime.UtcNow.AddMilliseconds(400); };
            SystemNavigationManager.GetForCurrentView().BackRequested += (s, e) => { e.Handled = true; if (keyboardVisible) InputPane.GetForCurrentView().TryHide(); else if (editingText) FinishTextEntry(false); else Back(); };
            Application.Current.Suspending += (s, e) => { controller.Stop(); providerCancellation?.Cancel(); };
            Application.Current.Resuming += async (s, e) => { previous = GamepadButtons.None; controller.Start(); if (ready) await Browser.ExecuteScriptAsync("window.streamUnifyResume?.()"); };
        }
        async System.Threading.Tasks.Task Start()
        {
            try
            {
                if (ready) return;
                var hosts = JsonArray.Parse(await Windows.Storage.FileIO.ReadTextAsync(await Package.Current.InstalledLocation.GetFileAsync(@"Web\xbox-provider-hosts.json")));
                providerLauncher = new ProviderLauncher(hosts.Select(value => value.GetString()));
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
                        if (message.GetNamedString("type") == "keyboard") { BeginTextEntry(message); return; }
                        if (message.GetNamedString("type") == "providerCancel") { if (message.GetNamedString("requestId", "") == providerRequest) providerCancellation?.Cancel(); return; }
                        if (message.GetNamedString("type") == "providerLaunch") { await OpenProvider(message); return; }
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
        sealed class InstalledProviderApps : IProviderApps
        {
            public async Task<IReadOnlyList<string>> FindAsync(Uri uri, CancellationToken token)
            {
                var apps = await Launcher.FindAppUriHandlersAsync(uri).AsTask(token);
                return apps.Select(app => app.PackageFamilyName).ToArray();
            }
            public async Task<bool> SupportsAsync(Uri uri, string family, CancellationToken token)
            {
                return await Launcher.QueryAppUriSupportAsync(uri, family).AsTask(token) == LaunchQuerySupportStatus.Available;
            }
            public async Task<bool> LaunchAsync(Uri uri, string family, CancellationToken token)
            {
                token.ThrowIfCancellationRequested();
                return await Launcher.LaunchUriAsync(uri, new LauncherOptions { TargetApplicationPackageFamilyName = family }).AsTask(token);
            }
        }
        async Task OpenProvider(JsonObject message)
        {
            var id = message.GetNamedString("requestId", "");
            if (id.Length == 0 || id.Length > 32 || id.Any(c => c < '0' || c > '9')) return;
            string status = "busy";
            if (providerCancellation == null && !editingText)
            {
                var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                providerCancellation = cancellation; providerRequest = id;
                try { status = await providerLauncher.OpenAsync(message.GetNamedString("url", ""), new InstalledProviderApps(), cancellation.Token); }
                finally { providerCancellation = null; providerRequest = null; cancellation.Dispose(); }
            }
            var result = new JsonObject { ["requestId"] = JsonValue.CreateStringValue(id), ["status"] = JsonValue.CreateStringValue(status) };
            try { await Browser.ExecuteScriptAsync("window.streamUnifyProviderResult?.(" + result.Stringify() + ")"); }
            catch { /* Suspension can interrupt the reply. Never log account URLs. */ }
        }
        void BeginTextEntry(JsonObject message)
        {
            if (editingText) return;
            editingText = true;
            editingPassword = message.GetNamedString("inputType", "text") == "password";
            TextEntryLabel.Text = message.GetNamedString("label", "Enter text");
            int limit = (int)Math.Max(1, Math.Min(4096, message.GetNamedNumber("maxLength", 4096)));
            TextEntryValue.MaxLength = limit; TextEntryPassword.MaxLength = limit;
            TextEntryValue.Text = editingPassword ? "" : message.GetNamedString("value", "");
            TextEntryPassword.Password = editingPassword ? message.GetNamedString("value", "") : "";
            TextEntryValue.Visibility = editingPassword ? Visibility.Collapsed : Visibility.Visible;
            TextEntryPassword.Visibility = editingPassword ? Visibility.Visible : Visibility.Collapsed;
            Browser.IsEnabled = false; TextEntry.Visibility = Visibility.Visible;
            if (editingPassword) TextEntryPassword.Focus(FocusState.Programmatic);
            else { TextEntryValue.Focus(FocusState.Programmatic); TextEntryValue.SelectAll(); }
            InputPane.GetForCurrentView().TryShow();
        }
        async void FinishTextEntry(bool accepted)
        {
            if (!editingText) return;
            string text = accepted ? (editingPassword ? TextEntryPassword.Password : TextEntryValue.Text) : "";
            editingText = false; InputPane.GetForCurrentView().TryHide();
            TextEntry.Visibility = Visibility.Collapsed; TextEntryValue.Text = ""; TextEntryPassword.Password = "";
            Browser.IsEnabled = true; Browser.Focus(FocusState.Programmatic);
            previous = (Gamepad.Gamepads.Count > 0 ? Gamepad.Gamepads[0].GetCurrentReading().Buttons : GamepadButtons.None) | GamepadButtons.A | GamepadButtons.B;
            repeatAt = DateTime.UtcNow.AddMilliseconds(400);
            var result = new JsonObject { ["accepted"] = JsonValue.CreateBooleanValue(accepted), ["text"] = JsonValue.CreateStringValue(text) };
            try { await Browser.ExecuteScriptAsync("window.streamUnifyTextResult?.(" + result.Stringify() + ")"); }
            catch { /* No text or credentials are logged. */ }
        }
        void TextEntryDone_Click(object sender, RoutedEventArgs e) { FinishTextEntry(true); }
        void TextEntryCancel_Click(object sender, RoutedEventArgs e) { FinishTextEntry(false); }
        void TextEntry_KeyDown(object sender, Windows.UI.Xaml.Input.KeyRoutedEventArgs e)
        {
            if (e.Key == VirtualKey.Enter) { e.Handled = true; FinishTextEntry(true); }
            else if (e.Key == VirtualKey.Escape) { e.Handled = true; FinishTextEntry(false); }
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
            if (keyboardVisible) { if (buttons.HasFlag(GamepadButtons.B) && !previous.HasFlag(GamepadButtons.B)) InputPane.GetForCurrentView().TryHide(); previous = buttons; return; }
            if (editingText) { previous = buttons; return; }
            var now = DateTime.UtcNow;
            if (now >= scrollAt && Math.Abs(reading.RightThumbstickY) > .55) { Command(reading.RightThumbstickY > 0 ? "scrollup" : "scrolldown"); scrollAt = now.AddMilliseconds(160); }
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
