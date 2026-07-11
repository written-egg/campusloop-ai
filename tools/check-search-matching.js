const { extractSearchTerms, rankProducts } = require("../public/search-matching");

const products = [
  { id: "board", name: "Burton Process 滑雪板", category: "运动户外", price: 980, tags: ["单板"], description: "适合雪场练习", trust: 96 },
  { id: "shoes", name: "Salomon XT-6 越野鞋", category: "运动户外", price: 760, tags: ["跑鞋"], description: "轻户外通勤", trust: 95 },
  { id: "camera", name: "富士 X100V 复古相机", category: "数码电子", price: 4800, tags: ["相机"], description: "新手友好", trust: 98 }
];

const snowboardIntent = { categoryIntent: "运动户外", budgetHint: 1000, keywords: ["适合新手的滑雪板", "预算", "1000", "以内"] };
const snowboard = rankProducts("适合新手的滑雪板，预算 1000 以内", snowboardIntent, products);
const noSnowboard = rankProducts("适合新手的滑雪板，预算 1000 以内", snowboardIntent, products.filter((item) => item.id !== "board"));
const camera = rankProducts("新手相机，预算5000", { categoryIntent: "数码电子", budgetHint: 5000, keywords: ["新手相机"] }, products);

const checks = {
  termExtracted: extractSearchTerms("适合新手的滑雪板，预算 1000 以内", snowboardIntent).includes("滑雪板"),
  exactSnowboardOnly: snowboard.exactMatches.length === 1 && snowboard.exactMatches[0].id === "board",
  shoesNotExact: snowboard.exactMatches.every((item) => item.id !== "shoes"),
  shoesShownAsRelated: noSnowboard.exactMatches.length === 0 && noSnowboard.similarRecommendations.some((item) => item.id === "shoes"),
  cameraNotMisclassifiedByNewUser: camera.exactMatches.length === 1 && camera.exactMatches[0].id === "camera"
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks }, null, 2));
if (!ok) process.exitCode = 1;
