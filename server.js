require("dotenv").config({ quiet: true });

const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const sqlStore = require("./lib/sqlStore");

const root = __dirname;
const publicDir = path.join(root, "public");
const dataDir = path.join(root, "data");
const dbFile = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 5173);
const deepSeekKey = process.env.DEEPSEEK_API_KEY || "";
const deepSeekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const sessions = new Map();
const sessionLifetimeMs = 12 * 60 * 60 * 1000;

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
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  });
  if (Buffer.isBuffer(body)) return res.end(body);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + sessionLifetimeMs });
  return token;
}

function readSession(req) {
  const authorization = String(req.headers.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return { token, userId: null };
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return { token, userId: null };
  }
  return { token, userId: session.userId };
}

function requireSessionUser(req) {
  if (!sqlStore.isSqlEnabled()) {
    const error = new Error("该功能需要配置 SQL Server。");
    error.statusCode = 503;
    throw error;
  }
  const session = readSession(req);
  if (!session?.userId) {
    const error = new Error("登录已失效，请重新登录。");
    error.statusCode = 401;
    throw error;
  }
  return session.userId;
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
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 6 * 1024 * 1024) {
      const error = new Error("请求内容过大。");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
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

function fallbackEstimate(body = {}) {
  const local = body.localEstimate || {};
  const suggested = Math.max(1, Number(local.suggested) || 0);
  return {
    provider: "local-fallback",
    suggested,
    min: Math.max(1, Number(local.min) || suggested * 0.9),
    max: Math.max(1, Number(local.max) || suggested * 1.1),
    confidence: 65,
    reasons: Array.isArray(local.reasons) ? local.reasons.slice(0, 4) : ["基于本地型号参数和成交样本计算"]
  };
}

function fallbackAuthenticity(body = {}) {
  const local = body.localAssessment || {};
  return {
    provider: "local-fallback",
    score: Math.max(0, Math.min(100, Number(local.score) || 50)),
    verdict: local.verdict || "需要补充凭证并当面验货",
    riskLevel: Number(local.score) >= 82 ? "low" : Number(local.score) >= 62 ? "medium" : "high",
    findings: Array.isArray(local.findings) ? local.findings.slice(0, 6) : ["当前仅能进行规则风险评估"]
  };
}

const apiHandlers = {
  "/api/ai/estimate": async (body) => {
    const schema = '{"suggested":number,"min":number,"max":number,"confidence":number,"reasons":string[]}';
    const prompt = [
      "请结合商品信息、本地参数估值和近期成交样本，给出人民币二手建议价。不要编造不存在的成交数据。",
      `输入：${JSON.stringify(body)}`,
      "价格必须为正数，min <= suggested <= max；reasons 给出2至4条简短依据。"
    ].join("\n");
    const aiResult = await callDeepSeek([{ role: "user", content: prompt }], schema);
    const result = aiResult ? { ...aiResult, provider: "deepseek" } : fallbackEstimate(body);
    if (sqlStore.isSqlEnabled()) {
      const saved = await sqlStore.saveAIReport({
        userExternalId: body.userExternalId,
        productExternalId: body.productExternalId,
        reportType: "price",
        provider: result.provider,
        score: result.confidence,
        result
      });
      return { ...result, ...saved, storage: "sql-server" };
    }
    return result;
  },
  "/api/ai/authenticity-risk": async (body) => {
    const schema = '{"score":number,"verdict":string,"riskLevel":"low"|"medium"|"high","findings":string[]}';
    const prompt = [
      "你是二手商品验货风险助手，不得声称已经鉴定真伪，也不得声称已查询品牌官方数据库。",
      "请根据型号、报价、序列号是否提供、卖家描述和本地估价，评估风险并给出核验建议。",
      `输入：${JSON.stringify(body)}`,
      "score为0到100的可信度；findings给出3至6条可执行建议。"
    ].join("\n");
    const aiResult = await callDeepSeek([{ role: "user", content: prompt }], schema);
    const result = aiResult ? { ...aiResult, provider: "deepseek" } : fallbackAuthenticity(body);
    if (sqlStore.isSqlEnabled()) {
      const saved = await sqlStore.saveAIReport({
        userExternalId: body.userExternalId,
        productExternalId: body.productExternalId,
        reportType: "risk",
        provider: result.provider,
        score: result.score,
        result,
        risk: {
          level: result.riskLevel,
          message: result.verdict || result.findings?.[0]
        }
      });
      return { ...result, ...saved, storage: "sql-server" };
    }
    return result;
  },
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
  },
  "/api/auth/register": async (body) => {
    if (!sqlStore.isSqlEnabled()) {
      const error = new Error("注册功能需要配置 SQL Server。");
      error.statusCode = 503;
      throw error;
    }
    return sqlStore.registerAccount(body);
  },
  "/api/auth/login": async (body) => {
    if (!sqlStore.isSqlEnabled()) {
      const error = new Error("登录功能需要配置 SQL Server。");
      error.statusCode = 503;
      throw error;
    }
    return sqlStore.loginAccount(body);
  },
  "/api/auth/logout": async (body) => {
    if (body.sessionToken) sessions.delete(body.sessionToken);
    return { loggedOut: true };
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
    if (req.method === "GET" && url.pathname === "/api/auth/session") {
      try {
        const session = readSession(req);
        if (!session?.userId) return send(res, 401, { ok: false, data: null, error: "登录已失效，请重新登录。" });
        if (!sqlStore.isSqlEnabled()) {
          return send(res, 503, { ok: false, data: null, error: "登录功能需要配置 SQL Server。" });
        }
        const user = await sqlStore.getUserByExternalId(session.userId);
        if (!user) {
          sessions.delete(session.token);
          return send(res, 401, { ok: false, data: null, error: "登录用户不存在，请重新登录。" });
        }
        return send(res, 200, { ok: true, data: user, error: null });
      } catch (error) {
        return send(res, error.statusCode || 500, { ok: false, data: null, error: error.message || "Session check failed" });
      }
    }
    const ownProductMatch = url.pathname.match(/^\/api\/my\/products\/([^/]+)$/);
    const offShelfMatch = url.pathname.match(/^\/api\/my\/products\/([^/]+)\/off-shelf$/);
    const reserveMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/reserve$/);
    const transactionActionMatch = url.pathname.match(/^\/api\/transactions\/(\d+)\/(finish|cancel)$/);
    const favoriteMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/favorite$/);
    const messageReadMatch = url.pathname.match(/^\/api\/messages\/(\d+)\/read$/);
    const isMarketplaceApi =
      (req.method === "GET" && ["/api/my/products", "/api/my/transactions", "/api/my/favorites", "/api/my/conversations", "/api/messages", "/api/my/ai-reports"].includes(url.pathname)) ||
      (req.method === "PATCH" && Boolean(ownProductMatch)) ||
      (req.method === "PATCH" && Boolean(messageReadMatch)) ||
      (req.method === "POST" && (url.pathname === "/api/messages" || Boolean(offShelfMatch || reserveMatch || transactionActionMatch || favoriteMatch))) ||
      (req.method === "DELETE" && Boolean(favoriteMatch));

    if (isMarketplaceApi) {
      try {
        const userId = requireSessionUser(req);
        let data;
        if (req.method === "GET" && url.pathname === "/api/my/products") {
          data = await sqlStore.listProductsByOwner(userId);
        } else if (req.method === "GET" && url.pathname === "/api/my/transactions") {
          data = await sqlStore.listTransactionsForUser(userId);
        } else if (req.method === "GET" && url.pathname === "/api/my/favorites") {
          data = await sqlStore.listFavorites(userId);
        } else if (req.method === "GET" && url.pathname === "/api/my/conversations") {
          data = await sqlStore.listConversations(userId);
        } else if (req.method === "GET" && url.pathname === "/api/messages") {
          data = await sqlStore.listMessages(userId, url.searchParams.get("productId"), url.searchParams.get("peerId"));
        } else if (req.method === "GET" && url.pathname === "/api/my/ai-reports") {
          data = await sqlStore.listAIReports(userId, url.searchParams.get("type") || "all");
        } else if (req.method === "PATCH" && ownProductMatch) {
          data = await sqlStore.updateOwnProduct(userId, decodeURIComponent(ownProductMatch[1]), await readBody(req));
        } else if (req.method === "PATCH" && messageReadMatch) {
          data = await sqlStore.markMessageRead(userId, Number(messageReadMatch[1]));
        } else if (req.method === "POST" && url.pathname === "/api/messages") {
          data = await sqlStore.sendMessage(userId, await readBody(req));
        } else if (favoriteMatch && req.method === "POST") {
          data = await sqlStore.addFavorite(userId, decodeURIComponent(favoriteMatch[1]));
        } else if (favoriteMatch && req.method === "DELETE") {
          data = await sqlStore.removeFavorite(userId, decodeURIComponent(favoriteMatch[1]));
        } else if (offShelfMatch) {
          data = await sqlStore.takeOwnProductOffline(userId, decodeURIComponent(offShelfMatch[1]));
        } else if (reserveMatch) {
          data = await sqlStore.reserveProduct(userId, decodeURIComponent(reserveMatch[1]));
        } else if (transactionActionMatch) {
          data = await sqlStore.updateTransactionStatus(
            userId,
            Number(transactionActionMatch[1]),
            transactionActionMatch[2] === "finish" ? "finished" : "cancelled"
          );
        }
        return send(res, 200, { ok: true, data, error: null, storage: "sql-server" });
      } catch (error) {
        return send(res, error.statusCode || 500, { ok: false, data: null, error: error.message || "Marketplace operation failed" });
      }
    }
    if (req.method === "POST" && apiHandlers[url.pathname]) {
      let body = {};
      try {
        body = await readBody(req);
        const session = readSession(req);
        if (url.pathname === "/api/products") body.authenticatedUserId = session?.userId || null;
        if (url.pathname.startsWith("/api/ai/")) body.userExternalId = session?.userId || null;
        if (url.pathname === "/api/auth/logout") body.sessionToken = session?.token || null;
        let data = await apiHandlers[url.pathname](body);
        if (url.pathname === "/api/auth/register" || url.pathname === "/api/auth/login") {
          data = { ...data, sessionToken: createSession(data.id) };
        }
        return send(res, 200, { ok: true, data, error: null, deepSeekEnabled: Boolean(deepSeekKey) });
      } catch (error) {
        if (url.pathname === "/api/products" || url.pathname === "/api/users" || url.pathname.startsWith("/api/auth/")) {
          return send(res, error.statusCode || 500, { ok: false, data: null, error: error.message || "Save failed" });
        }
        const fallback =
          url.pathname === "/api/ai/estimate"
            ? fallbackEstimate(body)
            : url.pathname === "/api/ai/authenticity-risk"
              ? fallbackAuthenticity(body)
              : url.pathname === "/api/generate-listing"
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
