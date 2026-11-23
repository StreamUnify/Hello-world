using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using StreamUnify.Xbox;

public static class ProviderLauncherTests
{
    sealed class Apps : IProviderApps
    {
        public string[] Families = new[] { "Netflix_test" };
        public bool Supported = true, Launched = true, Throw;
        public int Finds, Launches;
        public string Target, Url;
        public TaskCompletionSource<IReadOnlyList<string>> Gate;
        public Task<IReadOnlyList<string>> FindAsync(Uri uri, CancellationToken token)
        {
            Finds++;
            if (Throw) throw new NotSupportedException();
            return Gate == null ? Task.FromResult<IReadOnlyList<string>>(Families) : Gate.Task;
        }
        public Task<bool> SupportsAsync(Uri uri, string family, CancellationToken token) { return Task.FromResult(Supported); }
        public Task<bool> LaunchAsync(Uri uri, string family, CancellationToken token) { Launches++; Target = family; Url = uri.AbsoluteUri; return Task.FromResult(Launched); }
    }
    static void Check(bool condition, string name) { if (!condition) throw new Exception(name); }
    public static void Run() { RunAsync().GetAwaiter().GetResult(); }
    static async Task RunAsync()
    {
        var policy = new ProviderLauncher(new[] { "netflix.com", "tv.apple.com" });
        const string url = "https://www.netflix.com/title/180?country=US";
        foreach (var bad in new[] { "http://netflix.com/title/1", "netflix://title/1", "https://netflix.com.evil.test/", "https://evilnetflix.com/", "https://user:password@netflix.com/", "https://netflix.com:444/", "https://netflix.com./", "https://netflix.com\\@evil.test/", " https://netflix.com/", "https://apple.com/", "https://netflіx.com/", "https://netflix.com/\n" })
        {
            var invalid = new Apps();
            Check(await policy.OpenAsync(bad, invalid, CancellationToken.None) == "invalid" && invalid.Finds == 0, "Reject " + bad);
        }
        Check(policy.Validate("https://TV.APPLE.COM/movie/1") != null, "Case normalization");
        var apps = new Apps();
        Check(await policy.OpenAsync(url, apps, CancellationToken.None) == "launched", "Launch succeeds");
        Check(apps.Launches == 1 && apps.Target == "Netflix_test" && apps.Url == url, "Exact title URL and discovered package only");
        apps = new Apps { Families = new string[0] };
        Check(await policy.OpenAsync(url, apps, CancellationToken.None) == "unavailable" && apps.Launches == 0, "Missing app never opens browser");
        apps = new Apps { Supported = false };
        Check(await policy.OpenAsync(url, apps, CancellationToken.None) == "unavailable" && apps.Launches == 0, "Unsupported title link");
        apps = new Apps { Families = new[] { "A", "B" } };
        Check(await policy.OpenAsync(url, apps, CancellationToken.None) == "ambiguous" && apps.Launches == 0, "No arbitrary app selection");
        apps = new Apps { Families = new[] { "A", "A", "" } };
        Check(await policy.OpenAsync(url, apps, CancellationToken.None) == "launched" && apps.Launches == 1, "Deduplicated app");
        apps = new Apps { Throw = true };
        Check(await policy.OpenAsync(url, apps, CancellationToken.None) == "failed", "Unsupported Xbox API handled");
        apps = new Apps { Launched = false };
        Check(await policy.OpenAsync(url, apps, CancellationToken.None) == "failed", "Launch refusal handled");
        using (var cancel = new CancellationTokenSource())
        {
            cancel.Cancel(); apps = new Apps();
            Check(await policy.OpenAsync(url, apps, cancel.Token) == "cancelled" && apps.Finds == 0, "Cancelled before discovery");
        }
        using (var cancel = new CancellationTokenSource())
        {
            apps = new Apps { Gate = new TaskCompletionSource<IReadOnlyList<string>>() };
            var first = policy.OpenAsync(url, apps, cancel.Token);
            Check(await policy.OpenAsync(url, apps, CancellationToken.None) == "busy" && apps.Finds == 1, "Double press cannot launch twice");
            cancel.Cancel(); apps.Gate.SetResult(new[] { "Netflix_test" });
            Check(await first == "cancelled" && apps.Launches == 0, "Cancellation during discovery prevents delayed launch");
        }
        Check(await policy.OpenAsync(url, new Apps(), CancellationToken.None) == "launched", "Cancellation releases the lock");
        Console.WriteLine("Provider native routing tests passed");
    }
}
