const sql = require("mssql");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");

const defaultProductImage =
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80";
const maxImageDataUrlLength = 4 * 1024 * 1024;

function parseServer(rawServer) {
  const value = rawServer || ".\\SQLEXPRESS";
  const parts = value.split("\\");
  if (parts.length < 2) return { server: value };
  return {
    server: parts[0] === "." ? "localhost" : parts[0],
    instanceName: parts.slice(1).join("\\")
  };
}

const parsedServer = parseServer(process.env.DB_SERVER);
const dbPort = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;

const dbConfig = {
  server: parsedServer.server,
  ...(dbPort ? { port: dbPort } : {}),
  database: process.env.DB_NAME || "CampusLoopDB",
  user: process.env.DB_USER || "",
  password: process.env.DB_PASSWORD || "",
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERT !== "false",
    ...(parsedServer.instanceName && !dbPort ? { instanceName: parsedServer.instanceName } : {})
  }
};

let poolPromise = null;

function isSqlEnabled() {
  return Boolean(process.env.DB_USER && process.env.DB_PASSWORD);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.join(",");
  return String(tags || "");
}

function splitTags(tags) {
  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeImage(value) {
  const image = String(value || "").trim();
  if (!image || image.startsWith("blob:")) return defaultProductImage;
  if (image.length > maxImageDataUrlLength) {
    throw httpError(413, "图片过大，请上传 3 MB 以内的图片。");
  }
  if (!/^(\/|https?:\/\/|data:image\/(jpeg|png|webp|gif);base64,)/i.test(image)) {
    throw httpError(400, "图片格式无效，仅支持 JPEG、PNG、WebP 或 GIF。");
  }
  return image;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function newExternalId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 30)}`;
}

function normalizeLoginName(value) {
  const loginName = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{4,30}$/.test(loginName)) {
    throw httpError(400, "账号需为 4-30 位字母、数字或下划线。");
  }
  return loginName;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 6) throw httpError(400, "密码至少需要 6 个字符。");
  if (Buffer.byteLength(password, "utf8") > 72) throw httpError(400, "密码过长，请控制在 72 字节以内。");
  return password;
}

async function getPool() {
  if (!isSqlEnabled()) {
    throw new Error("SQL Server is not configured. Set DB_USER and DB_PASSWORD to enable it.");
  }
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig);
  }
  return poolPromise;
}

function mapProduct(row) {
  return {
    id: row.ExternalId,
    name: row.ProductName,
    description: row.Description || "",
    category: row.CategoryName,
    price: Number(row.Price),
    originalPrice: row.OriginalPrice == null ? undefined : Number(row.OriginalPrice),
    condition: row.ConditionLabel,
    tags: splitTags(row.Tags),
    score: Number(row.Score || 4.5),
    views: Number(row.Views || 0),
    trust: Number(row.TrustScore || 90),
    image: row.CoverImageUrl || "",
    sellerId: row.SellerExternalId,
    sellerName: row.SellerName,
    campus: row.Campus,
    createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : row.CreatedAt
  };
}

function mapManagedProduct(row) {
  return {
    ...mapProduct(row),
    sellerId: row.SellerExternalId,
    status: row.StatusName,
    updatedAt: row.UpdatedAt instanceof Date ? row.UpdatedAt.toISOString() : row.UpdatedAt
  };
}

function mapTransaction(row, currentUserId) {
  const isBuyer = row.BuyerExternalId === currentUserId;
  return {
    id: String(row.TransactionId),
    productId: row.ProductExternalId,
    productName: row.ProductName,
    productImage: row.CoverImageUrl || "",
    finalPrice: Number(row.FinalPrice),
    status: row.TradeStatus,
    role: isBuyer ? "buyer" : "seller",
    buyer: { id: row.BuyerExternalId, name: row.BuyerName },
    seller: { id: row.SellerExternalId, name: row.SellerName },
    createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : row.CreatedAt,
    confirmedAt: row.ConfirmedAt instanceof Date ? row.ConfirmedAt.toISOString() : row.ConfirmedAt,
    finishedAt: row.FinishedAt instanceof Date ? row.FinishedAt.toISOString() : row.FinishedAt,
    cancelledAt: row.CancelledAt instanceof Date ? row.CancelledAt.toISOString() : row.CancelledAt,
    disputedAt: row.DisputedAt instanceof Date ? row.DisputedAt.toISOString() : row.DisputedAt,
    disputeReason: row.DisputeReason || ""
  };
}

const managedProductSelect = `
  SELECT
    p.ExternalId,
    p.ProductName,
    p.Description,
    c.CategoryName,
    p.Price,
    p.OriginalPrice,
    p.ConditionLabel,
    p.Tags,
    p.Score,
    p.Views,
    p.TrustScore,
    p.StatusName,
    u.ExternalId AS SellerExternalId,
    u.UserName AS SellerName,
    u.Campus,
    img.ImageUrl AS CoverImageUrl,
    p.CreatedAt,
    p.UpdatedAt
  FROM dbo.Products AS p
  INNER JOIN dbo.Users AS u ON u.UserId = p.SellerId
  INNER JOIN dbo.Categories AS c ON c.CategoryId = p.CategoryId
  OUTER APPLY (
    SELECT TOP (1) pi.ImageUrl
    FROM dbo.ProductImages AS pi
    WHERE pi.ProductId = p.ProductId
    ORDER BY pi.IsCover DESC, pi.SortOrder ASC, pi.ImageId ASC
  ) AS img
`;

const transactionSelect = `
  SELECT
    t.TransactionId,
    p.ExternalId AS ProductExternalId,
    p.ProductName,
    img.ImageUrl AS CoverImageUrl,
    t.FinalPrice,
    t.TradeStatus,
    t.CreatedAt,
    t.ConfirmedAt,
    t.FinishedAt,
    t.CancelledAt,
    t.DisputedAt,
    t.DisputeReason,
    buyer.ExternalId AS BuyerExternalId,
    buyer.UserName AS BuyerName,
    seller.ExternalId AS SellerExternalId,
    seller.UserName AS SellerName
  FROM dbo.Transactions AS t
  INNER JOIN dbo.Products AS p ON p.ProductId = t.ProductId
  INNER JOIN dbo.Users AS buyer ON buyer.UserId = t.BuyerId
  INNER JOIN dbo.Users AS seller ON seller.UserId = t.SellerId
  OUTER APPLY (
    SELECT TOP (1) pi.ImageUrl
    FROM dbo.ProductImages AS pi
    WHERE pi.ProductId = p.ProductId
    ORDER BY pi.IsCover DESC, pi.SortOrder ASC, pi.ImageId ASC
  ) AS img
