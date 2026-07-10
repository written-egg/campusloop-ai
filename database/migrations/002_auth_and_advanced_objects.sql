:ON ERROR EXIT

USE CampusLoopDB;
GO

IF COL_LENGTH(N'dbo.Users', N'LoginName') IS NULL
    ALTER TABLE dbo.Users ADD LoginName NVARCHAR(50) NULL;
GO

IF COL_LENGTH(N'dbo.Users', N'PasswordHash') IS NULL
    ALTER TABLE dbo.Users ADD PasswordHash NVARCHAR(255) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Users') AND name = N'UX_Users_LoginName')
    CREATE UNIQUE INDEX UX_Users_LoginName ON dbo.Users(LoginName) WHERE LoginName IS NOT NULL;
GO

CREATE OR ALTER VIEW dbo.UserTradeSummaryView AS
SELECT
    u.UserId,
    u.ExternalId,
    u.UserName,
    u.Campus,
    u.TrustScore,
    COALESCE(sold.TransactionCount, 0) AS SellTransactionCount,
    COALESCE(bought.TransactionCount, 0) AS BuyTransactionCount,
    COALESCE(sold.FinishedAmount, 0) AS SellAmount,
    COALESCE(bought.FinishedAmount, 0) AS BuyAmount
FROM dbo.Users AS u
OUTER APPLY (
    SELECT COUNT(*) AS TransactionCount,
           SUM(CASE WHEN TradeStatus = N'finished' THEN FinalPrice ELSE 0 END) AS FinishedAmount
    FROM dbo.Transactions
    WHERE SellerId = u.UserId
) AS sold
OUTER APPLY (
    SELECT COUNT(*) AS TransactionCount,
           SUM(CASE WHEN TradeStatus = N'finished' THEN FinalPrice ELSE 0 END) AS FinishedAmount
    FROM dbo.Transactions
    WHERE BuyerId = u.UserId
) AS bought;
GO

CREATE OR ALTER VIEW dbo.RiskProductView AS
SELECT
    r.RiskLogId,
    r.RiskType,
    r.RiskLevel,
    r.Message,
    r.RuleCode,
    r.CreatedAt,
    p.ProductId,
    p.ExternalId AS ProductExternalId,
    p.ProductName,
    p.Price,
    p.OriginalPrice,
    p.StatusName,
    u.ExternalId AS SellerExternalId,
    u.UserName AS SellerName,
    u.Campus
FROM dbo.RiskLogs AS r
LEFT JOIN dbo.Products AS p ON p.ProductId = r.ProductId
LEFT JOIN dbo.Users AS u ON u.UserId = COALESCE(r.UserId, p.SellerId);
GO

