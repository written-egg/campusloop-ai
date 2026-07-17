require("dotenv").config({ quiet: true });

const sql = require("mssql");
const sqlStore = require("../lib/sqlStore");

const baseUrl = process.env.APP_BASE_URL || "http://localhost:5173";

async function request(path, { method = "GET", body, token = "" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    throw new Error(`${method} ${path} returned non-JSON status ${response.status}: ${text.slice(0, 80)}`);
  }
}

async function register(role, suffix) {
  const response = await request("/api/auth/register", {
    method: "POST",
    body: {
      loginName: `market_${role}_${suffix}`,
      password: "Campus123!",
      name: `${role}接口测试用户`,
      campus: "测试校区"
    }
  });
  if (response.status !== 200) throw new Error(`${role} registration failed: ${response.body.error}`);
  return response.body.data;
}

async function createProduct(seller, name) {
  const response = await request("/api/products", {
    method: "POST",
    token: seller.sessionToken,
    body: {
      name,
      description: "交易接口自动化测试商品",
      category: "其他",
      price: 300,
      condition: "九成新",
      sellerId: seller.id,
      image: "/assets/products/camera.jpg"
    }
  });
  if (response.status !== 200) throw new Error(`product creation failed: ${response.body.error}`);
  return response.body.data;
}

