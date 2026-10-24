using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Windows.Data.Json;

namespace StreamUnify.Xbox {
 public sealed class Title {
  public JsonObject Raw { get; set; }
  public string Name { get { return Raw.GetNamedString("name", "Untitled"); } }
  public string Poster { get { return Raw.GetNamedString("poster", ""); } }
  public string Summary { get { return Raw.GetNamedString("year", "") + " · " + Raw.GetNamedString("type", ""); } }
  public string Description { get { return Raw.GetNamedString("desc", ""); } }
  public string Providers { get { return string.Join(", ", Raw.GetNamedArray("providers", new JsonArray()).Select(p => p.GetObject().GetNamedString("name", ""))); } }
  public Uri WatchUri { get {
   var providers = Raw.GetNamedArray("providers", new JsonArray());
   foreach (var p in providers) { var uri = Https(p.GetObject().GetNamedString("url", "")); if (uri != null) return uri; }
   return Https(Raw.GetNamedString("watchUrl", ""));
  } }
  public static Uri Https(string value) { Uri uri; return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == "https" && string.IsNullOrEmpty(uri.UserInfo) ? uri : null; }
 }
 public sealed class CatalogClient {
  const string Origin = "https://www.streamunify.com";
  readonly HttpClient http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(20) };
  string token, refreshToken, authOrigin, publicKey;
  DateTimeOffset expires = DateTimeOffset.MinValue;
  bool accountsEnabled;
  public bool SignedIn { get { return !string.IsNullOrEmpty(token); } }
  public void ClearSession() { token = null; refreshToken = null; expires = DateTimeOffset.MinValue; }
  async Task<JsonObject> Send(string url, HttpMethod method, JsonObject body = null, bool authenticated = false, string searchId = null, string apiKey = null) {
   using (var req = new HttpRequestMessage(method, url)) {
    if (authenticated) { if (!SignedIn) throw new InvalidOperationException("Sign in with a verified StreamUnify account first."); await Refresh(); req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token); }
    if (searchId != null) req.Headers.Add("X-Search-Id", searchId);
    if (apiKey != null) req.Headers.Add("apikey", apiKey);
    if (body != null) req.Content = new StringContent(body.Stringify(), Encoding.UTF8, "application/json");
    using (var res = await http.SendAsync(req)) {
     JsonObject data; if (!JsonObject.TryParse(await res.Content.ReadAsStringAsync(), out data)) throw new InvalidOperationException("Service returned an unexpected response. Please retry.");
     if (!res.IsSuccessStatusCode) {
      if (res.StatusCode == HttpStatusCode.Unauthorized && authenticated) ClearSession();
      throw new InvalidOperationException(data.GetNamedString("error_description", data.GetNamedString("msg", data.GetNamedString("error", "Request failed. Please try again."))));
     }
     return data;
    }
   }
  }
  public async Task Configure() {
   var c = await Send(Origin + "/api/account/config", HttpMethod.Get);
   accountsEnabled = c.GetNamedBoolean("enabled", false);
   var uri = Title.Https(c.GetNamedString("supabaseUrl", ""));
   if (uri != null && uri.Host.EndsWith(".supabase.co", StringComparison.OrdinalIgnoreCase) && uri.AbsolutePath == "/") authOrigin = uri.GetLeftPart(UriPartial.Authority);
   publicKey = c.GetNamedString("publishableKey", "");
  }
  void StoreSession(JsonObject response) {
   token = response.GetNamedString("access_token", ""); refreshToken = response.GetNamedString("refresh_token", "");
   expires = DateTimeOffset.UtcNow.AddSeconds(response.GetNamedNumber("expires_in", 3600));
   if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(refreshToken)) { ClearSession(); throw new InvalidOperationException("Sign-in could not be completed."); }
  }
  async Task Refresh() {
   if (expires > DateTimeOffset.UtcNow.AddSeconds(60)) return;
   try { StoreSession(await Send(authOrigin + "/auth/v1/token?grant_type=refresh_token", HttpMethod.Post, new JsonObject { ["refresh_token"] = JsonValue.CreateStringValue(refreshToken) }, apiKey: publicKey)); }
   catch { ClearSession(); throw new InvalidOperationException("Session expired. Please sign in again."); }
  }
  public async Task SignIn(string email, string password) {
   if (!accountsEnabled || authOrigin == null || !publicKey.StartsWith("sb_publishable_", StringComparison.Ordinal)) throw new InvalidOperationException("Account sign-in is temporarily unavailable.");
   ClearSession();
   StoreSession(await Send(authOrigin + "/auth/v1/token?grant_type=password", HttpMethod.Post, new JsonObject { ["email"] = JsonValue.CreateStringValue(email.Trim()), ["password"] = JsonValue.CreateStringValue(password) }, apiKey: publicKey));
   try { await Account(); } catch { ClearSession(); throw; }
  }
  public async Task SignOut() {
   try { if (SignedIn) await Send(authOrigin + "/auth/v1/logout?scope=local", HttpMethod.Post, new JsonObject(), authenticated: true, apiKey: publicKey); }
   finally { ClearSession(); }
  }
  public Task<JsonObject> Account() { return Send(Origin + "/api/account", HttpMethod.Get, authenticated: true); }
  public async Task<List<Title>> Catalog(string query) {
   var searching = !string.IsNullOrWhiteSpace(query);
   var path = searching ? "/api/search?q=" + Uri.EscapeDataString(query.Trim()) + "&country=US" : "/api/trending?country=US";
   var data = await Send(Origin + path, HttpMethod.Get, authenticated: searching || SignedIn, searchId: searching ? Guid.NewGuid().ToString() : null);
   return data.GetNamedArray("results", new JsonArray()).Select(v => new Title { Raw = v.GetObject() }).ToList();
  }
  public async Task<List<Title>> Watchlist() {
   var data = await Send(Origin + "/api/watchlist", HttpMethod.Get, authenticated: true);
   return data.GetNamedArray("items", new JsonArray()).Select(v => new Title { Raw = v.GetObject().GetNamedObject("snapshot") }).ToList();
  }
  public Task<JsonObject> Save(Title title) { return Send(Origin + "/api/watchlist", HttpMethod.Post, title.Raw, authenticated: true); }
 }
}
