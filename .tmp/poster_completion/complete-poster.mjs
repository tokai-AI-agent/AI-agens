import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const root = "C:/Users/hanab/OneDrive/デスクトップ/旅行エージェントfile/AI-agens/.tmp/poster_completion";
const output = "C:/Users/hanab/OneDrive/デスクトップ/旅行エージェントfile/AI-agens/ポスター_完成版.pptx";
const deck = await PresentationFile.importPptx(await FileBlob.load(path.join(root, "source.pptx")));
const slide = deck.slides.items[0];

const C = {
  blue: "#0070C0",
  navy: "#17365D",
  pale: "#EAF4FB",
  pale2: "#F5F8FA",
  ink: "#1F2937",
  muted: "#536273",
  white: "#FFFFFF",
  green: "#1C8C68",
  orange: "#E67E22",
  line: "#B7C7D6",
};

function addText(text, position, options = {}) {
  const box = slide.shapes.add({
    geometry: "textbox",
    position,
    fill: options.fill ?? "none",
    line: options.line ?? { style: "solid", fill: "none", width: 0 },
  });
  box.text = text;
  box.text.style = {
    fontFamily: "Yu Gothic",
    fontSize: options.fontSize ?? 27,
    bold: options.bold ?? false,
    color: options.color ?? C.ink,
    alignment: options.alignment ?? "left",
    verticalAlignment: options.verticalAlignment ?? "top",
  };
  return box;
}

function addBox(position, fill, line = C.line, radius = 18) {
  return slide.shapes.add({
    geometry: "roundRect",
    position,
    fill,
    line: { style: "solid", fill: line, width: 2 },
    borderRadius: radius,
  });
}

function addLabel(text, x, y, w, color = C.blue) {
  addText(text, { left: x, top: y, width: w, height: 55 }, {
    fontSize: 28, bold: true, color,
  });
}

deck.resolve("sh/547294r6").text = "AIエージェントを用いた旅行プラン生成";
deck.resolve("sh/7qp4be9c").text = "卒業研究｜旅行プラン提案システム";
const futureWork = deck.resolve("sh/sfqdkrep");
futureWork.text =
  "・文字コードを統一し、表示崩れを解消する\n" +
  "・ルーム情報を永続ストレージへ移行する\n" +
  "・宿泊施設の検索・提案・予約連携を追加する\n" +
  "・役割分担型のマルチエージェントへ拡張する";
futureWork.text.style = {
  fontFamily: "Yu Gothic",
  fontSize: 27,
  color: C.ink,
  alignment: "left",
  verticalAlignment: "top",
};

// 1. Introduction
addText(
  "旅行計画では、観光地・飲食店・交通・イベントなど複数の情報を調べ、" +
  "時間や距離を考慮して行程へまとめる必要がある。さらにグループ旅行では、" +
  "参加者ごとの予算・ペース・希望の違いを調整する負担が大きい。",
  { left: 155, top: 820, width: 1230, height: 235 },
  { fontSize: 30 }
);
addText(
  "Web検索結果を読むだけでは、情報が断片的で、移動を含む実行可能なプランに変換しにくい。\n" +
  "また、候補を比較して合意を取る作業は人手に依存している。",
  { left: 155, top: 1175, width: 1230, height: 210 },
  { fontSize: 30 }
);
addText(
  "生成AIが最新情報を検索し、条件に合う1日単位の旅行プランを自動生成する。" +
  "個人向け提案に加え、2〜5人の希望を統合して3案を生成し、投票で最終案を決定できる仕組みを実装した。",
  { left: 155, top: 1550, width: 1230, height: 175 },
  { fontSize: 30, bold: true, color: C.navy }
);

// 2. Proposal / process
const flowY = 800;
const nodes = [
  { x: 1615, w: 300, title: "① 条件入力", body: "出発地・目的地\n日程・テーマ" },
  { x: 1960, w: 300, title: "② 情報検索", body: "Tavily / HotPepper\n観光・交通・飲食" },
  { x: 2305, w: 300, title: "③ AI生成", body: "時刻・移動・住所を含む\n実行可能な行程" },
  { x: 2650, w: 300, title: "④ 比較・決定", body: "3案を提示\n参加者が投票" },
];
for (const n of nodes) {
  addBox({ left: n.x, top: flowY, width: n.w, height: 255 }, C.pale, C.blue, 22);
  addText(n.title, { left: n.x + 18, top: flowY + 25, width: n.w - 36, height: 55 }, {
    fontSize: 27, bold: true, color: C.navy, alignment: "center",
  });
  addText(n.body, { left: n.x + 22, top: flowY + 100, width: n.w - 44, height: 115 }, {
    fontSize: 23, color: C.muted, alignment: "center", verticalAlignment: "middle",
  });
}
for (let i = 0; i < 3; i++) {
  addText("→", { left: 1911 + 345 * i, top: 875, width: 50, height: 55 }, {
    fontSize: 34, bold: true, color: C.blue, alignment: "center",
  });
}
addText(
  "● 最新Web情報を使い、検索結果の住所・開催日を確認\n" +
  "● 出発地からの移動時間を含む時刻付きタイムライン\n" +
  "● 近隣スポットをまとめ、無駄な往復を抑制\n" +
  "● グループの共通希望・対立点・妥協案を可視化\n" +
  "● 生成結果をJSONスキーマで検証し、UIへ表示",
  { left: 1625, top: 1520, width: 1320, height: 245 },
  { fontSize: 28 }
);