`;

function mapUser(row) {
  return {
    id: row.ExternalId,
    name: row.UserName,
    campus: row.Campus,
    trustScore: Number(row.TrustScore || 80),
    role: row.RoleName || "student",
    accountStatus: row.AccountStatus || "active",
    createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : row.CreatedAt
  };
}

function mapAuthUser(row) {
  return {
    ...mapUser(row),
    loginName: row.LoginName
  };
}

async function listProducts() {
  const pool = await getPool();
  const result = await pool.request().query(`${managedProductSelect} WHERE p.StatusName = N'on_sale' ORDER BY p.CreatedAt DESC;`);
  return result.recordset.map(mapProduct);
}

async function listUsers() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT ExternalId, UserName, Campus, TrustScore, CreatedAt
    FROM dbo.Users
    ORDER BY CreatedAt DESC;
  `);
  return result.recordset.map(mapUser);
}

async function createUser(input) {
  const name = String(input.name || "").trim() || "匿名同学";
  const campus = String(input.campus || "").trim() || "未填写校区";
  const pool = await getPool();
  const existing = await pool
    .request()
    .input("name", sql.NVarChar(50), name)
    .input("campus", sql.NVarChar(50), campus)
    .query(`
      SELECT TOP (1) ExternalId, UserName, Campus, TrustScore, CreatedAt
      FROM dbo.Users
      WHERE UserName = @name AND Campus = @campus AND LoginName IS NULL
      ORDER BY CreatedAt DESC;
    `);
  if (existing.recordset[0]) return mapUser(existing.recordset[0]);

  const externalId = newExternalId("u");
  const inserted = await pool
    .request()
    .input("externalId", sql.NVarChar(40), externalId)
    .input("name", sql.NVarChar(50), name)
    .input("campus", sql.NVarChar(50), campus)
    .query(`
      INSERT INTO dbo.Users (ExternalId, UserName, Campus, TrustScore)
      OUTPUT inserted.ExternalId, inserted.UserName, inserted.Campus, inserted.TrustScore, inserted.CreatedAt
      VALUES (@externalId, @name, @campus, 82);
    `);
  return mapUser(inserted.recordset[0]);
}

async function registerAccount(input) {
  const loginName = normalizeLoginName(input.loginName);
  const password = validatePassword(input.password);
  const name = String(input.name || "").trim();
  const campus = String(input.campus || "").trim();
  if (!name || name.length > 50) throw httpError(400, "昵称不能为空且不能超过 50 个字符。");
  if (!campus || campus.length > 50) throw httpError(400, "校区不能为空且不能超过 50 个字符。");

  const pool = await getPool();
  const existing = await pool
    .request()
    .input("loginName", sql.NVarChar(50), loginName)
    .query("SELECT TOP (1) UserId FROM dbo.Users WHERE LoginName = @loginName;");
  if (existing.recordset[0]) throw httpError(409, "该账号已被注册。");

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await pool
      .request()
      .input("externalId", sql.NVarChar(40), newExternalId("u"))
      .input("loginName", sql.NVarChar(50), loginName)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .input("name", sql.NVarChar(50), name)
      .input("campus", sql.NVarChar(50), campus)
      .query(`
        INSERT INTO dbo.Users (ExternalId, LoginName, PasswordHash, UserName, Campus, TrustScore)
        OUTPUT inserted.ExternalId, inserted.LoginName, inserted.UserName, inserted.Campus,
               inserted.TrustScore, inserted.RoleName, inserted.AccountStatus, inserted.CreatedAt
        VALUES (@externalId, @loginName, @passwordHash, @name, @campus, 82);
      `);
    return mapAuthUser(result.recordset[0]);
  } catch (error) {
    if (error.number === 2601 || error.number === 2627) throw httpError(409, "该账号已被注册。");
    throw error;
  }
}

async function loginAccount(input) {
  const loginName = normalizeLoginName(input.loginName);
  const password = validatePassword(input.password);
  const pool = await getPool();
  const result = await pool
    .request()
    .input("loginName", sql.NVarChar(50), loginName)
    .query(`
      SELECT ExternalId, LoginName, PasswordHash, UserName, Campus, TrustScore, RoleName, AccountStatus, CreatedAt
      FROM dbo.Users
      WHERE LoginName = @loginName;
    `);
  const row = result.recordset[0];
  if (!row || !row.PasswordHash || !(await bcrypt.compare(password, row.PasswordHash))) {
    throw httpError(401, "账号或密码错误。");
  }
  if (row.AccountStatus === "disabled") throw httpError(403, "账号已被管理员禁用。" );
  return mapAuthUser(row);
}

async function getUserByExternalId(externalId) {
  const id = String(externalId || "").trim();
  if (!id) return null;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("externalId", sql.NVarChar(40), id)
    .query(`
      SELECT ExternalId, LoginName, UserName, Campus, TrustScore, RoleName, AccountStatus, CreatedAt
      FROM dbo.Users
      WHERE ExternalId = @externalId;
    `);
  return result.recordset[0] ? mapAuthUser(result.recordset[0]) : null;
}

