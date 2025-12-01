import http from "http";
import { execSync } from "child_process";

/**
 * Only run webhook server locally.
 * This ensures Netlify does NOT run it.
 */
if (process.env.NETLIFY) {
  console.log("Webhook server disabled on Netlify.");
  process.exit(0);
}

const PORT = 4321;

const server = http.createServer((req, res) => {
  if (req.url === "/__wp-sync" && req.method === "POST") {
    console.log("🔔 WordPress → Local machine: Page updated");
    
    try {
      execSync("npm run sync:flex", { stdio: "inherit" });
      console.log("✅ Local sync complete");
    } catch (err) {
      console.log("❌ Sync failed:", err.message);
    }

    res.writeHead(200);
    res.end("OK");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`🌐 Local webhook server ready → http://localhost:${PORT}/__wp-sync`);
});
