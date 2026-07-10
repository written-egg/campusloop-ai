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
    category: row.CategoryName,
    price: Number(row.Price),
    originalPrice: row.OriginalPrice == null ? undefined : Number(row.OriginalPrice),
    condition: row.ConditionLabel,
    tags: splitTags(row.Tags),
    score: Number(row.Score || 4.5),
    views: Number(row.Views || 0),
    trust: Number(row.TrustScore || 90),
    image: row.CoverImageUrl || "",
    sellerName: row.SellerName,
    campus: row.Campus,
    createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : row.CreatedAt
  };
}

function mapUser(row) {
  return {
    id: row.ExternalId,
    name: row.UserName,
    campus: row.Campus,
    trustScore: Number(row.TrustScore || 80),
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
  const result = await pool.request().query(`
    SELECT
      ExternalId,
      ProductName,
      CategoryName,
      Price,
      OriginalPrice,
      ConditionLabel,
      Tags,
      Score,
      Views,
      TrustScore,
      SellerName,
      Campus,
      CoverImageUrl,
      CreatedAt
    FROM dbo.ActiveProductView
    ORDER BY CreatedAt DESC;
  `);
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
               inserted.TrustScore, inserted.CreatedAt
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
      SELECT ExternalId, LoginName, PasswordHash, UserName, Campus, TrustScore, CreatedAt
      FROM dbo.Users
      WHERE LoginName = @loginName;
    `);
  const row = result.recordset[0];
  if (!row || !row.PasswordHash || !(await bcrypt.compare(password, row.PasswordHash))) {
    throw httpError(401, "账号或密码错误。");
  }
  return mapAuthUser(row);
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

    const result = await new sql.Request(transaction)
      .input("externalId", sql.NVarChar(40), externalId)
      .query("SELECT * FROM dbo.ActiveProductView WHERE ExternalId = @externalId;");
    await transaction.commit();
    return mapProduct(result.recordset[0]);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  isSqlEnabled,
  getPool,
  listProducts,
  listUsers,
  createUser,
  registerAccount,
  loginAccount,
  createProduct
};
