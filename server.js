require("dotenv").config({ quiet: true });

const http = require("http");
const fs = require("fs");
const path = require("path");
const sqlStore = require("./lib/sqlStore");

const root = __dirname;
const publicDir = path.join(root, "public");
const dataDir = path.join(root, "data");
const dbFile = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 5173);
const deepSeekKey = process.env.DEEPSEEK_API_KEY || "";
const deepSeekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  if (Buffer.isBuffer(body)) return res.end(body);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf8");
}

function readDb() {
  if (!fs.existsSync(dbFile)) {
    writeDb({ users: [], products: [] });
  }
  const db = JSON.parse(fs.readFileSync(dbFile, "utf8"));
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.products)) db.products = [];
  if (!db.products.length) {
    db.products = readJson("sample-products.json").map((item, index) => ({
      ...item,
      sellerId: index % 2 === 0 ? "u1" : "u2",
      sellerName: index % 2 === 0 ? "林同学" : "周同学",
      campus: index % 2 === 0 ? "南校区" : "北校区",
      createdAt: new Date(Date.now() - index * 3600 * 1000).toISOString()
    }));
    writeDb(db);
  }
  return db;
}

async function getProducts() {
  if (sqlStore.isSqlEnabled()) return sqlStore.listProducts();
  return readDb().products;
}

async function getUsers() {
  if (sqlStore.isSqlEnabled()) return sqlStore.listUsers();
  return readDb().users;
}

async function createUser(body) {
  if (sqlStore.isSqlEnabled()) return sqlStore.createUser(body);
  const db = readDb();
  const name = String(body.name || "").trim() || "匿名同学";
  const campus = String(body.campus || "").trim() || "未填写校区";
  const existing = db.users.find((user) => user.name === name && user.campus === campus);
  if (existing) return existing;
  const user = {
    id: `u${Date.now()}`,
    name,
    campus,
    trustScore: 82,
    createdAt: new Date().toISOString()
  };
  db.users.unshift(user);
  writeDb(db);
  return user;
}