async function ensureCategory(transaction, categoryName) {
  const name = String(categoryName || "其他").trim() || "其他";
  const result = await new sql.Request(transaction)
    .input("categoryName", sql.NVarChar(40), name)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE CategoryName = @categoryName)
      BEGIN
        INSERT INTO dbo.Categories (CategoryName, Description, SortOrder)
        VALUES (@categoryName, N'用户发布商品自动创建分类。', 90);
      END;

      SELECT CategoryId FROM dbo.Categories WHERE CategoryName = @categoryName;
    `);
  return result.recordset[0].CategoryId;
}

async function resolveSeller(transaction, input) {
  const externalId = String(input.sellerId || "").trim();
  if (!externalId) throw httpError(400, "发布商品前必须先登录。");
  const seller = await new sql.Request(transaction)
    .input("sellerId", sql.NVarChar(40), externalId)
    .query("SELECT TOP (1) UserId, LoginName FROM dbo.Users WHERE ExternalId = @sellerId;");
  if (!seller.recordset[0]) throw httpError(400, "卖家账号不存在，请重新登录。");
  if (seller.recordset[0].LoginName && input.authenticatedUserId !== externalId) {
    throw httpError(401, "登录状态无效，请重新登录。");
  }
  return seller.recordset[0].UserId;
}

async function createProduct(input) {
  const pool = await getPool();
  const externalId = newExternalId("p");
  const name = String(input.name || input.title || "").trim();
  const category = String(input.category || "其他").trim() || "其他";
  const description = String(input.description || "").trim();
  const price = Number(input.price);
  const originalPrice = input.originalPrice == null || input.originalPrice === "" ? null : Number(input.originalPrice);
  const condition = String(input.condition || "九成新").trim();
  const tags = normalizeTags(input.tags || ["同校自提"]);
  const image = normalizeImage(input.image);
  if (!name || name.length > 120) throw httpError(400, "商品名称不能为空且不能超过 120 个字符。");
  if (!Number.isFinite(price) || price <= 0 || price > 99999999.99) throw httpError(400, "商品价格必须是有效的正数。");
  if (originalPrice != null && (!Number.isFinite(originalPrice) || originalPrice < 0)) throw httpError(400, "商品原价无效。");
  if (description.length > 800) throw httpError(400, "商品描述不能超过 800 个字符。");
  if (condition.length > 30) throw httpError(400, "商品成色不能超过 30 个字符。");
  if (tags.length > 300) throw httpError(400, "商品标签内容过长。");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const categoryId = await ensureCategory(transaction, category);
    const sellerId = await resolveSeller(transaction, input);
    const inserted = await new sql.Request(transaction)
      .input("externalId", sql.NVarChar(40), externalId)
      .input("sellerId", sql.Int, sellerId)
      .input("categoryId", sql.Int, categoryId)
      .input("name", sql.NVarChar(120), name)
      .input("description", sql.NVarChar(800), description || null)
      .input("price", sql.Decimal(10, 2), price)
      .input("originalPrice", sql.Decimal(10, 2), originalPrice)
      .input("condition", sql.NVarChar(30), condition)
      .input("tags", sql.NVarChar(300), tags)
      .query(`
        INSERT INTO dbo.Products (
          ExternalId, SellerId, CategoryId, ProductName, Description, Price,
          OriginalPrice, ConditionLabel, Tags, Score, Views, TrustScore
        )
        VALUES (
          @externalId, @sellerId, @categoryId, @name, @description, @price,
          @originalPrice, @condition, @tags, 4.5, 0, 90
        );
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS ProductId;
      `);

    await new sql.Request(transaction)
      .input("productId", sql.Int, inserted.recordset[0].ProductId)
      .input("image", sql.NVarChar(sql.MAX), image)
      .query("INSERT INTO dbo.ProductImages (ProductId, ImageUrl, SortOrder, IsCover) VALUES (@productId, @image, 1, 1);");

    await new sql.Request(transaction)
      .input("externalId", sql.NVarChar(40), externalId)
      .query("SELECT ProductId FROM dbo.Products WHERE ExternalId = @externalId;");
    await transaction.commit();
    return getManagedProduct(externalId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getManagedProduct(externalId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("externalId", sql.NVarChar(40), String(externalId || "").trim())
    .query(`${managedProductSelect} WHERE p.ExternalId = @externalId;`);
  return result.recordset[0] ? mapManagedProduct(result.recordset[0]) : null;
}

async function listProductsByOwner(userExternalId) {
  const ownerId = String(userExternalId || "").trim();
  if (!ownerId) throw httpError(401, "请先登录。" );
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ownerId", sql.NVarChar(40), ownerId)
    .query(`${managedProductSelect} WHERE u.ExternalId = @ownerId ORDER BY p.CreatedAt DESC;`);
  return result.recordset.map(mapManagedProduct);
}

async function updateOwnProduct(userExternalId, productExternalId, input) {
  const nameProvided = Object.prototype.hasOwnProperty.call(input, "name");
  const descriptionProvided = Object.prototype.hasOwnProperty.call(input, "description");
  const priceProvided = Object.prototype.hasOwnProperty.call(input, "price");
  if (!nameProvided && !descriptionProvided && !priceProvided) {
    throw httpError(400, "至少提供商品名称、描述或价格中的一项。" );
  }

  const name = nameProvided ? String(input.name || "").trim() : null;
  const description = descriptionProvided ? String(input.description || "").trim() : null;
  const price = priceProvided ? Number(input.price) : null;
  if (nameProvided && (!name || name.length > 120)) throw httpError(400, "商品名称不能为空且不能超过 120 个字符。" );
  if (descriptionProvided && description.length > 800) throw httpError(400, "商品描述不能超过 800 个字符。" );
  if (priceProvided && (!Number.isFinite(price) || price <= 0 || price > 99999999.99)) {
    throw httpError(400, "商品价格必须是有效的正数。" );
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const locked = await new sql.Request(transaction)
      .input("productId", sql.NVarChar(40), String(productExternalId || "").trim())
      .query(`
        SELECT p.ProductId, p.ProductName, p.Description, p.Price, p.StatusName,
               u.ExternalId AS SellerExternalId
        FROM dbo.Products AS p WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.Users AS u ON u.UserId = p.SellerId
        WHERE p.ExternalId = @productId;
      `);
    const product = locked.recordset[0];
    if (!product) throw httpError(404, "商品不存在。" );
    if (product.SellerExternalId !== userExternalId) throw httpError(403, "只能修改自己发布的商品。" );
    if (product.StatusName !== "on_sale") throw httpError(409, "只有在售商品可以编辑。" );

    await new sql.Request(transaction)
      .input("productId", sql.Int, product.ProductId)
      .input("name", sql.NVarChar(120), nameProvided ? name : product.ProductName)
      .input("description", sql.NVarChar(800), descriptionProvided ? description || null : product.Description)
      .input("price", sql.Decimal(10, 2), priceProvided ? price : product.Price)
      .query(`
        UPDATE dbo.Products
        SET ProductName = @name,
            Description = @description,
            Price = @price,
            UpdatedAt = SYSUTCDATETIME()
        WHERE ProductId = @productId;
      `);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  return getManagedProduct(productExternalId);
}

async function takeOwnProductOffline(userExternalId, productExternalId) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const locked = await new sql.Request(transaction)
      .input("productId", sql.NVarChar(40), String(productExternalId || "").trim())
      .query(`
        SELECT p.ProductId, p.StatusName, u.ExternalId AS SellerExternalId
        FROM dbo.Products AS p WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.Users AS u ON u.UserId = p.SellerId
        WHERE p.ExternalId = @productId;
      `);
    const product = locked.recordset[0];
    if (!product) throw httpError(404, "商品不存在。" );
    if (product.SellerExternalId !== userExternalId) throw httpError(403, "只能下架自己发布的商品。" );
    if (product.StatusName !== "on_sale") throw httpError(409, "只有在售商品可以下架。" );

    await new sql.Request(transaction)
      .input("productId", sql.Int, product.ProductId)
      .query("UPDATE dbo.Products SET StatusName = N'offline', UpdatedAt = SYSUTCDATETIME() WHERE ProductId = @productId;");
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  return getManagedProduct(productExternalId);
}

async function getTransactionById(transactionId, currentUserId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("transactionId", sql.Int, Number(transactionId))
    .query(`${transactionSelect} WHERE t.TransactionId = @transactionId;`);
  return result.recordset[0] ? mapTransaction(result.recordset[0], currentUserId) : null;
}

async function reserveProduct(buyerExternalId, productExternalId) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let createdTransactionId = null;
  try {
    const buyerResult = await new sql.Request(transaction)
      .input("buyerId", sql.NVarChar(40), buyerExternalId)
      .query("SELECT UserId FROM dbo.Users WHERE ExternalId = @buyerId;");
    const buyer = buyerResult.recordset[0];
    if (!buyer) throw httpError(401, "登录用户不存在，请重新登录。" );

    const productResult = await new sql.Request(transaction)
      .input("productId", sql.NVarChar(40), String(productExternalId || "").trim())
      .query(`
        SELECT p.ProductId, p.SellerId, p.Price, p.StatusName
        FROM dbo.Products AS p WITH (UPDLOCK, HOLDLOCK)
        WHERE p.ExternalId = @productId;
      `);
    const product = productResult.recordset[0];
    if (!product) throw httpError(404, "商品不存在。" );
    if (product.SellerId === buyer.UserId) throw httpError(400, "不能预订自己发布的商品。" );
    if (product.StatusName !== "on_sale") throw httpError(409, "商品已被预订、售出或下架。" );

    const inserted = await new sql.Request(transaction)
      .input("productId", sql.Int, product.ProductId)
      .input("buyerId", sql.Int, buyer.UserId)
      .input("sellerId", sql.Int, product.SellerId)
      .input("finalPrice", sql.Decimal(10, 2), product.Price)
      .query(`
        INSERT INTO dbo.Transactions (ProductId, BuyerId, SellerId, FinalPrice, TradeStatus)
        VALUES (@productId, @buyerId, @sellerId, @finalPrice, N'pending');
        DECLARE @transactionId INT = SCOPE_IDENTITY();
        UPDATE dbo.Products SET StatusName = N'reserved', UpdatedAt = SYSUTCDATETIME()
        WHERE ProductId = @productId;
        SELECT @transactionId AS TransactionId;
      `);
    createdTransactionId = inserted.recordset[0].TransactionId;
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  return getTransactionById(createdTransactionId, buyerExternalId);
}

async function listTransactionsForUser(userExternalId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.NVarChar(40), userExternalId)
    .query(`
      ${transactionSelect}
      WHERE buyer.ExternalId = @userId OR seller.ExternalId = @userId
      ORDER BY t.CreatedAt DESC, t.TransactionId DESC;
    `);
  return result.recordset.map((row) => mapTransaction(row, userExternalId));
}

async function updateTransactionStatus(userExternalId, transactionId, nextStatus, input = {}) {
  if (!Number.isInteger(Number(transactionId)) || Number(transactionId) <= 0) throw httpError(400, "交易编号无效。" );
  if (!new Set(["confirmed", "finished", "cancelled", "disputed"]).has(nextStatus)) throw httpError(400, "不支持的交易状态。" );
  const disputeReason = String(input.reason || "").trim();
  if (nextStatus === "disputed" && (!disputeReason || disputeReason.length > 500)) {
    throw httpError(400, "争议原因不能为空且不能超过 500 个字符。" );
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const locked = await new sql.Request(transaction)
      .input("transactionId", sql.Int, Number(transactionId))
      .query(`
        SELECT t.TransactionId, t.TradeStatus,
               buyer.ExternalId AS BuyerExternalId,
               seller.ExternalId AS SellerExternalId
        FROM dbo.Transactions AS t WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.Users AS buyer ON buyer.UserId = t.BuyerId
        INNER JOIN dbo.Users AS seller ON seller.UserId = t.SellerId
        WHERE t.TransactionId = @transactionId;
      `);
    const trade = locked.recordset[0];
    if (!trade) throw httpError(404, "交易不存在。" );
    const isBuyer = trade.BuyerExternalId === userExternalId;
    const isSeller = trade.SellerExternalId === userExternalId;
    if (!isBuyer && !isSeller) {
      throw httpError(403, "只有交易双方可以操作此交易。" );
    }
    if (nextStatus === "confirmed" && !isSeller) throw httpError(403, "只有卖家可以确认买家的预订。" );
    if (nextStatus === "finished" && !isSeller) throw httpError(403, "只有卖家可以确认交易完成。" );
    if (nextStatus === "confirmed" && trade.TradeStatus !== "pending") {
      throw httpError(409, trade.TradeStatus === "confirmed" ? "该预订已经确认，请勿重复操作。" : "当前交易状态不允许确认预订。" );
    }
    if (nextStatus === "finished" && trade.TradeStatus !== "confirmed") {
      throw httpError(409, trade.TradeStatus === "finished" ? "该交易已经完成，请勿重复操作。" : "卖家确认预订后才能完成交易。" );
    }
    if (nextStatus === "cancelled" && !new Set(["pending", "confirmed"]).has(trade.TradeStatus)) {
      throw httpError(409, trade.TradeStatus === "cancelled" ? "该交易已经取消，请勿重复操作。" : "当前交易状态不允许取消。" );
    }
    if (nextStatus === "disputed" && trade.TradeStatus !== "confirmed") {
      throw httpError(409, trade.TradeStatus === "disputed" ? "该交易已经发起争议，请勿重复操作。" : "只有已确认的交易可以发起争议。" );
    }
    if (nextStatus === "cancelled" && !isSeller && !isBuyer) {
      throw httpError(403, "只有交易双方可以取消交易。" );
    }

    await new sql.Request(transaction)
      .input("transactionId", sql.Int, trade.TransactionId)
      .input("nextStatus", sql.NVarChar(20), nextStatus)
      .input("disputeReason", sql.NVarChar(500), nextStatus === "disputed" ? disputeReason : null)
      .query("UPDATE dbo.Transactions SET TradeStatus=@nextStatus,DisputeReason=CASE WHEN @nextStatus=N'disputed' THEN @disputeReason ELSE DisputeReason END WHERE TransactionId=@transactionId;");
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  return getTransactionById(transactionId, userExternalId);
}

async function saveAIReport({ userExternalId, productExternalId, reportType, provider, score, result, risk }) {
  if (!new Set(["price", "risk"]).has(reportType)) throw httpError(400, "不支持的 AI 报告类型。" );
  const numericScore = score == null || score === "" ? null : Math.max(0, Math.min(100, Number(score)));
  const resultJson = JSON.stringify(result || {});
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const inserted = await new sql.Request(transaction)
      .input("userExternalId", sql.NVarChar(40), userExternalId || null)
      .input("productExternalId", sql.NVarChar(40), productExternalId || null)
      .input("reportType", sql.NVarChar(30), reportType)
      .input("provider", sql.NVarChar(40), String(provider || "local-fallback").slice(0, 40))
      .input("score", sql.Decimal(5, 2), Number.isFinite(numericScore) ? numericScore : null)
      .input("resultJson", sql.NVarChar(sql.MAX), resultJson)
      .query(`
        DECLARE @UserId INT = (SELECT TOP (1) UserId FROM dbo.Users WHERE ExternalId = @userExternalId);
        DECLARE @ProductId INT = (SELECT TOP (1) ProductId FROM dbo.Products WHERE ExternalId = @productExternalId);
        INSERT INTO dbo.AIReports (ProductId, UserId, ReportType, Provider, Score, ResultJson)
        VALUES (@ProductId, @UserId, @reportType, @provider, @score, @resultJson);
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS ReportId;
      `);
    let riskLogId = null;
    if (risk && new Set(["medium", "high"]).has(risk.level)) {
      const riskInserted = await new sql.Request(transaction)
        .input("userExternalId", sql.NVarChar(40), userExternalId || null)
        .input("productExternalId", sql.NVarChar(40), productExternalId || null)
        .input("riskLevel", sql.NVarChar(20), risk.level)
        .input("message", sql.NVarChar(300), String(risk.message || "AI 风险评估建议人工复核。").slice(0, 300))
        .query(`
          DECLARE @UserId INT = (SELECT TOP (1) UserId FROM dbo.Users WHERE ExternalId = @userExternalId);
          DECLARE @ProductId INT = (SELECT TOP (1) ProductId FROM dbo.Products WHERE ExternalId = @productExternalId);
          INSERT INTO dbo.RiskLogs (ProductId, UserId, RiskType, RiskLevel, Message, RuleCode)
          VALUES (@ProductId, @UserId, N'authenticity', @riskLevel, @message, N'ai-authenticity-risk');
          SELECT CAST(SCOPE_IDENTITY() AS INT) AS RiskLogId;
        `);
      riskLogId = riskInserted.recordset[0].RiskLogId;
    }
    await transaction.commit();
    return { reportId: inserted.recordset[0].ReportId, riskLogId };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function listFavorites(userExternalId) {
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.NVarChar(40), userExternalId).query(`
    SELECT f.FavoriteId, f.CreatedAt AS FavoritedAt, ${managedProductSelect.replace(/^\s*SELECT/i, "").replace(/;?\s*$/, "")}
    INNER JOIN dbo.Favorites AS f ON f.ProductId = p.ProductId
    WHERE u.ExternalId <> @userId AND f.UserId = (SELECT UserId FROM dbo.Users WHERE ExternalId = @userId)
    ORDER BY f.CreatedAt DESC;
  `);
  return result.recordset.map((row) => ({ ...mapManagedProduct(row), favoriteId: row.FavoriteId, favoritedAt: row.FavoritedAt }));
}

async function addFavorite(userExternalId, productExternalId) {
  const pool = await getPool();
  try {
    await pool.request().input("userId", sql.NVarChar(40), userExternalId).input("productId", sql.NVarChar(40), productExternalId).query(`
      DECLARE @UserDbId INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = @userId);
      DECLARE @ProductDbId INT = (SELECT ProductId FROM dbo.Products WHERE ExternalId = @productId);
      IF @ProductDbId IS NULL THROW 51020, N'商品不存在。', 1;
      IF EXISTS (SELECT 1 FROM dbo.Products WHERE ProductId = @ProductDbId AND SellerId = @UserDbId) THROW 51021, N'不能收藏自己发布的商品。', 1;
      INSERT INTO dbo.Favorites (UserId, ProductId) VALUES (@UserDbId, @ProductDbId);
    `);
  } catch (error) {
    if (error.number === 2601 || error.number === 2627) throw httpError(409, "该商品已经收藏。" );
    if (error.number === 51020) throw httpError(404, "商品不存在。" );
    if (error.number === 51021) throw httpError(400, "不能收藏自己发布的商品。" );
    throw error;
  }
  return { productId: productExternalId, favorited: true };
}

async function removeFavorite(userExternalId, productExternalId) {
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.NVarChar(40), userExternalId).input("productId", sql.NVarChar(40), productExternalId).query(`
    DELETE f
    FROM dbo.Favorites AS f
    INNER JOIN dbo.Users AS u ON u.UserId = f.UserId
    INNER JOIN dbo.Products AS p ON p.ProductId = f.ProductId
    WHERE u.ExternalId = @userId AND p.ExternalId = @productId;
    SELECT @@ROWCOUNT AS DeletedCount;
  `);
  if (!result.recordset[0].DeletedCount) throw httpError(404, "收藏记录不存在。" );
  return { productId: productExternalId, favorited: false };
}

async function listConversations(userExternalId) {
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.NVarChar(40), userExternalId).query(`
    DECLARE @CurrentUserId INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = @userId);
    WITH MessagePeers AS (
      SELECT m.*, CASE WHEN m.SenderId = @CurrentUserId THEN m.ReceiverId ELSE m.SenderId END AS PeerId
      FROM dbo.Messages AS m WHERE m.SenderId = @CurrentUserId OR m.ReceiverId = @CurrentUserId
    ), Ranked AS (
      SELECT mp.*, ROW_NUMBER() OVER (PARTITION BY mp.ProductId, mp.PeerId ORDER BY mp.CreatedAt DESC, mp.MessageId DESC) AS rn
      FROM MessagePeers AS mp
    )
    SELECT r.MessageId, p.ExternalId AS ProductId, p.ProductName, img.ImageUrl AS ProductImage,
           peer.ExternalId AS PeerId, peer.UserName AS PeerName, r.Content AS LastMessage, r.CreatedAt,
           (SELECT COUNT(*) FROM dbo.Messages AS unread
            WHERE unread.ProductId = r.ProductId AND unread.SenderId = r.PeerId
              AND unread.ReceiverId = @CurrentUserId AND unread.IsRead = 0) AS UnreadCount
    FROM Ranked AS r
    LEFT JOIN dbo.Products AS p ON p.ProductId = r.ProductId
    LEFT JOIN dbo.Users AS peer ON peer.UserId = r.PeerId
    OUTER APPLY (SELECT TOP (1) ImageUrl FROM dbo.ProductImages WHERE ProductId = p.ProductId ORDER BY IsCover DESC, SortOrder, ImageId) AS img
    WHERE r.rn = 1 ORDER BY r.CreatedAt DESC;
  `);
  return result.recordset.map((row) => ({ id: `${row.ProductId || "general"}:${row.PeerId}`, productId: row.ProductId, productName: row.ProductName, productImage: row.ProductImage || "", peerId: row.PeerId, peerName: row.PeerName, lastMessage: row.LastMessage, unreadCount: Number(row.UnreadCount || 0), createdAt: row.CreatedAt }));
}

async function listMessages(userExternalId, productExternalId, peerExternalId) {
  if (!productExternalId || !peerExternalId) throw httpError(400, "商品和联系人不能为空。" );
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.NVarChar(40), userExternalId).input("productId", sql.NVarChar(40), productExternalId).input("peerId", sql.NVarChar(40), peerExternalId).query(`
    DECLARE @CurrentUserId INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = @userId);
    DECLARE @PeerDbId INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = @peerId);
    DECLARE @ProductDbId INT = (SELECT ProductId FROM dbo.Products WHERE ExternalId = @productId);
    SELECT m.MessageId, p.ExternalId AS ProductId, sender.ExternalId AS SenderId, sender.UserName AS SenderName,
           receiver.ExternalId AS ReceiverId, receiver.UserName AS ReceiverName, m.Content, m.IsRead, m.CreatedAt
    FROM dbo.Messages AS m
    LEFT JOIN dbo.Products AS p ON p.ProductId = m.ProductId
    INNER JOIN dbo.Users AS sender ON sender.UserId = m.SenderId
    INNER JOIN dbo.Users AS receiver ON receiver.UserId = m.ReceiverId
    WHERE m.ProductId = @ProductDbId AND ((m.SenderId = @CurrentUserId AND m.ReceiverId = @PeerDbId) OR (m.SenderId = @PeerDbId AND m.ReceiverId = @CurrentUserId))
    ORDER BY m.CreatedAt, m.MessageId;
  `);
  return result.recordset.map((row) => ({ id: row.MessageId, productId: row.ProductId, senderId: row.SenderId, senderName: row.SenderName, receiverId: row.ReceiverId, receiverName: row.ReceiverName, content: row.Content, isRead: Boolean(row.IsRead), createdAt: row.CreatedAt }));
}

async function sendMessage(userExternalId, input) {
  const productExternalId = String(input.productId || "").trim();
  const receiverExternalId = String(input.receiverId || "").trim();
  const content = String(input.content || "").trim();
  if (!productExternalId || !receiverExternalId) throw httpError(400, "商品和接收者不能为空。" );
  if (!content || content.length > 1000) throw httpError(400, "消息不能为空且不能超过 1000 个字符。" );
  const pool = await getPool();
  try {
    const result = await pool.request().input("senderId", sql.NVarChar(40), userExternalId).input("receiverId", sql.NVarChar(40), receiverExternalId).input("productId", sql.NVarChar(40), productExternalId).input("content", sql.NVarChar(1000), content).query(`
      DECLARE @SenderDbId INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = @senderId);
      DECLARE @ReceiverDbId INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = @receiverId);
      DECLARE @ProductDbId INT, @SellerDbId INT;
      SELECT @ProductDbId = ProductId, @SellerDbId = SellerId FROM dbo.Products WHERE ExternalId = @productId;
      IF @ReceiverDbId IS NULL OR @ProductDbId IS NULL THROW 51030, N'商品或接收者不存在。', 1;
      IF @SenderDbId = @ReceiverDbId THROW 51031, N'不能给自己发送消息。', 1;
      IF @SellerDbId <> @SenderDbId AND @SellerDbId <> @ReceiverDbId THROW 51032, N'消息双方必须包含商品卖家。', 1;
      INSERT INTO dbo.Messages (ProductId, SenderId, ReceiverId, Content)
      OUTPUT inserted.MessageId, inserted.Content, inserted.IsRead, inserted.CreatedAt
      VALUES (@ProductDbId, @SenderDbId, @ReceiverDbId, @content);
    `);
    const row = result.recordset[0];
    return { id: row.MessageId, productId: productExternalId, senderId: userExternalId, receiverId: receiverExternalId, content: row.Content, isRead: Boolean(row.IsRead), createdAt: row.CreatedAt };
  } catch (error) {
    if (error.number === 51030) throw httpError(404, "商品或接收者不存在。" );
    if (error.number === 51031) throw httpError(400, "不能给自己发送消息。" );
    if (error.number === 51032) throw httpError(403, "消息双方必须包含商品卖家。" );
    throw error;
  }
}

async function markMessageRead(userExternalId, messageId) {
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.NVarChar(40), userExternalId).input("messageId", sql.Int, Number(messageId)).query(`
    UPDATE m SET IsRead = 1 FROM dbo.Messages AS m INNER JOIN dbo.Users AS u ON u.UserId = m.ReceiverId
    WHERE m.MessageId = @messageId AND u.ExternalId = @userId;
    SELECT @@ROWCOUNT AS UpdatedCount;
  `);
  if (!result.recordset[0].UpdatedCount) throw httpError(404, "消息不存在或无权操作。" );
  return { id: Number(messageId), isRead: true };
}

async function listAIReports(userExternalId, type = "all") {
  const reportType = String(type || "all").toLowerCase();
  if (!new Set(["all", "price", "risk"]).has(reportType)) throw httpError(400, "不支持的报告筛选类型。" );
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.NVarChar(40), userExternalId).input("reportType", sql.NVarChar(30), reportType).query(`
    SELECT r.ReportId, r.ReportType, r.Provider, r.Score, r.ResultJson, r.CreatedAt, p.ExternalId AS ProductId, p.ProductName
    FROM dbo.AIReports AS r
    INNER JOIN dbo.Users AS u ON u.UserId = r.UserId
    LEFT JOIN dbo.Products AS p ON p.ProductId = r.ProductId
    WHERE u.ExternalId = @userId AND (@reportType = N'all' OR r.ReportType = @reportType)
    ORDER BY r.CreatedAt DESC, r.ReportId DESC;
  `);
  return result.recordset.map((row) => {
    let data = {};
    try { data = JSON.parse(row.ResultJson); } catch { data = { raw: row.ResultJson }; }
    return { id: row.ReportId, type: row.ReportType, provider: row.Provider, score: row.Score == null ? null : Number(row.Score), result: data, productId: row.ProductId, productName: row.ProductName, createdAt: row.CreatedAt };
  });
}

async function getAdminOverview() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT (SELECT COUNT(*) FROM dbo.Users) AS Users,
           (SELECT COUNT(*) FROM dbo.Users WHERE CreatedAt >= CONVERT(date, SYSUTCDATETIME())) AS NewUsersToday,
           (SELECT COUNT(*) FROM dbo.Products WHERE StatusName=N'on_sale') AS OnSaleProducts,
           (SELECT COUNT(*) FROM dbo.Products WHERE StatusName=N'reserved') AS ReservedProducts,
           (SELECT COUNT(*) FROM dbo.Products WHERE StatusName=N'sold') AS SoldProducts,
           (SELECT COUNT(*) FROM dbo.Products WHERE StatusName=N'offline') AS OfflineProducts,
           (SELECT COUNT(*) FROM dbo.Transactions WHERE TradeStatus IN (N'pending',N'confirmed',N'disputed')) AS PendingTransactions,
           (SELECT COUNT(*) FROM dbo.Transactions WHERE TradeStatus=N'finished') AS FinishedTransactions,
           (SELECT COUNT(*) FROM dbo.RiskLogs WHERE RiskLevel=N'high' AND ReviewStatus=N'pending') AS PendingHighRisks,
           (SELECT COUNT(*) FROM dbo.RiskLogs WHERE ReviewStatus=N'pending') AS PendingRisks,
           (SELECT COUNT(*) FROM dbo.AIReports WHERE Provider=N'deepseek') AS DeepSeekReports,
           (SELECT COUNT(*) FROM dbo.AIReports WHERE Provider=N'local-fallback') AS FallbackReports;
  `);
  const row = result.recordset[0];
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key[0].toLowerCase() + key.slice(1), Number(value || 0)]));
}

