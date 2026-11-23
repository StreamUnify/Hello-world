import { Resolver } from "node:dns/promises";
import { createServer } from "node:http";
import { request } from "node:https";
import { BlockList } from "node:net";

const allowedOrigins = new Set([
  "https://hoosiervalleywebworks.com",
  "https://www.hoosiervalleywebworks.com",
  "https://hoosiervalleywebworks.onrender.com",
]);
const resolver = new Resolver({ timeout: 2000, tries: 1 });
const reserved = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
]) {
  reserved.addSubnet(address, prefix);
}

const checks = [
  ["Strict Transport Security", (headers) => /(?:^|;)\s*max-age\s*=\s*[1-9]\d*/i.test(headers["strict-transport-security"] ?? ""), "Enable HTTP Strict Transport Security once HTTPS is working across the site."],
  ["Content Security Policy", (headers) => /(?:^|;)\s*(?:default-src|script-src(?:-elem)?)\s+\S/i.test(headers["content-security-policy"] ?? ""), "Set an enforced Content Security Policy appropriate for your site."],
  ["Frame protection", (headers) => /^(?:deny|sameorigin)$/i.test(headers["x-frame-options"] ?? "") || /(?:^|;)\s*frame-ancestors\s+\S/i.test(headers["content-security-policy"] ?? ""), "Limit which sites can embed your pages with a frame-ancestors policy."],
  ["Content type protection", (headers) => /^nosniff$/i.test(headers["x-content-type-options"] ?? ""), "Enable X-Content-Type-Options: nosniff."],
];

async function inspect(host) {
  const addresses = await resolver.resolve4(host);
  if (!addresses.length || addresses.some((address) => reserved.check(address))) {
    throw new Error("Not a public destination");
  }
  // Pin the connection to the validated address while verifying TLS for the public hostname.
  const response = await new Promise((resolve, reject) => {
    const req = request({
      hostname: host, servername: host, port: 443, path: "/", method: "HEAD",
      family: 4, autoSelectFamily: false, agent: false, maxHeaderSize: 8192,
      lookup: (_host, _options, callback) => callback(null, addresses[0], 4),
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Hoosier Valley Webworks Public Header Check" },
    }, (res) => {
      res.destroy();
      resolve(res);
    });
    req.on("error", reject);
    req.end();
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error("The homepage did not return a successful response");
  }
  const results = checks.map(([name, passes, recommendation]) => ({
    name, passed: passes(response.headers), recommendation,
  }));
  const passed = results.filter((check) => check.passed).length;
  return { host, grade: ["F", "D", "C", "B", "A"][passed], passed, total: checks.length,
    fixes: results.filter((check) => !check.passed).slice(0, 3).map((check) => check.recommendation) };
}

let active = 0;
let attempts = [];
const cache = new Map();
const hostPattern = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i;

createServer((req, res) => {
  const send = (status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(payload));
  };
  if (req.url === "/health" && req.method === "GET") return send(200, { ok: true });
  const origin = req.headers.origin;
  if (!allowedOrigins.has(origin)) return send(403, { error: "Open the review from the Webworks site." });
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");

  if (req.method !== "GET" || !req.url.startsWith("/grade?")) return send(404, { error: "Page unavailable." });
  const url = new URL("http://localhost" + req.url);
  const host = (url.searchParams.get("host") ?? "").toLowerCase();
  if (!hostPattern.test(host)) return send(400, { error: "Enter a public website address, such as example.com." });

  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
  const existing = cache.get(host);
  if (existing) return send(existing.status, existing.payload);
  attempts = attempts.filter((time) => now - time < 60000);
  if (active >= 4 || attempts.length >= 20) return send(429, { error: "The review is busy. Try again in a minute." });

  active += 1;
  attempts.push(now);
  inspect(host).then(
    (result) => ({ status: 200, payload: result }),
    () => ({ status: 422, payload: { error: "Couldn’t read the public HTTPS homepage. Try its final address, including www if it uses it." } }),
  ).then(({ status, payload }) => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(host, { status, payload, expires: now + 120000 });
    send(status, payload);
  }).finally(() => { active -= 1; });
}).listen(Number(process.env.PORT || 10000), "0.0.0.0");
