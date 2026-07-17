require("dotenv").config({ quiet: true });

const sql = require("mssql");
const sqlStore = require("../lib/sqlStore");

async function main() {
  if (!sqlStore.isSqlEnabled()) throw new Error("请先在本地 .env 中配置数据库连接。");
  const pool = await sqlStore.getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let ruleCheck;
  try {
    ruleCheck = await new sql.Request(transaction).query(`
      DECLARE @Suffix NVARCHAR(20) = REPLACE(CONVERT(NVARCHAR(36), NEWID()), N'-', N'');
      DECLARE @UserExternalId NVARCHAR(40) = CONCAT(N'risk-user-', @Suffix);
      DECLARE @ProductExternalId NVARCHAR(40) = CONCAT(N'risk-product-', @Suffix);
      DECLARE @CategoryId INT = (SELECT TOP (1) CategoryId FROM dbo.Categories ORDER BY CategoryId);

      INSERT INTO dbo.Users (ExternalId, UserName, Campus, CreatedAt)
      VALUES (@UserExternalId, N'风险规则测试用户', N'测试校区', SYSUTCDATETIME());
      DECLARE @UserId INT = SCOPE_IDENTITY();

      INSERT INTO dbo.Products (
        ExternalId, SellerId, CategoryId, ProductName, Description, Price,
        OriginalPrice, ConditionLabel, Tags, Score, Views, TrustScore
      ) VALUES (
        @ProductExternalId, @UserId, @CategoryId, N'风险规则测试商品',
        N'请加微信后使用支付宝线下转账', 3500, 10000, N'九成新', N'测试', 4.5, 0, 90
      );
      DECLARE @ProductId INT = SCOPE_IDENTITY();

      SELECT RuleCode FROM dbo.RiskLogs WHERE ProductId = @ProductId;
    `);
  } finally {
    await transaction.rollback();
  }
  const actualRules = new Set(ruleCheck.recordset.map((row) => row.RuleCode));
  const expectedRules = ["price-below-50-percent", "off-platform-contact", "new-account-high-value"];
  for (const rule of expectedRules) {
    if (!actualRules.has(rule)) throw new Error(`发布风控规则未触发：${rule}`);
  }

  const result = await pool.request().query(`
    SELECT
      SUM(CASE WHEN RuleCode=N'seed-demo' THEN 1 ELSE 0 END) AS DemoCount,
      SUM(CASE WHEN RuleCode=N'price-below-50-percent' THEN 1 ELSE 0 END) AS PriceRiskCount,
      SUM(CASE WHEN RuleCode=N'off-platform-contact' THEN 1 ELSE 0 END) AS ContentRiskCount,
      SUM(CASE WHEN RuleCode=N'new-account-high-value' THEN 1 ELSE 0 END) AS AccountRiskCount,
      SUM(CASE WHEN RuleCode=N'ai-authenticity-risk' THEN 1 ELSE 0 END) AS AiRiskCount
    FROM dbo.RiskLogs;
  `);
  const counts = result.recordset[0];
  if (Number(counts.DemoCount) !== 0) throw new Error("演示风险记录尚未清理。");
  console.log(JSON.stringify({ ok: true, testedRules: expectedRules, ...counts }, null, 2));
  await pool.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
