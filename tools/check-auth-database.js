require("dotenv").config({ quiet: true });

const sqlStore = require("../lib/sqlStore");

async function main() {
  const pool = await sqlStore.getPool();
  const result = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Users' AND COLUMN_NAME IN ('LoginName', 'PasswordHash')) AS AuthColumns,
      (SELECT COUNT(*) FROM sys.views
       WHERE schema_id = SCHEMA_ID('dbo') AND name IN ('ActiveProductView', 'UserTradeSummaryView', 'RiskProductView')) AS CoreViews,
      (SELECT COUNT(*) FROM sys.procedures
       WHERE schema_id = SCHEMA_ID('dbo') AND name IN ('CreateOrGetUser', 'CreateProduct', 'CreateTransaction')) AS CoreProcedures,
      (SELECT COUNT(*) FROM sys.triggers
       WHERE parent_class = 1 AND name IN ('TR_Transactions_UpdateProductStatus', 'TR_Products_LogPublishingRisks')) AS CoreTriggers,
      (SELECT COUNT(*) FROM dbo.Users) AS UserCount,
      (SELECT COUNT(*) FROM dbo.Products) AS ProductCount,
      (SELECT COUNT(*) FROM dbo.ProductImages) AS ProductImageCount;
  `);
  const summary = result.recordset[0];
  const ok = summary.AuthColumns === 2 && summary.CoreViews === 3 && summary.CoreProcedures === 3 && summary.CoreTriggers === 2;
  console.log(JSON.stringify({ ok, ...summary }, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
