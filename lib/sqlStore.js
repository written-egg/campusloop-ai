const sql = require("mssql");

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
      WHERE UserName = @name AND Campus = @campus
      ORDER BY CreatedAt DESC;
    `);
  if (existing.recordset[0]) return mapUser(existing.recordset[0]);

  const externalId = `u${Date.now()}`;
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

async function ensureCategory(pool, categoryName) {
  const name = String(categoryName || "其他").trim() || "其他";
  const result = await pool
    .request()
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

async function resolveSeller(pool, input) {
  if (input.sellerId) {
    const seller = await pool
      .request()
      .input("sellerId", sql.NVarChar(40), String(input.sellerId))
      .query("SELECT TOP (1) UserId FROM dbo.Users WHERE ExternalId = @sellerId;");
    if (seller.recordset[0]) return seller.recordset[0].UserId;
  }
  const fallback = await pool.request().query("SELECT TOP (1) UserId FROM dbo.Users ORDER BY UserId ASC;");
  if (fallback.recordset[0]) return fallback.recordset[0].UserId;
  const user = await createUser({ name: input.sellerName || "林同学", campus: input.campus || "南校区" });
  const created = await pool
    .request()
    .input("externalId", sql.NVarChar(40), user.id)
    .query("SELECT UserId FROM dbo.Users WHERE ExternalId = @externalId;");
  return created.recordset[0].UserId;
}

async function createProduct(input) {
  const pool = await getPool();
  const externalId = `p${Date.now()}`;
  const categoryId = await ensureCategory(pool, input.category);
  const sellerId = await resolveSeller(pool, input);
  const image =
    input.image || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80";

  const inserted = await pool
    .request()
    .input("externalId", sql.NVarChar(40), externalId)
    .input("sellerId", sql.Int, sellerId)
    .input("categoryId", sql.Int, categoryId)
    .input("name", sql.NVarChar(120), String(input.name || input.title || "未命名商品").slice(0, 80))
    .input("description", sql.NVarChar(800), input.description || null)
    .input("price", sql.Decimal(10, 2), Number(input.price || 99))
    .input("originalPrice", sql.Decimal(10, 2), input.originalPrice == null ? null : Number(input.originalPrice))
    .input("condition", sql.NVarChar(30), input.condition || "九成新")
    .input("tags", sql.NVarChar(300), normalizeTags(input.tags || ["同校自提"]))
    .query(`
      INSERT INTO dbo.Products (
        ExternalId,
        SellerId,
        CategoryId,
        ProductName,
        Description,
        Price,
        OriginalPrice,
        ConditionLabel,
        Tags,
        Score,
        Views,
        TrustScore
      )
      OUTPUT inserted.ProductId
      VALUES (
        @externalId,
        @sellerId,
        @categoryId,
        @name,
        @description,
        @price,
        @originalPrice,
        @condition,
        @tags,
        4.5,
        0,
        90
      );
    `);

  await pool
    .request()
    .input("productId", sql.Int, inserted.recordset[0].ProductId)
    .input("image", sql.NVarChar(300), image)
    .query(`
      INSERT INTO dbo.ProductImages (ProductId, ImageUrl, SortOrder, IsCover)
      VALUES (@productId, @image, 1, 1);
    `);

  const result = await pool
    .request()
    .input("externalId", sql.NVarChar(40), externalId)
    .query("SELECT * FROM dbo.ActiveProductView WHERE ExternalId = @externalId;");
  return mapProduct(result.recordset[0]);
}

module.exports = {
  isSqlEnabled,
  listProducts,
  listUsers,
  createUser,
  createProduct
};