CREATE OR ALTER PROCEDURE dbo.CreateOrGetUser
    @ExternalId NVARCHAR(40),
    @UserName NVARCHAR(50),
    @Campus NVARCHAR(50),
    @LoginName NVARCHAR(50) = NULL,
    @PasswordHash NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @LoginName IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Users WHERE LoginName = @LoginName)
    BEGIN
        SELECT UserId, ExternalId, LoginName, UserName, Campus, TrustScore, CreatedAt FROM dbo.Users WHERE LoginName = @LoginName;
        RETURN;
    END;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE ExternalId = @ExternalId)
        INSERT INTO dbo.Users (ExternalId, LoginName, PasswordHash, UserName, Campus, TrustScore)
        VALUES (@ExternalId, @LoginName, @PasswordHash, @UserName, @Campus, 82);
    SELECT UserId, ExternalId, LoginName, UserName, Campus, TrustScore, CreatedAt FROM dbo.Users WHERE ExternalId = @ExternalId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.CreateProduct
    @ExternalId NVARCHAR(40), @SellerExternalId NVARCHAR(40), @CategoryName NVARCHAR(40),
    @ProductName NVARCHAR(120), @Description NVARCHAR(800) = NULL, @Price DECIMAL(10,2),
    @OriginalPrice DECIMAL(10,2) = NULL, @ConditionLabel NVARCHAR(30), @Tags NVARCHAR(300) = NULL,
    @ImageUrl NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @SellerId INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = @SellerExternalId);
        IF @SellerId IS NULL THROW 51001, N'卖家不存在。', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE CategoryName = @CategoryName)
            INSERT INTO dbo.Categories (CategoryName, Description, SortOrder) VALUES (@CategoryName, N'用户发布商品自动创建分类。', 90);
        DECLARE @CategoryId INT = (SELECT CategoryId FROM dbo.Categories WHERE CategoryName = @CategoryName);
        INSERT INTO dbo.Products (ExternalId, SellerId, CategoryId, ProductName, Description, Price, OriginalPrice, ConditionLabel, Tags, Score, Views, TrustScore)
        VALUES (@ExternalId, @SellerId, @CategoryId, @ProductName, @Description, @Price, @OriginalPrice, @ConditionLabel, @Tags, 4.5, 0, 90);
        DECLARE @ProductId INT = SCOPE_IDENTITY();
        INSERT INTO dbo.ProductImages (ProductId, ImageUrl, SortOrder, IsCover) VALUES (@ProductId, @ImageUrl, 1, 1);
        COMMIT TRANSACTION;
        SELECT * FROM dbo.ActiveProductView WHERE ProductId = @ProductId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.CreateTransaction
    @ProductExternalId NVARCHAR(40), @BuyerExternalId NVARCHAR(40), @FinalPrice DECIMAL(10,2)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @ProductId INT, @SellerId INT;
        DECLARE @BuyerId INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = @BuyerExternalId);
        SELECT @ProductId = ProductId, @SellerId = SellerId FROM dbo.Products WITH (UPDLOCK, HOLDLOCK)
        WHERE ExternalId = @ProductExternalId AND StatusName = N'on_sale';
        IF @BuyerId IS NULL THROW 51002, N'买家不存在。', 1;
        IF @ProductId IS NULL THROW 51003, N'商品不存在或已不可交易。', 1;
        IF @BuyerId = @SellerId THROW 51004, N'不能购买自己发布的商品。', 1;
        INSERT INTO dbo.Transactions (ProductId, BuyerId, SellerId, FinalPrice, TradeStatus)
        VALUES (@ProductId, @BuyerId, @SellerId, @FinalPrice, N'pending');
        DECLARE @TransactionId INT = SCOPE_IDENTITY();
        UPDATE dbo.Products SET StatusName = N'reserved', UpdatedAt = SYSUTCDATETIME() WHERE ProductId = @ProductId;
        COMMIT TRANSACTION;
        SELECT TransactionId, ProductId, BuyerId, SellerId, FinalPrice, TradeStatus, CreatedAt FROM dbo.Transactions WHERE TransactionId = @TransactionId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_Transactions_UpdateProductStatus ON dbo.Transactions AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE p SET p.StatusName = CASE WHEN i.TradeStatus = N'finished' THEN N'sold' WHEN i.TradeStatus = N'cancelled' THEN N'on_sale' ELSE p.StatusName END,
        p.UpdatedAt = SYSUTCDATETIME()
    FROM dbo.Products AS p INNER JOIN inserted AS i ON i.ProductId = p.ProductId
    WHERE i.TradeStatus IN (N'finished', N'cancelled');
    UPDATE t SET FinishedAt = CASE WHEN i.TradeStatus = N'finished' THEN SYSUTCDATETIME() ELSE t.FinishedAt END
    FROM dbo.Transactions AS t INNER JOIN inserted AS i ON i.TransactionId = t.TransactionId;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_Products_LogAbnormalPrice ON dbo.Products AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.RiskLogs (ProductId, UserId, RiskType, RiskLevel, Message, RuleCode)
    SELECT i.ProductId, i.SellerId, N'price', N'high', N'商品价格低于原价的 50%，建议人工复核。', N'price-below-50-percent'
    FROM inserted AS i
    WHERE i.OriginalPrice IS NOT NULL AND i.OriginalPrice > 0 AND i.Price < i.OriginalPrice * 0.5
      AND NOT EXISTS (SELECT 1 FROM dbo.RiskLogs AS r WHERE r.ProductId = i.ProductId AND r.RuleCode = N'price-below-50-percent');
END;
GO

SELECT N'002_auth_and_advanced_objects applied' AS MigrationResult;
GO