async function listAdminUsers({ query = "", status = "all" } = {}) {
  const pool = await getPool();
  const result = await pool.request().input("query", sql.NVarChar(80), `%${String(query).trim()}%`).input("status", sql.NVarChar(20), status).query(`
    SELECT u.ExternalId AS id,u.LoginName AS loginName,u.UserName AS name,u.Campus AS campus,u.TrustScore AS trustScore,
           u.RoleName AS role,u.AccountStatus AS accountStatus,u.CreatedAt AS createdAt,
           (SELECT COUNT(*) FROM dbo.Products p WHERE p.SellerId=u.UserId) AS productCount,
           (SELECT COUNT(*) FROM dbo.Transactions t WHERE t.BuyerId=u.UserId OR t.SellerId=u.UserId) AS transactionCount,
           (SELECT COUNT(*) FROM dbo.RiskLogs r WHERE r.UserId=u.UserId) AS riskCount
    FROM dbo.Users u
    WHERE (@status=N'all' OR u.AccountStatus=@status)
      AND (@query=N'%%' OR u.ExternalId LIKE @query OR u.LoginName LIKE @query OR u.UserName LIKE @query OR u.Campus LIKE @query)
    ORDER BY u.CreatedAt DESC;
  `);
  return result.recordset;
}

async function setAdminUserStatus(adminExternalId, targetExternalId, accountStatus, reason) {
  if (!new Set(["active", "disabled"]).has(accountStatus)) throw httpError(400, "账号状态无效。" );
  if (adminExternalId === targetExternalId) throw httpError(400, "管理员不能禁用或恢复自己的账号。" );
  const note = String(reason || "").trim();
  if (!note || note.length > 300) throw httpError(400, "操作原因不能为空且不能超过 300 个字符。" );
  const pool = await getPool(); const tx = new sql.Transaction(pool); await tx.begin();
  try {
    const r = await new sql.Request(tx).input("target",sql.NVarChar(40),targetExternalId).input("status",sql.NVarChar(20),accountStatus).query("UPDATE dbo.Users SET AccountStatus=@status,UpdatedAt=SYSUTCDATETIME() WHERE ExternalId=@target AND AccountStatus IN (N'active',N'disabled'); SELECT @@ROWCOUNT AS n;");
    if (!r.recordset[0].n) throw httpError(409, "用户不存在或账号已注销，不能修改状态。" );
    await new sql.Request(tx).input("admin",sql.NVarChar(40),adminExternalId).input("target",sql.NVarChar(50),targetExternalId).input("reason",sql.NVarChar(300),note).input("action",sql.NVarChar(40),accountStatus === "disabled" ? "disable_user" : "enable_user").query("INSERT dbo.AdminAuditLogs(AdminUserId,ActionType,TargetType,TargetId,Reason) SELECT UserId,@action,N'user',@target,@reason FROM dbo.Users WHERE ExternalId=@admin;");
    await tx.commit(); return { id: targetExternalId, accountStatus };
  } catch(e) { await tx.rollback(); throw e; }
}

