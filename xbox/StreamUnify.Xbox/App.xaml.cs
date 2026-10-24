using Windows.ApplicationModel.Activation;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
namespace StreamUnify.Xbox {
    sealed partial class App : Application {
        public App() { InitializeComponent(); RequiresPointerMode = ApplicationRequiresPointerMode.WhenRequested; }
        protected override void OnLaunched(LaunchActivatedEventArgs args) {
            var frame = Window.Current.Content as Frame;
            if (frame == null) { frame = new Frame(); Window.Current.Content = frame; }
            if (frame.Content == null) frame.Navigate(typeof(MainPage));
            Window.Current.Activate();
        }
    }
}
