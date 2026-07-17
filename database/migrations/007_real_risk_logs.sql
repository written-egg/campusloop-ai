USE CampusLoopDB;
GO

DELETE FROM dbo.RiskLogs WHERE RuleCode = N'seed-demo';
GO

CREATE OR ALTER TRIGGER dbo.TR_Products_LogPublishingRisks
ON dbo.Products
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.RiskLogs (ProductId, UserId, RiskType, RiskLevel, Message, RuleCode)
    SELECT i.ProductId, i.SellerId, N'price', N'high',
           N'商品售价低于原价的 50%，建议核对商品状态和价格真实性。',
           N'price-below-50-percent'
    FROM inserted AS i
    WHERE i.OriginalPrice IS NOT NULL
      AND i.OriginalPrice > 0
      AND i.Price < i.OriginalPrice * 0.5
      AND NOT EXISTS (
          SELECT 1 FROM dbo.RiskLogs AS r
          WHERE r.ProductId = i.ProductId AND r.RuleCode = N'price-below-50-percent'
      );

    INSERT INTO dbo.RiskLogs (ProductId, UserId, RiskType, RiskLevel, Message, RuleCode)
    SELECT i.ProductId, i.SellerId, N'content', N'high',
           N'商品描述包含站外联系或转账提示，建议人工审核交易安全性。',
           N'off-platform-contact'
    FROM inserted AS i
    WHERE (
          i.Description LIKE N'%微信%' OR i.Description LIKE N'%加V%'
          OR i.Description LIKE N'%QQ%' OR i.Description LIKE N'%手机号%'
          OR i.Description LIKE N'%支付宝%' OR i.Description LIKE N'%线下转账%'
      )
      AND NOT EXISTS (
          SELECT 1 FROM dbo.RiskLogs AS r
          WHERE r.ProductId = i.ProductId AND r.RuleCode = N'off-platform-contact'
      );

    INSERT INTO dbo.RiskLogs (ProductId, UserId, RiskType, RiskLevel, Message, RuleCode)
    SELECT i.ProductId, i.SellerId, N'account', N'medium',
           N'注册未满 7 天的账号发布高价商品，建议补充凭证并人工复核。',
           N'new-account-high-value'
    FROM inserted AS i
    INNER JOIN dbo.Users AS u ON u.UserId = i.SellerId
    WHERE i.Price >= 3000
      AND u.CreatedAt >= DATEADD(DAY, -7, SYSUTCDATETIME())
      AND NOT EXISTS (
          SELECT 1 FROM dbo.RiskLogs AS r
          WHERE r.ProductId = i.ProductId AND r.RuleCode = N'new-account-high-value'
      );
END;
GO

IF OBJECT_ID(N'dbo.TR_Products_LogAbnormalPrice', N'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_Products_LogAbnormalPrice;
GO

SELECT N'007_real_risk_logs applied' AS MigrationResult;
GO