async function listAdminProducts({ query = "", status = "all" } = {}) {
  const pool = await getPool();
  const result = await pool.request().input("query",sql.NVarChar(100),`%${String(query).trim()}%`).input("status",sql.NVarChar(20),status).query(`
    SELECT p.ExternalId AS id,p.ProductName AS name,p.Price AS price,p.StatusName AS status,p.ModerationStatus AS moderationStatus,
           p.AdminOfflineReason AS adminOfflineReason,p.CreatedAt AS createdAt,u.ExternalId AS sellerId,u.UserName AS sellerName,c.CategoryName AS category,
           (SELECT COUNT(*) FROM dbo.RiskLogs r WHERE r.ProductId=p.ProductId) AS riskCount
    FROM dbo.Products p JOIN dbo.Users u ON u.UserId=p.SellerId JOIN dbo.Categories c ON c.CategoryId=p.CategoryId
    WHERE (@status=N'all' OR p.StatusName=@status) AND (@query=N'%%' OR p.ExternalId LIKE @query OR p.ProductName LIKE @query OR u.UserName LIKE @query)
    ORDER BY p.CreatedAt DESC;
  `);
  return result.recordset;
}

async function moderateProduct(adminExternalId, productExternalId, action, reason) {
  if (!new Set(["offline", "restore"]).has(action)) throw httpError(400, "商品管理操作无效。" );
  const note=String(reason||"").trim(); if(!note||note.length>300) throw httpError(400,"操作原因不能为空且不能超过 300 个字符。" );
  const pool=await getPool(); const tx=new sql.Transaction(pool); await tx.begin();
  try {
    const request=new sql.Request(tx).input("product",sql.NVarChar(40),productExternalId).input("reason",sql.NVarChar(300),note);
    const r=action==="offline" ? await request.query("UPDATE dbo.Products SET StatusName=N'offline',ModerationStatus=N'admin_offline',AdminOfflineReason=@reason,UpdatedAt=SYSUTCDATETIME() WHERE ExternalId=@product AND StatusName=N'on_sale'; SELECT @@ROWCOUNT AS n;") : await request.query("UPDATE dbo.Products SET StatusName=N'on_sale',ModerationStatus=N'normal',AdminOfflineReason=NULL,UpdatedAt=SYSUTCDATETIME() WHERE ExternalId=@product AND StatusName=N'offline' AND ModerationStatus=N'admin_offline'; SELECT @@ROWCOUNT AS n;");
    if(!r.recordset[0].n) throw httpError(409, action==="offline"?"只有在售商品可以强制下架。":"只有管理员下架的商品可以恢复。" );
    await new sql.Request(tx).input("admin",sql.NVarChar(40),adminExternalId).input("target",sql.NVarChar(50),productExternalId).input("reason",sql.NVarChar(300),note).input("action",sql.NVarChar(40),action==="offline"?"admin_offline_product":"restore_product").query("INSERT dbo.AdminAuditLogs(AdminUserId,ActionType,TargetType,TargetId,Reason) SELECT UserId,@action,N'product',@target,@reason FROM dbo.Users WHERE ExternalId=@admin;");
    await tx.commit(); return {id:productExternalId,status:action==="offline"?"offline":"on_sale",moderationStatus:action==="offline"?"admin_offline":"normal"};
  } catch(e){await tx.rollback();throw e;}
}

