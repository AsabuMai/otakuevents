export function emptyEventExtra() {
  return {
    openTime: "",
    startTime: "",
    officialUrl: "",
    ticketUrl: "",
    price: "",
    ticketInfo: "",
    source: ""
  };
}

export function sanitizeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url.slice(0, 300) : "";
}

export function sanitizeEventExtra(body = {}) {
  return {
    openTime: String(body.openTime || "").trim().slice(0, 20),
    startTime: String(body.startTime || "").trim().slice(0, 20),
    officialUrl: sanitizeUrl(body.officialUrl),
    ticketUrl: sanitizeUrl(body.ticketUrl),
    price: String(body.price || "").trim().slice(0, 120),
    ticketInfo: String(body.ticketInfo || "").trim().slice(0, 500),
    source: String(body.source || "").trim().slice(0, 40),
    updatedAt: body.updatedAt || new Date().toISOString()
  };
}

export function hasEventExtra(extra = {}) {
  return Boolean(extra.openTime || extra.startTime || extra.officialUrl || extra.ticketUrl || extra.price || extra.ticketInfo);
}

export function parseEventExtraHtml(html) {
  const timeText = decodeHtml(extractEventernoteTableCell(html, "時間"));
  const relatedHtml = extractEventernoteTableCell(html, "関連リンク");
  const relatedUrls = [...relatedHtml.matchAll(/href="([^"]+)"/g)]
    .map((match) => decodeHtml(match[1]))
    .filter((url) => /^https?:\/\//i.test(url));
  const description = decodeHtml(html.match(/<tr>\s*<td>\s*<img[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/i)?.[1] || "");
  const combined = `${timeText}\n${description}`;
  const openTime = combined.match(/(?:開場|OPEN)\s*(\d{1,2}[:：]\d{2})/i)?.[1]?.replace("：", ":") || "";
  const startTime = combined.match(/(?:開演|START)\s*(\d{1,2}[:：]\d{2})/i)?.[1]?.replace("：", ":") || "";
  const priceLines = description
    .split(/\n|。/)
    .map((line) => line.trim())
    .filter((line) => /(?:¥|￥|円|無料|free)/i.test(line) && /(?:\d|無料|free)/i.test(line) && line.length <= 100)
    .slice(0, 5);
  const ticketInfoLines = description
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => /(チケット|ticket|抽選|先行|一般|受付|発売|料金|席|券|販売)/i.test(line))
    .slice(0, 6);
  const ticketUrl = relatedUrls.find((url) => /(ticket|eplus|pia|l-tike|lawson|zaiko|tiget|passmarket|ticketvillage|楽天チケット|w\.pia|l-tike)/i.test(url)) || "";
  const officialUrl = relatedUrls.find((url) => url !== ticketUrl && !/^https?:\/\/(x\.com|twitter\.com)/i.test(url)) || relatedUrls.find((url) => url !== ticketUrl) || "";
  return sanitizeEventExtra({
    openTime,
    startTime,
    officialUrl,
    ticketUrl,
    price: priceLines.join(" / "),
    ticketInfo: ticketInfoLines.join("\n"),
    source: hasEventExtra({ openTime, startTime, officialUrl, ticketUrl, price: priceLines.join(""), ticketInfo: ticketInfoLines.join("") }) ? "eventernote" : ""
  });
}

export function extractEventernoteTableCell(html, label) {
  const rowPattern = new RegExp(`<tr>[\\s\\S]*?<td[^>]*>\\s*${label}\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>\\s*<\\/tr>`, "i");
  return html.match(rowPattern)?.[1] || "";
}

export function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
