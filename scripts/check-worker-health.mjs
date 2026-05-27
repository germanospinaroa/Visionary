const baseUrl = process.env.PILOT_WORKER_API_BASE_URL || "http://127.0.0.1:4001";

const response = await fetch(`${baseUrl}/health`, {
  headers: {
    accept: "application/json"
  }
});

const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error("Worker healthcheck failed.");
  console.error(payload);
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));
