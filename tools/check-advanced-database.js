require("dotenv").config({ quiet: true });

const sql = require("mssql");
const sqlStore = require("../lib/sqlStore");

async function main() {
  const pool = await sqlStore.getPool();
  const transaction = new sql.Transaction(pool);
  const suffix = Date.now().toString();
  const sellerId = `test_seller_${suffix}`;
  const buyerId = `test_buyer_${suffix}`;
  const productId = `test_product_${suffix}`;

  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    request.input("sellerId", sql.NVarChar(40), sellerId);
    request.input("buyerId", sql.NVarChar(40), buyerId);
    request.input("productId", sql.NVarChar(40), productId);
    const result = await request.batch(`
      EXEC dbo.CreateOrGetUser @ExternalId = @sellerId, @UserName = N'测试卖家', @Campus = N'测试校区';
      EXEC dbo.CreateOrGetUser @ExternalId = @buyerId, @UserName = N'测试买家', @Campus = N'测试校区';

      EXEC dbo.CreateProduct
          @ExternalId = @productId,
          @SellerExternalId = @sellerId,
          @CategoryName = N'其他',
          @ProductName = N'高级对象测试商品',
          @Price = 10,
          @OriginalPrice = 100,
          @ConditionLabel = N'九成新',
          @ImageUrl = N'/assets/products/camera.jpg';

      DECLARE @RiskCount INT = (
          SELECT COUNT(*) FROM dbo.RiskLogs
          WHERE ProductId = (SELECT ProductId FROM dbo.Products WHERE ExternalId = @productId)
            AND RuleCode = N'price-below-50-percent'
      );

      EXEC dbo.CreateTransaction @ProductExternalId = @productId, @BuyerExternalId = @buyerId, @FinalPrice = 10;
      DECLARE @TransactionId INT = (
          SELECT TOP (1) TransactionId FROM dbo.Transactions
          WHERE ProductId = (SELECT ProductId FROM dbo.Products WHERE ExternalId = @productId)
          ORDER BY TransactionId DESC
      );
      DECLARE @ReservedStatus NVARCHAR(20) = (SELECT StatusName FROM dbo.Products WHERE ExternalId = @productId);

      UPDATE dbo.Transactions SET TradeStatus = N'finished' WHERE TransactionId = @TransactionId;

      SELECT
          @RiskCount AS RiskCount,
          @ReservedStatus AS ReservedStatus,
          (SELECT StatusName FROM dbo.Products WHERE ExternalId = @productId) AS FinishedProductStatus,
          (SELECT TradeStatus FROM dbo.Transactions WHERE TransactionId = @TransactionId) AS FinishedTradeStatus,
          (SELECT FinishedAt FROM dbo.Transactions WHERE TransactionId = @TransactionId) AS FinishedAt;
    `);

    const row = result.recordsets[result.recordsets.length - 1][0];
    const checks = {
      abnormalPriceTrigger: row.RiskCount === 1,
      createTransactionProcedure: row.ReservedStatus === "reserved",
      transactionStatusTrigger: row.FinishedProductStatus === "sold" && row.FinishedTradeStatus === "finished",
      finishedTimestampTrigger: row.FinishedAt instanceof Date
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ ok, checks }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    await transaction.rollback();
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