async function listAdminRisks({ status="all", level="all" }={}) {
  const pool=await getPool(); const r=await pool.request().input("status",sql.NVarChar(20),status).input("level",sql.NVarChar(20),level).query(`
    SELECT r.RiskLogId AS id,r.RiskType AS type,r.RiskLevel AS level,r.Message AS message,r.RuleCode AS ruleCode,
           r.ReviewStatus AS reviewStatus,r.ReviewNote AS reviewNote,r.CreatedAt AS createdAt,r.ReviewedAt AS reviewedAt,
           p.ExternalId AS productId,p.ProductName AS productName,u.ExternalId AS userId,u.UserName AS userName,reviewer.UserName AS reviewerName
    FROM dbo.RiskLogs r LEFT JOIN dbo.Products p ON p.ProductId=r.ProductId LEFT JOIN dbo.Users u ON u.UserId=COALESCE(r.UserId,p.SellerId) LEFT JOIN dbo.Users reviewer ON reviewer.UserId=r.ReviewedBy
    WHERE (@status=N'all' OR r.ReviewStatus=@status) AND (@level=N'all' OR r.RiskLevel=@level) ORDER BY r.CreatedAt DESC;
  `); return r.recordset;
}

async function reviewRisk(adminExternalId,riskId,reviewStatus,note) {
  if(!new Set(["confirmed","false_positive","resolved"]).has(reviewStatus)) throw httpError(400,"风险处理状态无效。" );
  const reviewNote=String(note||"").trim(); if(!reviewNote||reviewNote.length>500) throw httpError(400,"审核意见不能为空且不能超过 500 个字符。" );
  const pool=await getPool();const tx=new sql.Transaction(pool);await tx.begin();
  try { const r=await new sql.Request(tx).input("admin",sql.NVarChar(40),adminExternalId).input("riskId",sql.Int,Number(riskId)).input("status",sql.NVarChar(20),reviewStatus).input("note",sql.NVarChar(500),reviewNote).query("UPDATE r SET ReviewStatus=@status,ReviewNote=@note,ReviewedBy=u.UserId,ReviewedAt=SYSUTCDATETIME() FROM dbo.RiskLogs r CROSS JOIN dbo.Users u WHERE r.RiskLogId=@riskId AND u.ExternalId=@admin; SELECT @@ROWCOUNT AS n;"); if(!r.recordset[0].n) throw httpError(404,"风险记录不存在。" ); await new sql.Request(tx).input("admin",sql.NVarChar(40),adminExternalId).input("target",sql.NVarChar(50),String(riskId)).input("reason",sql.NVarChar(300),reviewNote.slice(0,300)).query("INSERT dbo.AdminAuditLogs(AdminUserId,ActionType,TargetType,TargetId,Reason) SELECT UserId,N'review_risk',N'risk',@target,@reason FROM dbo.Users WHERE ExternalId=@admin;"); await tx.commit();return{id:Number(riskId),reviewStatus}; } catch(e){await tx.rollback();throw e;}
}