async function createProduct(body) {
  if (sqlStore.isSqlEnabled()) return sqlStore.createProduct(body);
  const db = readDb();
  const product = {
    id: `p${Date.now()}`,
    name: String(body.name || body.title || "未命名商品").slice(0, 80),
    category: body.category || "其他",
    price: Number(body.price || 99),
    condition: body.condition || "九成新",
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 6) : ["同校自提"],
    score: 4.5,
    views: 0,
    image: body.image || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    sellerId: body.sellerId || "u1",
    sellerName: body.sellerName || "林同学",
    campus: body.campus || "南校区",
    createdAt: new Date().toISOString()
  };
  db.products.unshift(product);
  writeDb(db);
  return product;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function callDeepSeek(messages, schemaHint) {
  if (!deepSeekKey || typeof fetch !== "function") return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepSeekKey}`
    },
    body: JSON.stringify({
      model: deepSeekModel,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "你是校园二手电商平台的AI助手。只输出严格JSON，不要Markdown，不要解释。" +
            (schemaHint ? ` JSON结构要求：${schemaHint}` : "")
        },
        ...messages
      ]
    })
  });
  clearTimeout(timeout);
  if (!response.ok) throw new Error(`DeepSeek API ${response.status}`);
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || "";
  return JSON.parse(content.replace(/^```json|```$/g, "").trim());
}

function fallbackListing(input) {
  const item = input || {};
  const condition = item.condition || "九成新";
  const brand = item.brand || "校园同学自用";
  const model = item.model || item.category || "二手好物";
  return {
    provider: "local-fallback",
    title: `${condition}${brand}${model}｜支持当面验货`,
    description: `这是一件${condition}的${brand}${model}，适合同校自提交易。建议买家当面检查外观、功能和配件，确认无误后交易。`,
    sellingPoints: ["同校交易", "可当面验货", "价格参考透明", "AI辅助发布"]
  };
}

function fallbackAttributes(rawText = "") {
  const text = String(rawText);
  const categories = readJson("category-knowledge.json");
  const hit = categories.find((category) => category.aliases.some((alias) => text.includes(alias))) || categories[0];
  const condition = text.includes("全新") ? "全新" : text.includes("八") ? "八成新" : "九成新";
  return {
    provider: "local-fallback",
    category: hit.category,
    brand: hit.commonBrands.find((brand) => text.toLowerCase().includes(brand.toLowerCase())) || hit.commonBrands[0],
    model: hit.baselineModels[0].model,
    condition,
    features: hit.requiredAttributes.slice(0, 4)
  };
}

function fallbackSearchIntent(query = "") {
  const text = String(query);
  const categoryMap = [
    ["滑雪", "运动户外"],
    ["新手", "运动户外"],
    ["手机", "数码电子"],
    ["电脑", "数码电子"],
    ["宿舍", "生活用品"],
    ["教材", "图书教材"],
    ["相机", "数码电子"]
  ];
  const match = categoryMap.find(([keyword]) => text.includes(keyword));
  const budget = text.match(/(\d{2,5})/)?.[1];
  return {
    provider: "local-fallback",
    categoryIntent: match ? match[1] : "不限",
    useCase: text || "校园二手好物",
    budgetHint: budget ? Number(budget) : null,
    keywords: text.split(/[,\s，。]+/).filter(Boolean).slice(0, 6)
  };
}

function fallbackCustomerService(message = "", products = []) {
  const text = String(message);
  if (text.includes("退") || text.includes("退款")) {
    return {
      provider: "local-fallback",
      reply: "建议先与卖家协商。若商品与描述明显不符，请保留聊天记录、商品照片和验货证据，再申请平台介入。",
      suggestions: ["查看交易凭证", "联系卖家协商", "申请平台介入"]
    };
  }
  if (text.includes("验货") || text.includes("真假") || text.includes("安全")) {
    return {
      provider: "local-fallback",
      reply: "建议优先同校当面交易。数码商品重点检查外观、序列号、电池健康、屏幕、摄像头和配件；交易前不要脱离平台转账。",
      suggestions: ["生成验货清单", "查看风控提示", "搜索同类商品"]
    };
  }
  const hit = products.find((item) => text.includes(item.category) || item.tags?.some((tag) => text.includes(tag)));
  return {
    provider: "local-fallback",
    reply: hit
      ? `你可以先看看「${hit.name}」，当前标价 ${hit.price} 元，适合按成色和同类成交价继续比较。`
      : "你可以告诉我预算、用途和想买的品类，我会帮你筛选在售商品，也可以帮你判断价格是否合理。",
    suggestions: ["帮我找1000以内商品", "这个价格合理吗", "交易时怎么避坑"]
  };
}

const apiHandlers = {
  "/api/generate-listing": async (body) => {
    const schema = '{"title":string,"description":string,"sellingPoints":string[]}';
    const prompt = `根据商品信息生成校园二手发布文案：${JSON.stringify(body)}`;
    return (await callDeepSeek([{ role: "user", content: prompt }], schema)) || fallbackListing(body);
  },
  "/api/extract-attributes": async (body) => {
    const schema = '{"category":string,"brand":string,"model":string,"condition":string,"features":string[]}';
    const prompt = `从用户描述中提取二手商品属性：${body.rawText || ""}`;
    return (await callDeepSeek([{ role: "user", content: prompt }], schema)) || fallbackAttributes(body.rawText);
  },
  "/api/search-intent": async (body) => {
    const schema = '{"categoryIntent":string,"useCase":string,"budgetHint":number|null,"keywords":string[]}';
    const prompt = `把买家的自然语言需求转成二手商品搜索意图：${body.query || ""}`;
    return (await callDeepSeek([{ role: "user", content: prompt }], schema)) || fallbackSearchIntent(body.query);
  },
  "/api/customer-service": async (body) => {
    const products = await getProducts();
    const schema = '{"reply":string,"suggestions":string[]}';
    const prompt = [
      "你是校园二手交易平台的智能客服，回答要简短、具体、偏交易安全和商品选择。",
      `用户问题：${body.message || ""}`,
      `当前在售商品：${JSON.stringify(products.slice(0, 8).map((p) => ({ name: p.name, category: p.category, price: p.price, tags: p.tags })))}`
    ].join("\n");
    return (await callDeepSeek([{ role: "user", content: prompt }], schema)) || fallbackCustomerService(body.message, products);
  },
  "/api/users": async (body) => {
    return createUser(body);
  },
  "/api/products": async (body) => {
    return createProduct(body);
  }
};

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const hasExtension = Boolean(path.extname(pathname));
  const relativePath = pathname.replace(/^\/+/, "");
  let filePath =
    pathname === "/"
      ? path.join(publicDir, "index.html")
      : pathname.startsWith("/data/")
        ? path.join(root, relativePath)
        : path.join(publicDir, relativePath);

  filePath = path.normalize(filePath);
  if (!filePath.startsWith(root)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (hasExtension) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    filePath = path.join(publicDir, "index.html");
  }
  const ext = path.extname(filePath).toLowerCase();
  send(res, 200, fs.readFileSync(filePath), mime[ext] || "application/octet-stream");
}

http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") return send(res, 204, "");
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/products") {
      return send(res, 200, { ok: true, data: await getProducts(), storage: sqlStore.isSqlEnabled() ? "sql-server" : "json" });
    }
    if (req.method === "GET" && url.pathname === "/api/users") {
      return send(res, 200, { ok: true, data: await getUsers(), storage: sqlStore.isSqlEnabled() ? "sql-server" : "json" });
    }
    if (req.method === "POST" && apiHandlers[url.pathname]) {
      const body = await readBody(req);
      try {
        const data = await apiHandlers[url.pathname](body);
        return send(res, 200, { ok: true, data, deepSeekEnabled: Boolean(deepSeekKey) });
      } catch (error) {
        if (url.pathname === "/api/products" || url.pathname === "/api/users") {
          return send(res, 500, { ok: false, error: error.message || "Save failed" });
        }
        const fallback =
          url.pathname === "/api/generate-listing"
            ? fallbackListing(body)
            : url.pathname === "/api/extract-attributes"
              ? fallbackAttributes(body.rawText)
              : url.pathname === "/api/customer-service"
                ? fallbackCustomerService(body.message, await getProducts())
                : fallbackSearchIntent(body.query);
        return send(res, 200, {
          ok: true,
          data: fallback,
          deepSeekEnabled: Boolean(deepSeekKey),
          warning: "DeepSeek unavailable, local fallback used."
        });
      }
    }
    serveStatic(req, res);
  })
  .listen(port, () => {
    console.log(`AI second-hand workbench running at http://localhost:${port}`);
  });
