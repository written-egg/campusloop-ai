const sql = require("mssql");

require("dotenv").config({ quiet: true });

const productName = process.argv[2] || "高数课本";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const pool = await sql.connect({
    server: requiredEnv("DB_SERVER"),
    database: requiredEnv("DB_NAME"),
    user: requiredEnv("DB_USER"),
    password: requiredEnv("DB_PASSWORD"),
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    options: {
      encrypt: String(process.env.DB_ENCRYPT || "false") === "true",
      trustServerCertificate: String(process.env.DB_TRUST_CERT || "true") === "true",
    },
  });

  const result = await pool
    .request()
    .input("productName", sql.NVarChar(100), productName)
    .query(`
      SELECT TOP 5
        p.ExternalId,
        p.ProductName,
        p.Price,
        p.CreatedAt,
        DATALENGTH(i.ImageUrl) AS ImageBytes,
        LEFT(i.ImageUrl, 30) AS ImagePrefix
      FROM dbo.Products p
      LEFT JOIN dbo.ProductImages i ON p.ProductId = i.ProductId
      WHERE p.ProductName = @productName
      ORDER BY p.CreatedAt DESC;
    `);

  console.log(JSON.stringify(result.recordset, null, 2));
  await pool.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
