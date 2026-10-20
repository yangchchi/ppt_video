import fs from "node:fs/promises";
import { host, jobsDir, port } from "./config.js";
import { loadJobs } from "./jobs.js";
import { createApp } from "./server.js";

await fs.mkdir(jobsDir, { recursive: true });
await loadJobs();
const app = createApp();
app.listen(port, host, () => {
  console.log(`幻演 MotionDeck 已启动：http://${host}:${port}`);
});
