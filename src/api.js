export async function getJson(path) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  const separator = path.includes("?") ? "&" : "?";
  const url = `${path}${separator}_=${Date.now()}`;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function postJson(path, payload = {}) {
  return writeJson("POST", path, payload);
}

export async function deleteJson(path, payload = {}) {
  return writeJson("DELETE", path, payload);
}

async function writeJson(method, path, payload = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    credentials: "same-origin"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `Request failed: ${path}`);
  return data;
}