// 3. Experience area: technology strip and screenshots
addText(
  "Mastra（エージェント）　｜　Gemini 3.1 Flash Lite（LLM）　｜　Tavily（Web検索）\n" +
  "Hot Pepper Gourmet API（飲食店）　｜　React + Vite（UI）　｜　LibSQL（個人プラン保存）",
  { left: 490, top: 2025, width: 2450, height: 120 },
  { fontSize: 27, bold: true, color: C.navy, verticalAlignment: "middle" }
);

const screenshotDir = "C:/Users/hanab/OneDrive/画像/スクリーンショット";
const experienceScreens = [
  {
    file: "スクリーンショット 2026-07-30 135619.png",
    alt: "個人旅行とグループ旅行を選択するモード選択画面",
    caption: "① モード選択｜個人旅行またはグループ旅行を選ぶ",
    x: 180,
    y: 2165,
  },
  {
    file: "スクリーンショット 2026-07-30 174524.png",
    alt: "グループ参加者が目的地、日程、予算、希望を入力する画面",
    caption: "② 希望入力｜日程・予算・ペース・必須条件を共有",
    x: 1600,
    y: 2165,
  },
  {
    file: "スクリーンショット 2026-07-30 174210.png",
    alt: "AIチャットと時刻付き旅行スケジュールを表示する個人旅行画面",
    caption: "③ 個人プラン｜会話から時刻・移動・住所付き行程を生成",
    x: 180,
    y: 2840,
  },
  {
    file: "スクリーンショット 2026-07-30 180313.png",
    alt: "グループ旅行の3案比較、合意形成、投票画面",
    caption: "④ グループ決定｜3案と妥協点を比較し、投票で確定",
    x: 1600,
    y: 2840,
  },
];
for (const screen of experienceScreens) {
  addBox({ left: screen.x - 12, top: screen.y - 12, width: 1344, height: 555 }, C.white, C.line, 16);
  const bytes = await fs.readFile(path.join(screenshotDir, screen.file));
  slide.images.add({
    blob: bytes,
    contentType: "image/png",
    alt: screen.alt,
    fit: screen.file.includes("135619") ? "cover" : "contain",
    position: { left: screen.x, top: screen.y, width: 1320, height: 515 },
    geometry: "roundRect",
    borderRadius: 12,
  });
  addText(screen.caption, { left: screen.x, top: screen.y + 548, width: 1320, height: 55 }, {
    fontSize: 25, bold: true, color: C.blue, alignment: "center",
  });
}

// 4. Summary
addText(
  "旅行条件を自然言語で受け取り、情報検索から行程作成までを一貫して自動化した。\n" +
  "個人向けでは具体的な時刻・移動・住所を含むプランを提示し、グループ向けでは複数人の希望を整理した3案を比較・投票できる。\n" +
  "これにより、情報収集と合意形成にかかる負担を減らし、旅行計画の開始から決定までを支援できる。",
  { left: 155, top: 3885, width: 1290, height: 330 },
  { fontSize: 29, bold: true, color: C.navy }
);

slide.speakerNotes.textFrame.setText(
  "[Sources]\n" +
  "- Local implementation: src/mastra/agents/travel-agent.ts\n" +
  "- Local implementation: src/mastra/group-trips.ts\n" +
  "- Local implementation: src/mastra/tools/tavily-search.ts\n" +
  "- Local implementation: src/mastra/tools/hotpepper-search.ts\n" +
  "- User-provided local UI screenshots captured on 2026-07-30\n" +
  "[/Sources]"
);

const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(output);

const renderDir = path.join(root, "final-render");
await fs.mkdir(renderDir, { recursive: true });
const png = await slide.export({ format: "png", scale: 1 });
await fs.writeFile(path.join(renderDir, "slide-1.png"), new Uint8Array(await png.arrayBuffer()));
const layout = await slide.export({ format: "layout" });
await fs.writeFile(path.join(renderDir, "slide-1.json"), JSON.stringify(layout, null, 2), "utf8");
const snapshot = await deck.inspect({ kind: "slide,textbox,shape,image,notes", maxChars: 100000 });
await fs.writeFile(path.join(renderDir, "inspect.ndjson"), snapshot.ndjson, "utf8");
console.log(output);
