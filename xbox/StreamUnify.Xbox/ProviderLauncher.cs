using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace StreamUnify.Xbox
{
    // Kept independent of WinRT so the actual native routing policy is testable.
    public interface IProviderApps
    {
        Task<IReadOnlyList<string>> FindAsync(Uri uri, CancellationToken token);
        Task<bool> SupportsAsync(Uri uri, string family, CancellationToken token);
        Task<bool> LaunchAsync(Uri uri, string family, CancellationToken token);
    }
    public sealed class ProviderLauncher
    {
        readonly HashSet<string> hosts;
        int busy;
        public ProviderLauncher(IEnumerable<string> allowedHosts) { hosts = new HashSet<string>(allowedHosts, StringComparer.OrdinalIgnoreCase); }
        public Uri Validate(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length > 4096 || value.Any(c => char.IsWhiteSpace(c) || c == '\\')) return null;
            Uri uri;
            if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || uri.Scheme != "https" || uri.Port != 443 || uri.UserInfo.Length != 0) return null;
            return hosts.Any(host => uri.IdnHost.Equals(host, StringComparison.OrdinalIgnoreCase) || uri.IdnHost.EndsWith("." + host, StringComparison.OrdinalIgnoreCase)) ? uri : null;
        }
        public async Task<string> OpenAsync(string value, IProviderApps apps, CancellationToken token)
        {
            var uri = Validate(value);
            if (uri == null) return "invalid";
            if (Interlocked.Exchange(ref busy, 1) != 0) return "busy";
            try
            {
                token.ThrowIfCancellationRequested();
                var candidates = await apps.FindAsync(uri, token);
                var available = new List<string>();
                foreach (var family in candidates.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct())
                {
                    token.ThrowIfCancellationRequested();
                    if (await apps.SupportsAsync(uri, family, token)) available.Add(family);
                }
                token.ThrowIfCancellationRequested();
                if (available.Count == 0) return "unavailable";
                // Never choose an arbitrary app or fall back to a web browser.
                if (available.Count != 1) return "ambiguous";
                return await apps.LaunchAsync(uri, available[0], token) ? "launched" : "failed";
            }
            catch (OperationCanceledException) { return "cancelled"; }
            catch { return "failed"; }
            finally { Interlocked.Exchange(ref busy, 0); }
        }
    }
}
