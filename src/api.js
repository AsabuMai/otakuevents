export async function getJson(path) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  const separator = path.includes("?") ? "&" : "?";
  const url = `${path}${separator}_=${Date.now()}`;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}