async function main() {
  const pool = await sqlStore.getPool();
  const suffix = Date.now().toString().slice(-8);
  const userIds = [];
  const productIds = [];

  try {
    const seller = await register("seller", suffix);
    const buyer = await register("buyer", suffix);
    const outsider = await register("outsider", suffix);
    userIds.push(seller.id, buyer.id, outsider.id);

    const unauthenticatedProducts = await request("/api/my/products");
    const unauthenticatedTransactions = await request("/api/my/transactions");
    const productToFinish = await createProduct(seller, "待完成交易商品");
    const productToCancel = await createProduct(seller, "待取消交易商品");
    const productToDispute = await createProduct(seller, "待争议交易商品");
    const productToOffline = await createProduct(seller, "待下架商品");
    const productToDelete = await createProduct(seller, "待删除商品");
    productIds.push(productToFinish.id, productToCancel.id, productToDispute.id, productToOffline.id, productToDelete.id);

    const initialSellerProducts = await request("/api/my/products", { token: seller.sessionToken });
    const initialBuyerProducts = await request("/api/my/products", { token: buyer.sessionToken });
    const updated = await request(`/api/my/products/${productToFinish.id}`, {
      method: "PATCH",
      token: seller.sessionToken,
      body: { name: "已修改商品名称", description: "已修改商品描述", price: 288 }
    });
    const unauthorizedUpdate = await request(`/api/my/products/${productToFinish.id}`, {
      method: "PATCH",
      token: outsider.sessionToken,
      body: { price: 1 }
    });
    const selfReserve = await request(`/api/products/${productToOffline.id}/reserve`, {
      method: "POST",
      token: seller.sessionToken
    });
    const unauthorizedOffline = await request(`/api/my/products/${productToOffline.id}/off-shelf`, {
      method: "POST",
      token: buyer.sessionToken
    });
    const offline = await request(`/api/my/products/${productToOffline.id}/off-shelf`, {
      method: "POST",
      token: seller.sessionToken
    });

    const reservedForFinish = await request(`/api/products/${productToFinish.id}/reserve`, {
      method: "POST",
      token: buyer.sessionToken
    });
    const duplicateReserve = await request(`/api/products/${productToFinish.id}/reserve`, {
      method: "POST",
      token: outsider.sessionToken
    });
    const buyerTransactions = await request("/api/my/transactions", { token: buyer.sessionToken });
    const sellerTransactions = await request("/api/my/transactions", { token: seller.sessionToken });
    const buyerConfirm = await request(`/api/transactions/${reservedForFinish.body.data?.id}/confirm`, {
      method: "POST",
      token: buyer.sessionToken
    });
    const finishBeforeConfirm = await request(`/api/transactions/${reservedForFinish.body.data?.id}/finish`, {
      method: "POST",
      token: seller.sessionToken
    });
    const relisted = await request(`/api/my/products/${productToOffline.id}/relist`, {
      method: "POST",
      token: seller.sessionToken
    });
    const offlineAgain = await request(`/api/my/products/${productToOffline.id}/off-shelf`, {
      method: "POST",
      token: seller.sessionToken
    });
    await request(`/api/my/products/${productToDelete.id}/off-shelf`, { method: "POST", token: seller.sessionToken });
    const deleted = await request(`/api/my/products/${productToDelete.id}`, { method: "DELETE", token: seller.sessionToken });
    const confirmed = await request(`/api/transactions/${reservedForFinish.body.data?.id}/confirm`, {
      method: "POST",
      token: seller.sessionToken
    });
    const repeatedConfirm = await request(`/api/transactions/${reservedForFinish.body.data?.id}/confirm`, {
      method: "POST",
      token: seller.sessionToken
    });
    const buyerFinish = await request(`/api/transactions/${reservedForFinish.body.data?.id}/finish`, {
      method: "POST",
      token: buyer.sessionToken
    });
    const finished = await request(`/api/transactions/${reservedForFinish.body.data?.id}/finish`, {
      method: "POST",
      token: seller.sessionToken
    });
    const repeatedFinish = await request(`/api/transactions/${reservedForFinish.body.data?.id}/finish`, {
      method: "POST",
      token: seller.sessionToken
    });

    const reservedForCancel = await request(`/api/products/${productToCancel.id}/reserve`, {
      method: "POST",
      token: buyer.sessionToken
    });
    const editReserved = await request(`/api/my/products/${productToCancel.id}`, {
      method: "PATCH",
      token: seller.sessionToken,
      body: { price: 199 }
    });
    const outsiderCancel = await request(`/api/transactions/${reservedForCancel.body.data?.id}/cancel`, {
      method: "POST",
      token: outsider.sessionToken
    });
    const cancelled = await request(`/api/transactions/${reservedForCancel.body.data?.id}/cancel`, {
      method: "POST",
      token: buyer.sessionToken
    });
    const repeatedCancel = await request(`/api/transactions/${reservedForCancel.body.data?.id}/cancel`, {
      method: "POST",
      token: buyer.sessionToken
    });

    const reservedForDispute = await request(`/api/products/${productToDispute.id}/reserve`, {
      method: "POST",
      token: buyer.sessionToken
    });
    const confirmedForDispute = await request(`/api/transactions/${reservedForDispute.body.data?.id}/confirm`, {
      method: "POST",
      token: seller.sessionToken
    });
    const outsiderDispute = await request(`/api/transactions/${reservedForDispute.body.data?.id}/dispute`, {
      method: "POST",
      token: outsider.sessionToken,
      body: { reason: "无关用户不应成功" }
    });
    const emptyDispute = await request(`/api/transactions/${reservedForDispute.body.data?.id}/dispute`, {
      method: "POST",
      token: buyer.sessionToken,
      body: { reason: "" }
    });
    const disputed = await request(`/api/transactions/${reservedForDispute.body.data?.id}/dispute`, {
      method: "POST",
      token: buyer.sessionToken,
      body: { reason: "商品实际状态与描述不符" }
    });
    const repeatedDispute = await request(`/api/transactions/${reservedForDispute.body.data?.id}/dispute`, {
      method: "POST",
      token: seller.sessionToken,
      body: { reason: "重复发起争议" }
    });
    const finalSellerProducts = await request("/api/my/products", { token: seller.sessionToken });

    const stored = await pool
      .request()
      .input("finishProduct", sql.NVarChar(40), productToFinish.id)
      .input("cancelProduct", sql.NVarChar(40), productToCancel.id)
      .input("disputeProduct", sql.NVarChar(40), productToDispute.id)
      .query(`
        SELECT ExternalId, StatusName FROM dbo.Products
        WHERE ExternalId IN (@finishProduct, @cancelProduct, @disputeProduct);
        SELECT COUNT(*) AS TransactionCount
        FROM dbo.Transactions AS t
        INNER JOIN dbo.Products AS p ON p.ProductId = t.ProductId
        WHERE p.ExternalId IN (@finishProduct, @cancelProduct, @disputeProduct);
      `);
    const statusById = Object.fromEntries(stored.recordsets[0].map((row) => [row.ExternalId, row.StatusName]));
    const finalStatuses = new Set((finalSellerProducts.body.data || []).filter((item) => productIds.includes(item.id)).map((item) => item.status));

    const checks = {
      authenticationRequired: unauthenticatedProducts.status === 401 && unauthenticatedTransactions.status === 401,
      ownerProductsOnly:
        initialSellerProducts.status === 200 &&
        productIds.every((id) => initialSellerProducts.body.data.some((item) => item.id === id)) &&
        initialBuyerProducts.status === 200 &&
        initialBuyerProducts.body.data.every((item) => !productIds.includes(item.id)),
      ownerCanEdit:
        updated.status === 200 && updated.body.data?.name === "已修改商品名称" && updated.body.data?.description === "已修改商品描述" && updated.body.data?.price === 288,
      otherUserCannotEdit: unauthorizedUpdate.status === 403,
      sellerCannotReserveOwnProduct: selfReserve.status === 400,
      otherUserCannotTakeOffline: unauthorizedOffline.status === 403,
      ownerCanTakeOffline: offline.status === 200 && offline.body.data?.status === "offline",
      ownerCanRelist: relisted.status === 200 && relisted.body.data?.status === "on_sale" && offlineAgain.status === 200,
      ownerCanDeleteOfflineRecord: deleted.status === 200 && deleted.body.data?.deleted === true,
      reserveCreatesPendingTrade: reservedForFinish.status === 200 && reservedForFinish.body.data?.status === "pending",
      duplicateReserveRejected: duplicateReserve.status === 409,
      transactionRoles:
        buyerTransactions.body.data?.some((trade) => trade.id === reservedForFinish.body.data?.id && trade.role === "buyer") &&
        sellerTransactions.body.data?.some((trade) => trade.id === reservedForFinish.body.data?.id && trade.role === "seller"),
      onlySellerCanConfirm: buyerConfirm.status === 403 && confirmed.status === 200 && confirmed.body.data?.status === "confirmed" && Boolean(confirmed.body.data?.confirmedAt),
      confirmationRequiredBeforeFinish: finishBeforeConfirm.status === 409,
      repeatedConfirmRejected: repeatedConfirm.status === 409,
      onlySellerCanFinish: buyerFinish.status === 403 && finished.status === 200 && finished.body.data?.status === "finished",
      repeatedFinishRejected: repeatedFinish.status === 409,
      reservedProductCannotBeEdited: editReserved.status === 409,
      outsiderCannotCancel: outsiderCancel.status === 403,
      buyerCanCancel: cancelled.status === 200 && cancelled.body.data?.status === "cancelled",
      repeatedCancelRejected: repeatedCancel.status === 409,
      disputeWorkflow:
        confirmedForDispute.status === 200 &&
        outsiderDispute.status === 403 &&
        emptyDispute.status === 400 &&
        disputed.status === 200 &&
        disputed.body.data?.status === "disputed" &&
        disputed.body.data?.disputeReason === "商品实际状态与描述不符" &&
        Boolean(disputed.body.data?.disputedAt) &&
        repeatedDispute.status === 409,
      productStatusTransitions:
        statusById[productToFinish.id] === "sold" && statusById[productToCancel.id] === "on_sale" && statusById[productToDispute.id] === "reserved" && stored.recordsets[1][0].TransactionCount === 3,
      allOwnerStatusesReturned: finalStatuses.has("sold") && finalStatuses.has("on_sale") && finalStatuses.has("reserved") && finalStatuses.has("offline")
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ ok, checks }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    if (productIds.length) {
      const cleanup = pool.request();
      productIds.forEach((id, index) => cleanup.input(`product${index}`, sql.NVarChar(40), id));
      const placeholders = productIds.map((_, index) => `@product${index}`).join(", ");
      await cleanup.query(`
        DELETE t FROM dbo.Transactions AS t INNER JOIN dbo.Products AS p ON p.ProductId = t.ProductId
        WHERE p.ExternalId IN (${placeholders});
        DELETE FROM dbo.Products WHERE ExternalId IN (${placeholders});
      `);
    }
    if (userIds.length) {
      const cleanup = pool.request();
      userIds.forEach((id, index) => cleanup.input(`user${index}`, sql.NVarChar(40), id));
      const placeholders = userIds.map((_, index) => `@user${index}`).join(", ");
      await cleanup.query(`DELETE FROM dbo.Users WHERE ExternalId IN (${placeholders});`);
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
