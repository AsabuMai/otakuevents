const notebookStorageKey = "eventnote-japan-notebook";

export function loadNotebook() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(notebookStorageKey) || "{}");
    if (!saved || typeof saved !== "object") return {};
    return saved;
  } catch (error) {
    console.error(error);
    return {};
  }
}

export function saveNotebook({ budget, memo }) {
  const savedAt = new Date().toISOString();
  window.localStorage.setItem(notebookStorageKey, JSON.stringify({
    budget,
    memo,
    savedAt
  }));
  return savedAt;
}