async function listAdminAuditLogs() { const pool=await getPool(); const r=await pool.request().query("SELECT TOP (200) a.AuditLogId AS id,u.ExternalId AS adminId,u.UserName AS adminName,a.ActionType AS actionType,a.TargetType AS targetType,a.TargetId AS targetId,a.Reason AS reason,a.DetailJson AS detailJson,a.CreatedAt AS createdAt FROM dbo.AdminAuditLogs a JOIN dbo.Users u ON u.UserId=a.AdminUserId ORDER BY a.CreatedAt DESC,a.AuditLogId DESC;"); return r.recordset; }

async function updateAccountProfile(userExternalId, input) {
  const name=String(input.name||"").trim(),campus=String(input.campus||"").trim();
  if(!name||name.length>50) throw httpError(400,"昵称不能为空且不能超过 50 个字符。" );
  if(!campus||campus.length>50) throw httpError(400,"校区不能为空且不能超过 50 个字符。" );
  const pool=await getPool(); const r=await pool.request().input("id",sql.NVarChar(40),userExternalId).input("name",sql.NVarChar(50),name).input("campus",sql.NVarChar(50),campus).query("UPDATE dbo.Users SET UserName=@name,Campus=@campus,UpdatedAt=SYSUTCDATETIME() WHERE ExternalId=@id AND AccountStatus=N'active'; SELECT @@ROWCOUNT AS n;");
  if(!r.recordset[0].n) throw httpError(404,"账号不存在或不可修改。" ); return getUserByExternalId(userExternalId);
}

