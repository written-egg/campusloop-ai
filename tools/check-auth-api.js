require("dotenv").config({ quiet: true });

const sql = require("mssql");
const sqlStore = require("../lib/sqlStore");

const baseUrl = process.env.APP_BASE_URL || "http://localhost:5173";

async function post(path, body, sessionToken = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function get(path, sessionToken = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  const pool = await sqlStore.getPool();
  const suffix = Date.now().toString().slice(-10);
  const loginName = `atest_${suffix}`;
  const password = "Campus123!";
  let externalId = null;
  let productExternalId = null;

  try {
    const before = await pool.request().query("SELECT COUNT(*) AS ProductCount FROM dbo.Products;");
    const registered = await post("/api/auth/register", {
      loginName,
      password,
      name: "A接口测试用户",
      campus: "测试校区"
    });
    externalId = registered.body.data?.id || null;
    const sessionToken = registered.body.data?.sessionToken || "";

    const duplicate = await post("/api/auth/register", {
      loginName,
      password,
      name: "A接口测试用户",
      campus: "测试校区"
    });
    const wrongPassword = await post("/api/auth/login", { loginName, password: "Wrong123!" });
    const loggedIn = await post("/api/auth/login", { loginName, password });
    const activeSession = await get("/api/auth/session", sessionToken);
    const unauthenticatedProduct = await post("/api/products", {
      name: "不应由未登录账号发布的商品",
      category: "其他",
      price: 10,
      condition: "九成新",
      sellerId: externalId,
      image: "/assets/products/camera.jpg"
    });
    const validProduct = await post("/api/products", {
      name: "A事务测试商品",
      description: "自动化测试商品描述",
      category: "其他",
      price: 10,
      condition: "九成新",
      sellerId: externalId,
      image: "/assets/products/camera.jpg"
    }, sessionToken);
    productExternalId = validProduct.body.data?.id || null;
    const invalidSeller = await post("/api/products", {
      name: "不应落库的测试商品",
      category: "其他",
      price: 10,
      condition: "九成新",
      sellerId: "missing-seller",
      image: "/assets/products/camera.jpg"
    });

    const stored = await pool
      .request()
      .input("loginName", sql.NVarChar(50), loginName)
      .query("SELECT ExternalId, PasswordHash FROM dbo.Users WHERE LoginName = @loginName;");
    const productStored = await pool
      .request()
      .input("externalId", sql.NVarChar(40), productExternalId)
      .query(`
        SELECT p.ExternalId, p.Description, COUNT(i.ImageId) AS ImageCount
        FROM dbo.Products AS p
        LEFT JOIN dbo.ProductImages AS i ON i.ProductId = p.ProductId
        WHERE p.ExternalId = @externalId
        GROUP BY p.ExternalId, p.Description;
      `);
    const after = await pool.request().query("SELECT COUNT(*) AS ProductCount FROM dbo.Products;");
    const passwordHash = stored.recordset[0]?.PasswordHash || "";

    const checks = {
      register: registered.status === 200 && registered.body.ok === true && Boolean(externalId),
      sessionIssued: sessionToken.length >= 32,
      duplicateRejected: duplicate.status === 409 && duplicate.body.ok === false,
      wrongPasswordRejected: wrongPassword.status === 401 && wrongPassword.body.ok === false,
      login: loggedIn.status === 200 && loggedIn.body.data?.id === externalId,
      activeSessionRestored: activeSession.status === 200 && activeSession.body.data?.id === externalId,
      passwordHashed: passwordHash.startsWith("$2") && passwordHash !== password,
      registeredSellerRequiresSession: unauthenticatedProduct.status === 401 && unauthenticatedProduct.body.ok === false,
      productAndImageCommitted:
        validProduct.status === 200 && productStored.recordset[0]?.ExternalId === productExternalId && productStored.recordset[0]?.ImageCount === 1,
      productDescriptionReturned:
        validProduct.body.data?.description === "自动化测试商品描述" &&
        productStored.recordset[0]?.Description === "自动化测试商品描述",
      invalidSellerRejected: invalidSeller.status === 400 && invalidSeller.body.ok === false,
      invalidProductRolledBack: before.recordset[0].ProductCount + 1 === after.recordset[0].ProductCount
    };
    const loggedOut = await post("/api/auth/logout", {}, sessionToken);
    checks.logout = loggedOut.status === 200 && loggedOut.body.data?.loggedOut === true;
    const expiredSession = await get("/api/auth/session", sessionToken);
    checks.loggedOutSessionRejected = expiredSession.status === 401 && expiredSession.body.ok === false;
    const ok = Object.values(checks).every(Boolean);
    console.log(
      JSON.stringify(
        {
          ok,
          checks,
          ...(!ok
            ? {
                diagnostics: {
                  validProductStatus: validProduct.status,
                  validProductError: validProduct.body.error || null,
                  productExternalId,
                  storedProductRows: productStored.recordset.length,
                  beforeProducts: before.recordset[0].ProductCount,
                  afterProducts: after.recordset[0].ProductCount
                }
              }
            : {})
        },
        null,
        2
      )
    );
    if (!ok) process.exitCode = 1;
  } finally {
    if (productExternalId) {
      await pool
        .request()
        .input("externalId", sql.NVarChar(40), productExternalId)
        .query("DELETE FROM dbo.Products WHERE ExternalId = @externalId;");
    }
    if (externalId) {
      await pool
        .request()
        .input("externalId", sql.NVarChar(40), externalId)
        .query("DELETE FROM dbo.Users WHERE ExternalId = @externalId;");
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
