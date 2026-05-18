export const defaultCityOptions = [
  ["all", "全部地区"],
  ["unknown", "未标注"]
];

export const typeOptions = [
  ["all", "全部类型"],
  ["event", "活动"],
  ["live", "Live"],
  ["fan", "Fan Event"],
  ["talk", "Talk"],
  ["release", "发售纪念"],
  ["stage", "Anime Stage"],
  ["theater", "舞台/音乐剧"],
  ["screening", "上映会"],
  ["radio", "公开收录"]
];

export function routePageFromHash(hash = window.location.hash) {
  return hash.replace("#/", "").split("/")[0] || "home";
}

export function routeParamFromHash(hash = window.location.hash) {
  return decodeURIComponent(hash.replace("#/", "").split("/")[1] || "");
}

export function normalizeVenueName(value) {
  return String(value || "").replace(/^!_*/, "").trim();
}

export function isConcreteVenueName(value) {
  const name = normalizeVenueName(value);
  if (!name || name === "会场名待补全" || name === "会场未详") return false;
  return !/(某所|某会場|某会场|未定|非公開|非公开|未発表|未发表|未告知)/.test(name);
}

export function isConcreteWorkTitle(value) {
  const title = String(value || "").trim();
  return Boolean(title && !["Eventernote", "eventernote"].includes(title));
}

export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return {
    month: date.toLocaleString("zh-CN", { month: "short" }),
    day: String(date.getDate()).padStart(2, "0"),
    weekday: date.toLocaleString("zh-CN", { weekday: "short" })
  };
}

export function formatDetailDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

export function typeLabel(type) {
  return typeOptions.find(([value]) => value === type)?.[1] || type;
}

export function eventDisplayTags(event) {
  const label = typeLabel(event.type).toLowerCase();
  return (event.tags || []).filter((tag) => {
    const normalized = tag.toLowerCase();
    return normalized !== label && normalized !== "eventernote";
  });
}

export function displayVenue(value) {
  const venue = normalizeVenueName(value);
  if (!venue || venue === "会场名待补全" || venue === "会场未详") return "会场未标注";
  return venue;
}

export function displayArtists(event) {
  const work = String(event?.work || "").trim();
  return (event?.artists || []).filter((artist) => String(artist || "").trim() && artist !== work);
}
