export function getMinimalWorkerBaseUrl() {
  const candidates = [
    process.env.MINIMAL_WORKER_BASE_URL,
    process.env.PILOT_MINIMAL_WORKER_API_BASE_URL
  ];

  const value = candidates
    .map((item) => item?.trim())
    .find((item) => item && item !== "null" && item !== "undefined");

  return value?.replace(/\/+$/g, "") ?? "";
}