async function changeAccountPassword(userExternalId,input) {
  const currentPassword=validatePassword(input.currentPassword),newPassword=validatePassword(input.newPassword);
  if(currentPassword===newPassword) throw httpError(400,"新密码不能与当前密码相同。" );
  const pool=await getPool(); const found=await pool.request().input("id",sql.NVarChar(40),userExternalId).query("SELECT PasswordHash,AccountStatus FROM dbo.Users WHERE ExternalId=@id;"); const row=found.recordset[0];
  if(!row||row.AccountStatus!=="active") throw httpError(404,"账号不存在或不可修改。" );
  if(!row.PasswordHash||!(await bcrypt.compare(currentPassword,row.PasswordHash))) throw httpError(401,"当前密码错误。" );
  const hash=await bcrypt.hash(newPassword,10); await pool.request().input("id",sql.NVarChar(40),userExternalId).input("hash",sql.NVarChar(255),hash).query("UPDATE dbo.Users SET PasswordHash=@hash,UpdatedAt=SYSUTCDATETIME() WHERE ExternalId=@id;"); return {passwordChanged:true};
}

async function deleteAccount(userExternalId,input) {
  const password=validatePassword(input.password); const pool=await getPool(); const found=await pool.request().input("id",sql.NVarChar(40),userExternalId).query("SELECT UserId,PasswordHash,AccountStatus FROM dbo.Users WHERE ExternalId=@id;"); const user=found.recordset[0];
  if(!user||user.AccountStatus!=="active") throw httpError(404,"账号不存在或不可注销。" );
  if(!user.PasswordHash||!(await bcrypt.compare(password,user.PasswordHash))) throw httpError(401,"密码错误，无法注销账号。" );
  const pending=await pool.request().input("uid",sql.Int,user.UserId).query("SELECT COUNT(*) AS n FROM dbo.Transactions WHERE (BuyerId=@uid OR SellerId=@uid) AND TradeStatus IN (N'pending',N'confirmed',N'disputed');"); if(pending.recordset[0].n) throw httpError(409,"账号存在待处理交易，请先完成或取消交易。" );
  const tx=new sql.Transaction(pool);await tx.begin();try{await new sql.Request(tx).input("uid",sql.Int,user.UserId).query("UPDATE dbo.Products SET StatusName=N'offline',UpdatedAt=SYSUTCDATETIME() WHERE SellerId=@uid AND StatusName=N'on_sale';");await new sql.Request(tx).input("uid",sql.Int,user.UserId).query("UPDATE dbo.Users SET LoginName=NULL,PasswordHash=NULL,UserName=CONCAT(N'已注销用户',UserId),Campus=N'已注销',AccountStatus=N'deleted',DeletedAt=SYSUTCDATETIME(),UpdatedAt=SYSUTCDATETIME() WHERE UserId=@uid;");await tx.commit();return{deleted:true};}catch(e){await tx.rollback();throw e;}
}

module.exports = {
  isSqlEnabled,
  getPool,
  listProducts,
  listUsers,
  createUser,
  registerAccount,
  loginAccount,
  getUserByExternalId,
  createProduct,
  listProductsByOwner,
  updateOwnProduct,
  takeOwnProductOffline,
  reserveProduct,
  listTransactionsForUser,
  updateTransactionStatus,
  saveAIReport,
  listFavorites,
  addFavorite,
  removeFavorite,
  listConversations,
  listMessages,
  sendMessage,
  markMessageRead,
  listAIReports
  ,getAdminOverview,listAdminUsers,setAdminUserStatus,listAdminProducts,moderateProduct,listAdminRisks,reviewRisk,listAdminAuditLogs
  ,updateAccountProfile,changeAccountPassword,deleteAccount
};
