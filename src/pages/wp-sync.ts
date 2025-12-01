// src/pages/wp-sync.ts
import type { APIContext } from 'astro';
import { exec } from 'node:child_process';

export async function POST({ request }: APIContext) {
  console.log("[wp-sync] webhook triggered");

  // Run sync:flex script
  exec("npm run sync:flex", (err, stdout, stderr) => {
    if (err) {
      console.error("[wp-sync] error running sync:flex:", err);
      return;
    }
    console.log("[wp-sync] sync:flex complete");
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  });

  return new Response("OK", { status: 200 });
}
