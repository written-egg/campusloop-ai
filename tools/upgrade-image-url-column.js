require("dotenv").config({ quiet: true });

const sql = require("mssql");

async function main() {
  const pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost",
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "CampusLoopDB",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT === "true",
      trustServerCertificate: process.env.DB_TRUST_CERT !== "false"
    }
  });

  await pool.request().query(`
    ALTER TABLE dbo.ProductImages
    ALTER COLUMN ImageUrl NVARCHAR(MAX) NOT NULL;
  `);

  const result = await pool.request().query(`
    SELECT DATA_TYPE AS DataType, CHARACTER_MAXIMUM_LENGTH AS MaxLength
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'ProductImages'
      AND COLUMN_NAME = 'ImageUrl';
  `);

  console.log(JSON.stringify(result.recordset[0], null, 2));
  await pool.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
