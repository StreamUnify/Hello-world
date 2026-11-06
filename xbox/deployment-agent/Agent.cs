using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Xml;
using Microsoft.Win32;

// A narrow installer: it accepts only reviewed StreamUnify MSIX releases.
// It does not expose a server, execute downloaded PC code, or upload credentials.
public class Settings { public string Origin; public string User; public string Password; public string Pin; public string Completed; }
public class PackageFile { public string name; public string sha256; }
public class Deployment { public string version; public string package; public PackageFile[] files; }
public static class Agent {
    public const string Repo = "StreamUnify/Hello-world";
    public static readonly string Folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StreamUnifyXboxAgent");
    public static readonly string Config = Path.Combine(Folder, "settings.dat");
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 2097152 };
    public static string Hash(byte[] bytes) { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
    public static string Origin(string value) {
        Uri u; IPAddress ip;
        if (!Uri.TryCreate(value, UriKind.Absolute, out u) || u.Scheme != "https" || u.UserInfo != "" || u.AbsolutePath != "/" || u.Query != "" || u.Fragment != "" || !IPAddress.TryParse(u.Host, out ip)) throw new Exception("Enter the HTTPS address shown in Xbox Dev Home, for example https://192.168.1.20:11443.");
        var b = ip.GetAddressBytes();
        if (b.Length != 4 || !(b[0] == 10 || b[0] == 192 && b[1] == 168 || b[0] == 172 && b[1] >= 16 && b[1] <= 31)) throw new Exception("The console must have a private local-network IPv4 address.");
        return u.GetLeftPart(UriPartial.Authority);
    }
    public static void Save(Settings settings) {
        Directory.CreateDirectory(Folder);
        byte[] data = Encoding.UTF8.GetBytes(Json.Serialize(settings));
        try { File.WriteAllBytes(Config, ProtectedData.Protect(data, null, DataProtectionScope.CurrentUser)); } finally { Array.Clear(data, 0, data.Length); }
    }
    public static Settings Load() { return Json.Deserialize<Settings>(Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(Config), null, DataProtectionScope.CurrentUser))); }
    public static T Parse<T>(string text) { return Json.Deserialize<T>(text); }
    static HttpWebRequest Request(string url) {
        var r = (HttpWebRequest)WebRequest.Create(url); r.UserAgent = "StreamUnify-Xbox-Agent/1.0";
        r.Timeout = 30000; r.ReadWriteTimeout = 30000; r.AllowAutoRedirect = false; r.KeepAlive = false; return r;
    }
    public static string InspectCertificate(string origin) {
        string pin = null; var r = Request(Origin(origin)); r.Proxy = null;
        // Capture the certificate without accepting it or sending credentials.
        r.ServerCertificateValidationCallback = (sender, cert, chain, errors) => { if (cert != null) pin = Hash(cert.GetRawCertData()); return false; };
        try { using (r.GetResponse()) {} } catch (WebException) { if (pin == null) throw new Exception("Cannot reach the Xbox. Check Dev Mode, its address, and Wi-Fi."); }
        return pin;
    }
    static HttpWebRequest ConsoleRequest(Settings s, string path) {
        var r = Request(Origin(s.Origin) + path); r.Proxy = null;
        r.ServerCertificateValidationCallback = (sender, cert, chain, errors) => cert != null && Hash(cert.GetRawCertData()) == s.Pin;
        r.Headers[HttpRequestHeader.Authorization] = "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes(s.User + ":" + s.Password));
        return r;
    }
    public static string ConsoleGet(Settings s, string path) {
        using (var response = (HttpWebResponse)ConsoleRequest(s, path).GetResponse())
        using (var reader = new StreamReader(response.GetResponseStream())) return reader.ReadToEnd();
    }
    public static byte[] Download(string url, int limit) {
        var uri = new Uri(url);
        for (int i = 0; i < 5; i++) {
            if (uri.Scheme != "https" || uri.UserInfo != "" || !(uri.Host == "api.github.com" || uri.Host == "github.com" || uri.Host == "release-assets.githubusercontent.com" || uri.Host == "objects.githubusercontent.com")) throw new Exception("Untrusted download destination.");
            using (var response = (HttpWebResponse)Request(uri.AbsoluteUri).GetResponse()) {
                int status = (int)response.StatusCode;
                if (status >= 300 && status < 400) { uri = new Uri(uri, response.Headers["Location"]); continue; }
                if (response.ContentLength > limit) throw new Exception("Download exceeds the size limit.");
                using (var input = response.GetResponseStream()) using (var output = new MemoryStream()) {
                    byte[] buffer = new byte[65536]; int count;
                    while ((count = input.Read(buffer, 0, buffer.Length)) > 0) { if (output.Length + count > limit) throw new Exception("Download exceeds the size limit."); output.Write(buffer, 0, count); }
                    return output.ToArray();
                }
            }
        }
        throw new Exception("Too many download redirects.");
    }
    public static void Validate(Deployment d) {
        Version version;
        if (d == null || !Version.TryParse(d.version, out version) || version.Build < 0 || version.Revision < 0 || d.files == null || d.files.Length < 1 || d.files.Length > 12) throw new Exception("Invalid deployment manifest.");
        if (!Regex.IsMatch(d.package ?? "", @"^StreamUnify\.Xbox_[0-9.]+_x64_Debug\.msix$")) throw new Exception("Unexpected app package.");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var f in d.files) {
            if (f == null || !Regex.IsMatch(f.name ?? "", @"^[A-Za-z0-9_.-]+\.(msix|appx)$") || !Regex.IsMatch(f.sha256 ?? "", "^[a-f0-9]{64}$") || !names.Add(f.name)) throw new Exception("Invalid deployment file.");
            if (f.name != d.package && !(f.name.StartsWith("Microsoft.", StringComparison.Ordinal) && f.name.EndsWith(".appx", StringComparison.Ordinal))) throw new Exception("Unexpected dependency.");
        }
        if (!names.Contains(d.package)) throw new Exception("App package missing.");
    }
    public static void VerifyPackage(string path, string version) {
        using (var zip = ZipFile.OpenRead(path)) {
            var manifest = zip.GetEntry("AppxManifest.xml");
            if (manifest == null || zip.GetEntry("AppxSignature.p7x") == null) throw new Exception("Package is not signed.");
            var xml = new XmlDocument { XmlResolver = null };
            using (var input = manifest.Open()) using (var reader = XmlReader.Create(input, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null })) xml.Load(reader);
            var identity = xml.SelectSingleNode("/*[local-name()='Package']/*[local-name()='Identity']");
            if (identity == null || identity.Attributes["Name"].Value != "StreamUnify.Xbox.Development" || identity.Attributes["Publisher"].Value != "CN=StreamUnifyDevelopment" || identity.Attributes["Version"].Value != version || identity.Attributes["ProcessorArchitecture"].Value != "x64") throw new Exception("Package identity does not match StreamUnify Xbox.");
        }
    }
    static Dictionary<string, object> Installed(Settings s) { return Parse<Dictionary<string, object>>(ConsoleGet(s, "/api/app/packagemanager/packages")); }
    static string InstalledVersion(Settings s) {
        var packages = (System.Collections.IEnumerable)Installed(s)["InstalledPackages"];
        foreach (Dictionary<string, object> p in packages) {
            object full; if (p.TryGetValue("PackageFullName", out full) && ((string)full).StartsWith("StreamUnify.Xbox.Development_", StringComparison.Ordinal)) return ((string)full).Split('_')[1];
        }
        return "0.0.0.0";
    }
    public static void CheckConnection(Settings s) { Installed(s); }
    static void Install(Settings s, Deployment d, string dir) {
        string boundary = "----StreamUnify" + Guid.NewGuid().ToString("N");
        string bodyPath = Path.Combine(dir, "upload.bin");
        using (var body = File.Create(bodyPath)) {
            foreach (var f in d.files) {
                byte[] header = Encoding.ASCII.GetBytes("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + f.name + "\"; filename=\"" + f.name + "\"\r\nContent-Type: application/octet-stream\r\n\r\n");
                body.Write(header, 0, header.Length); using (var file = File.OpenRead(Path.Combine(dir, f.name))) file.CopyTo(body);
                body.WriteByte(13); body.WriteByte(10);
            }
            byte[] end = Encoding.ASCII.GetBytes("--" + boundary + "--\r\n"); body.Write(end, 0, end.Length);
        }
        var r = ConsoleRequest(s, "/api/app/packagemanager/package?package=" + Uri.EscapeDataString(d.package));
        r.Method = "POST"; r.Timeout = 300000; r.ReadWriteTimeout = 300000; r.AllowWriteStreamBuffering = false;
        r.ContentType = "multipart/form-data; boundary=" + boundary; r.ContentLength = new FileInfo(bodyPath).Length;
        using (var output = r.GetRequestStream()) using (var input = File.OpenRead(bodyPath)) input.CopyTo(output);
        using (r.GetResponse()) {}
        var deadline = DateTime.UtcNow.AddMinutes(5);
        while (DateTime.UtcNow < deadline) {
            if (InstalledVersion(s) == d.version) return;
            // Polling installed packages verifies the resulting version, rather than
            // treating acceptance of the upload as successful installation.
            Thread.Sleep(3000);
        }
        throw new Exception("The Xbox has not confirmed installation. Check Device Portal; the agent will retry on the next check.");
    }
    public static string Check(Settings s) {
        var releases = Parse<List<Dictionary<string, object>>>(Encoding.UTF8.GetString(Download("https://api.github.com/repos/" + Repo + "/releases?per_page=30", 2097152)));
        var release = releases.FirstOrDefault(r => ((string)r["tag_name"]).StartsWith("xbox-device-", StringComparison.Ordinal) && !(bool)r["draft"]);
        if (release == null) return "Connected. Waiting for an approved Xbox update.";
        string tag = (string)release["tag_name"];
        if (!Regex.IsMatch(tag, "^xbox-device-[0-9]+$")) throw new Exception("Invalid release tag.");
        if (s.Completed == tag) return "Connected. The last approved update is installed.";
        string prefix = "https://github.com/" + Repo + "/releases/download/" + tag + "/";
        var d = Parse<Deployment>(Encoding.UTF8.GetString(Download(prefix + "deployment.json", 65536))); Validate(d);
        string current = InstalledVersion(s);
        if (new Version(current) >= new Version(d.version)) { s.Completed = tag; Save(s); return "Xbox already has version " + current + "."; }
        string dir = Path.Combine(Folder, "download"); Directory.CreateDirectory(dir);
        try {
            foreach (var f in d.files) {
                byte[] bytes = Download(prefix + Uri.EscapeDataString(f.name), 134217728);
                if (Hash(bytes) != f.sha256) throw new Exception("Package integrity check failed.");
                File.WriteAllBytes(Path.Combine(dir, f.name), bytes);
            }
            VerifyPackage(Path.Combine(dir, d.package), d.version); Install(s, d, dir);
            s.Completed = tag; Save(s); return "Installed and verified Xbox version " + d.version + ".";
        } finally { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
    }
    public static void InstallAgent(Settings s, bool startup) {
        Save(s); string destination = Path.Combine(Folder, "StreamUnifyXboxAgent.exe");
        if (!String.Equals(Application.ExecutablePath, destination, StringComparison.OrdinalIgnoreCase)) File.Copy(Application.ExecutablePath, destination, true);
        using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")) {
            if (startup) key.SetValue("StreamUnifyXboxAgent", "\"" + destination + "\""); else key.DeleteValue("StreamUnifyXboxAgent", false);
        }
    }
    [STAThread] public static int Main(string[] args) {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        if (args.Contains("--self-test")) { try { SelfTest(); return 0; } catch { return 1; } }
        bool created; using (var mutex = new Mutex(true, "Local\\StreamUnifyXboxAgent", out created)) {
            if (!created) { MessageBox.Show("The agent is already running. Open it from the system tray."); return 0; }
            Application.EnableVisualStyles(); Application.Run(new AgentWindow());
        }
        return 0;
    }
    static void SelfTest() {
        if (Origin("https://10.0.0.162:11443") != "https://10.0.0.162:11443") throw new Exception();
        foreach (var u in new[] {"http://10.0.0.162", "https://user:pass@10.0.0.162", "https://8.8.8.8", "https://10.0.0.162/a", "https://10.0.0.162/?secret=1"}) { bool rejected = false; try { Origin(u); } catch { rejected = true; } if (!rejected) throw new Exception(); }
        var d = new Deployment {version="0.2.1.0",package="StreamUnify.Xbox_0.2.1.0_x64_Debug.msix",files=new[] {new PackageFile {name="StreamUnify.Xbox_0.2.1.0_x64_Debug.msix",sha256=new string('a',64)}}}; Validate(d);
        foreach(var name in new[]{"../evil.msix","Other.msix","evil.exe"}) { d.files[0].name=name;bool rejected=false;try{Validate(d);}catch{rejected=true;}if(!rejected)throw new Exception(); }
        byte[] sample=Encoding.UTF8.GetBytes("test-only");if(!sample.SequenceEqual(ProtectedData.Unprotect(ProtectedData.Protect(sample,null,DataProtectionScope.CurrentUser),null,DataProtectionScope.CurrentUser)))throw new Exception();
    }
}
public class AgentWindow : Form {
    TextBox address = new TextBox(), username = new TextBox(), password = new TextBox {UseSystemPasswordChar=true};
    Label status = new Label {AutoSize=false,Height=100,Dock=DockStyle.Bottom};
    Button connect = new Button {Text="Install and connect",AutoSize=true}, check = new Button {Text="Check for approved update",AutoSize=true,Enabled=false};
    CheckBox startup = new CheckBox {Text="Start automatically when I sign into Windows",Checked=true,AutoSize=true};
    System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer {Interval=90000};
    NotifyIcon tray = new NotifyIcon {Icon=SystemIcons.Application,Text="StreamUnify Xbox agent",Visible=true};
    Settings settings; bool busy, exiting;
    public AgentWindow() {
        Text="StreamUnify Xbox deployment agent";Width=650;Height=500;StartPosition=FormStartPosition.CenterScreen;
        var panel=new FlowLayoutPanel {Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,Padding=new Padding(20),AutoScroll=true}; Controls.Add(panel);Controls.Add(status);
        panel.Controls.Add(new Label {Text="One-time setup. Use your Xbox Device Portal credentials.",AutoSize=true});
        foreach(var entry in new[]{Tuple.Create("Xbox HTTPS address",address),Tuple.Create("Device Portal username",username),Tuple.Create("Device Portal password",password)}) {panel.Controls.Add(new Label{Text=entry.Item1,AutoSize=true});entry.Item2.Width=560;panel.Controls.Add(entry.Item2);}
        panel.Controls.Add(startup);panel.Controls.Add(connect);panel.Controls.Add(check);
        var quit=new Button{Text="Exit agent",AutoSize=true};panel.Controls.Add(quit);quit.Click+=(s,e)=>{exiting=true;Close();};
        tray.DoubleClick+=(s,e)=>{Show();WindowState=FormWindowState.Normal;Activate();};
        FormClosing+=(s,e)=>{if(!exiting&&settings!=null){e.Cancel=true;Hide();tray.ShowBalloonTip(3000,"StreamUnify","Agent is running. Keep the PC awake and Xbox in Dev Mode.",ToolTipIcon.Info);}else tray.Dispose();};
        timer.Tick+=async(s,e)=>await Check();check.Click+=async(s,e)=>await Check();connect.Click+=async(s,e)=>await Connect();
        if(File.Exists(Agent.Config)){try{settings=Agent.Load();address.Text=settings.Origin;username.Text=settings.User;check.Enabled=true;status.Text="Agent is installed. Checking for approved updates...";timer.Start();Shown+=async(s,e)=>await Check();}catch{status.Text="Saved settings could not be opened. Connect again.";}}
    }
    async Task Connect() {
        if(busy)return;busy=true;connect.Enabled=false;timer.Stop();
        try {
            var next=new Settings{Origin=Agent.Origin(address.Text.Trim()),User=username.Text,Password=password.Text};
            if(String.IsNullOrWhiteSpace(next.User)||String.IsNullOrEmpty(next.Password)||next.User.Contains(":"))throw new Exception("Enter the Device Portal username and password.");
            status.Text="Checking the Xbox certificate...";next.Pin=await Task.Run(()=>Agent.InspectCertificate(next.Origin));
            if(MessageBox.Show("Trust this Xbox at "+next.Origin+"?\n\nCertificate SHA-256:\n"+next.Pin+"\n\nOnly this certificate will be accepted. Confirm this is your console on your home network.","Connect to your Xbox",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
            status.Text="Testing your Xbox connection...";await Task.Run(()=>Agent.CheckConnection(next));
            Agent.InstallAgent(next,startup.Checked);settings=next;password.Clear();check.Enabled=true;timer.Start();status.Text="Installed and connected. Waiting for an approved update. Keep this PC awake and the Xbox in Dev Mode.";
        } catch(Exception e){status.Text="Setup incomplete: "+SafeMessage(e);} finally{busy=false;connect.Enabled=true;if(settings!=null)timer.Start();}
    }
    async Task Check(){if(busy||settings==null)return;busy=true;check.Enabled=false;connect.Enabled=false;status.Text="Checking approved releases and the Xbox...";try{status.Text=await Task.Run(()=>Agent.Check(settings));}catch(Exception e){status.Text="Update not confirmed: "+SafeMessage(e);}finally{busy=false;check.Enabled=true;connect.Enabled=true;}}
    static string SafeMessage(Exception e){if(e is WebException)return "Network, certificate, or sign-in check failed. Ensure the Xbox is awake in Dev Mode; reconnect if its address or certificate changed.";return e.Message;}
}
