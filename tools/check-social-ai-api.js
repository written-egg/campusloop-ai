require("dotenv").config({ quiet: true });

const sql = require("mssql");
const sqlStore = require("../lib/sqlStore");

const baseUrl = process.env.APP_BASE_URL || "http://localhost:5173";

async function request(path, { method = "GET", body, token = "" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
}

async function register(role, suffix) {
  const response = await request("/api/auth/register", { method: "POST", body: { loginName: `social_${role}_${suffix}`, password: "Campus123!", name: `${role}测试用户`, campus: "测试校区" } });
  if (response.status !== 200) throw new Error(response.body.error || `${role} registration failed`);
  return response.body.data;
}

async function main() {
  const pool = await sqlStore.getPool();
  const suffix = Date.now().toString().slice(-8);
  const users = [];
  let productId = "";
  try {
    const seller = await register("seller", suffix);
    const buyer = await register("buyer", suffix);
    const outsider = await register("outsider", suffix);
    users.push(seller.id, buyer.id, outsider.id);
    const product = await request("/api/products", { method: "POST", token: seller.sessionToken, body: { name: "社交接口测试商品", category: "其他", price: 100, condition: "九成新", sellerId: seller.id, image: "/assets/products/camera.jpg" } });
    if (product.status !== 200 || !product.body.data?.id) throw new Error(`product creation failed: ${product.status} ${product.body.error || "unknown error"}`);
    productId = product.body.data.id;

    const unauthenticated = await request("/api/my/favorites");
    const added = await request(`/api/products/${productId}/favorite`, { method: "POST", token: buyer.sessionToken });
    const duplicate = await request(`/api/products/${productId}/favorite`, { method: "POST", token: buyer.sessionToken });
    const favorites = await request("/api/my/favorites", { token: buyer.sessionToken });
    const selfFavorite = await request(`/api/products/${productId}/favorite`, { method: "POST", token: seller.sessionToken });

    const sent = await request("/api/messages", { method: "POST", token: buyer.sessionToken, body: { productId, receiverId: seller.id, content: "可以当面验货吗？" } });
    if (sent.status !== 200 || !sent.body.data?.id) throw new Error(`message send failed: ${sent.status} ${sent.body.error || "unknown error"}`);
    const invalidPeer = await request("/api/messages", { method: "POST", token: outsider.sessionToken, body: { productId, receiverId: buyer.id, content: "越权消息" } });
    const sellerConversations = await request("/api/my/conversations", { token: seller.sessionToken });
    const messages = await request(`/api/messages?productId=${encodeURIComponent(productId)}&peerId=${encodeURIComponent(buyer.id)}`, { token: seller.sessionToken });
    const outsiderMessages = await request(`/api/messages?productId=${encodeURIComponent(productId)}&peerId=${encodeURIComponent(buyer.id)}`, { token: outsider.sessionToken });
    const marked = await request(`/api/messages/${sent.body.data.id}/read`, { method: "PATCH", token: seller.sessionToken });
    const unauthorizedRead = await request(`/api/messages/${sent.body.data.id}/read`, { method: "PATCH", token: outsider.sessionToken });

    await sqlStore.saveAIReport({ userExternalId: buyer.id, reportType: "price", provider: "test", score: 88, result: { suggested: 100, min: 90, max: 110 } });
    const reports = await request("/api/my/ai-reports?type=price", { token: buyer.sessionToken });
    const outsiderReports = await request("/api/my/ai-reports?type=price", { token: outsider.sessionToken });
    const removed = await request(`/api/products/${productId}/favorite`, { method: "DELETE", token: buyer.sessionToken });

    const checks = {
      authenticationRequired: unauthenticated.status === 401,
      favoriteLifecycle: added.status === 200 && favorites.body.data?.some((item) => item.id === productId) && removed.status === 200,
      duplicateFavoriteRejected: duplicate.status === 409,
      selfFavoriteRejected: selfFavorite.status === 400,
      messageSent: sent.status === 200 && messages.body.data?.some((item) => item.id === sent.body.data.id),
      conversationReturned: sellerConversations.body.data?.some((item) => item.productId === productId && item.peerId === buyer.id),
      unrelatedUsersCannotMessage: invalidPeer.status === 403,
      unrelatedUsersCannotReadConversation: outsiderMessages.status === 200 && outsiderMessages.body.data?.length === 0,
      receiverCanMarkRead: marked.status === 200 && marked.body.data?.isRead === true,
      outsiderCannotMarkRead: unauthorizedRead.status === 404,
      aiHistoryScoped: reports.body.data?.some((item) => item.provider === "test") && outsiderReports.body.data?.every((item) => item.provider !== "test")
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ ok, checks, ...(ok ? {} : { favoriteDebug: { added, duplicate, favorites, selfFavorite, removed } }) }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    if (productId) {
      await pool.request().input("productId", sql.NVarChar(40), productId).query(`
        DELETE m FROM dbo.Messages m INNER JOIN dbo.Products p ON p.ProductId=m.ProductId WHERE p.ExternalId=@productId;
        DELETE f FROM dbo.Favorites f INNER JOIN dbo.Products p ON p.ProductId=f.ProductId WHERE p.ExternalId=@productId;
        DELETE FROM dbo.Products WHERE ExternalId=@productId;
      `);
    }
    if (users.length) {
      const cleanup = pool.request();
      users.forEach((id, index) => cleanup.input(`u${index}`, sql.NVarChar(40), id));
      const values = users.map((_, index) => `@u${index}`).join(",");
      await cleanup.query(`DELETE FROM dbo.AIReports WHERE UserId IN (SELECT UserId FROM dbo.Users WHERE ExternalId IN (${values})); DELETE FROM dbo.Users WHERE ExternalId IN (${values});`);
    }
    await pool.close();
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
