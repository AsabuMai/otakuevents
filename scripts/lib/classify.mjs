export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "eventernote";
}

export function detectType(name) {
  const lower = String(name || "").toLowerCase();
  if (/舞台|ミュージカル|朗読劇|演劇|劇団|act|theater|theatre/.test(lower)) return "theater";
  if (/ファンミ|fan ?meeting|お渡し会|握手会|サイン会|チェキ|撮影会|birthday|生誕|オフ会/.test(lower)) return "fan";
  if (lower.includes("上映") || lower.includes("舞台挨拶")) return "screening";
  if (lower.includes("公開録音") || lower.includes("公開収録") || lower.includes("ラジオ")) return "radio";
  if (lower.includes("発売") || lower.includes("リリース") || lower.includes("release")) return "release";
  if (lower.includes("トーク") || lower.includes("talk")) return "talk";
  if (lower.includes("stage") || lower.includes("ステージ") || lower.includes("animejapan")) return "stage";
  if (/live|ライブ|concert|コンサート|ワンマン|tour|ツアー|fes|フェス|festival|歌謡|音楽|対バン/.test(lower)) return "live";
  return "event";
}

export function detectWork(name) {
  const pairs = workRules();
  const lower = String(name || "").toLowerCase();
  return pairs.find(([, keys]) => keys.some((key) => lower.includes(key.toLowerCase())))?.[0] || "";
}

export function workRules() {
  return [
    ["LoveLive!", ["ラブライブ", "lovelive", "虹ヶ咲", "aqours", "liella", "蓮ノ空"]],
    ["学園アイドルマスター", ["学園アイドルマスター", "学マス"]],
    ["アイドルマスター シンデレラガールズ", ["シンデレラガールズ", "デレマス"]],
    ["アイドルマスター ミリオンライブ！", ["ミリオンライブ", "ミリマス"]],
    ["アイドルマスター シャイニーカラーズ", ["シャイニーカラーズ", "シャニマス"]],
    ["THE IDOLM@STER", ["アイドルマスター", "アイマス", "idol world", "idolm@ster"]],
    ["BanG Dream!", ["bang dream", "バンドリ"]],
    ["D4DJ", ["d4dj"]],
    ["ウマ娘", ["ウマ娘"]],
    ["プリキュア", ["プリキュア"]],
    ["AnimeJapan", ["animejapan"]],
    ["声優ラジオ", ["公開録音", "公開収録", "ラジオ"]],
    ["Anisong", ["anisong", "アニソン", "animax"]]
  ];
}

export function makeTags(name, type) {
  const tags = [];
  if (type === "radio") tags.push("公开收录");
  if (type === "screening") tags.push("上映会");
  if (/昼|夜|day|night/i.test(String(name || ""))) tags.push("公演");
  return [...new Set(tags)];
}

export function normalizeEventClassification(event) {
  const work = detectWork(event.title);
  const type = event.type || detectType(event.title);
  return {
    ...event,
    type,
    work,
    workId: slugify(work),
    tags: event.tags?.length ? event.tags : makeTags(event.title, type)
  };
}
