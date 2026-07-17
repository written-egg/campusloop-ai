IF DB_ID(N'CampusLoopDB') IS NULL
BEGIN
    EXEC(N'CREATE DATABASE CampusLoopDB;');
END;
GO

USE CampusLoopDB;
GO

IF OBJECT_ID(N'dbo.RiskLogs', N'U') IS NOT NULL DROP TABLE dbo.RiskLogs;
IF OBJECT_ID(N'dbo.AdminAuditLogs', N'U') IS NOT NULL DROP TABLE dbo.AdminAuditLogs;
IF OBJECT_ID(N'dbo.AIReports', N'U') IS NOT NULL DROP TABLE dbo.AIReports;
IF OBJECT_ID(N'dbo.Messages', N'U') IS NOT NULL DROP TABLE dbo.Messages;
IF OBJECT_ID(N'dbo.Favorites', N'U') IS NOT NULL DROP TABLE dbo.Favorites;
IF OBJECT_ID(N'dbo.Transactions', N'U') IS NOT NULL DROP TABLE dbo.Transactions;
IF OBJECT_ID(N'dbo.ProductImages', N'U') IS NOT NULL DROP TABLE dbo.ProductImages;
IF OBJECT_ID(N'dbo.Products', N'U') IS NOT NULL DROP TABLE dbo.Products;
IF OBJECT_ID(N'dbo.Categories', N'U') IS NOT NULL DROP TABLE dbo.Categories;
IF OBJECT_ID(N'dbo.Users', N'U') IS NOT NULL DROP TABLE dbo.Users;
GO

CREATE TABLE dbo.Users (
    UserId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    ExternalId NVARCHAR(40) NOT NULL CONSTRAINT UQ_Users_ExternalId UNIQUE,
    LoginName NVARCHAR(50) NULL,
    PasswordHash NVARCHAR(255) NULL,
    UserName NVARCHAR(50) NOT NULL,
    Campus NVARCHAR(50) NOT NULL,
    TrustScore INT NOT NULL CONSTRAINT DF_Users_TrustScore DEFAULT 80,
    RoleName NVARCHAR(20) NOT NULL CONSTRAINT DF_Users_RoleName DEFAULT N'student',
    AccountStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_Users_AccountStatus DEFAULT N'active',
    DeletedAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Users_TrustScore CHECK (TrustScore BETWEEN 0 AND 100),
    CONSTRAINT CK_Users_AccountStatus CHECK (AccountStatus IN (N'active', N'disabled', N'deleted'))
);
GO

CREATE UNIQUE INDEX UX_Users_LoginName
ON dbo.Users(LoginName)
WHERE LoginName IS NOT NULL;
GO

CREATE TABLE dbo.Categories (
    CategoryId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Categories PRIMARY KEY,
    CategoryName NVARCHAR(40) NOT NULL CONSTRAINT UQ_Categories_CategoryName UNIQUE,
    Description NVARCHAR(200) NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_Categories_SortOrder DEFAULT 0,
    IsActive BIT NOT NULL CONSTRAINT DF_Categories_IsActive DEFAULT 1
);
GO

CREATE TABLE dbo.Products (
    ProductId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Products PRIMARY KEY,
    ExternalId NVARCHAR(40) NOT NULL CONSTRAINT UQ_Products_ExternalId UNIQUE,
    SellerId INT NOT NULL,
    CategoryId INT NOT NULL,
    ProductName NVARCHAR(120) NOT NULL,
    Description NVARCHAR(800) NULL,
    Price DECIMAL(10,2) NOT NULL,
    OriginalPrice DECIMAL(10,2) NULL,
    ConditionLabel NVARCHAR(30) NOT NULL,
    Tags NVARCHAR(300) NULL,
    Score DECIMAL(3,1) NOT NULL CONSTRAINT DF_Products_Score DEFAULT 4.5,
    Views INT NOT NULL CONSTRAINT DF_Products_Views DEFAULT 0,
    TrustScore INT NOT NULL CONSTRAINT DF_Products_TrustScore DEFAULT 90,
    StatusName NVARCHAR(20) NOT NULL CONSTRAINT DF_Products_StatusName DEFAULT N'on_sale',
    ModerationStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_Products_ModerationStatus DEFAULT N'normal',
    AdminOfflineReason NVARCHAR(300) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Products_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Products_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Products_Users FOREIGN KEY (SellerId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_Products_Categories FOREIGN KEY (CategoryId) REFERENCES dbo.Categories(CategoryId),
    CONSTRAINT CK_Products_Price CHECK (Price >= 0),
    CONSTRAINT CK_Products_OriginalPrice CHECK (OriginalPrice IS NULL OR OriginalPrice >= 0),
    CONSTRAINT CK_Products_Score CHECK (Score BETWEEN 0 AND 5),
    CONSTRAINT CK_Products_TrustScore CHECK (TrustScore BETWEEN 0 AND 100),
    CONSTRAINT CK_Products_StatusName CHECK (StatusName IN (N'on_sale', N'reserved', N'sold', N'offline')),
    CONSTRAINT CK_Products_ModerationStatus CHECK (ModerationStatus IN (N'normal', N'admin_offline'))
);
GO

CREATE TABLE dbo.ProductImages (
    ImageId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProductImages PRIMARY KEY,
    ProductId INT NOT NULL,
    ImageUrl NVARCHAR(MAX) NOT NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_ProductImages_SortOrder DEFAULT 0,
    IsCover BIT NOT NULL CONSTRAINT DF_ProductImages_IsCover DEFAULT 0,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_ProductImages_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ProductImages_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.Transactions (
    TransactionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Transactions PRIMARY KEY,
    ProductId INT NOT NULL,
    BuyerId INT NOT NULL,
    SellerId INT NOT NULL,
    FinalPrice DECIMAL(10,2) NOT NULL,
    TradeStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_Transactions_TradeStatus DEFAULT N'pending',
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Transactions_CreatedAt DEFAULT SYSUTCDATETIME(),
    ConfirmedAt DATETIME2(0) NULL,
    FinishedAt DATETIME2(0) NULL,
    CancelledAt DATETIME2(0) NULL,
    DisputedAt DATETIME2(0) NULL,
    DisputeReason NVARCHAR(500) NULL,
    CONSTRAINT FK_Transactions_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId),
    CONSTRAINT FK_Transactions_Buyer FOREIGN KEY (BuyerId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_Transactions_Seller FOREIGN KEY (SellerId) REFERENCES dbo.Users(UserId),
    CONSTRAINT CK_Transactions_FinalPrice CHECK (FinalPrice >= 0),
    CONSTRAINT CK_Transactions_TradeStatus CHECK (TradeStatus IN (N'pending', N'confirmed', N'finished', N'cancelled', N'disputed'))
);
GO

CREATE TABLE dbo.Favorites (
    FavoriteId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Favorites PRIMARY KEY,
    UserId INT NOT NULL,
    ProductId INT NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Favorites_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Favorites_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_Favorites_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId) ON DELETE CASCADE,
    CONSTRAINT UQ_Favorites_UserProduct UNIQUE (UserId, ProductId)
);
GO

CREATE TABLE dbo.Messages (
    MessageId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Messages PRIMARY KEY,
    ProductId INT NULL,
    SenderId INT NOT NULL,
    ReceiverId INT NOT NULL,
    Content NVARCHAR(1000) NOT NULL,
    IsRead BIT NOT NULL CONSTRAINT DF_Messages_IsRead DEFAULT 0,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Messages_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Messages_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId),
    CONSTRAINT FK_Messages_Sender FOREIGN KEY (SenderId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_Messages_Receiver FOREIGN KEY (ReceiverId) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.AIReports (
    ReportId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AIReports PRIMARY KEY,
    ProductId INT NULL,
    UserId INT NULL,
    ReportType NVARCHAR(30) NOT NULL,
    Provider NVARCHAR(40) NOT NULL CONSTRAINT DF_AIReports_Provider DEFAULT N'local-fallback',
    Score DECIMAL(5,2) NULL,
    ResultJson NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AIReports_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_AIReports_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId),
    CONSTRAINT FK_AIReports_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT CK_AIReports_ReportType CHECK (ReportType IN (N'listing', N'attribute', N'price', N'risk', N'search', N'customer_service'))
);
GO

CREATE TABLE dbo.RiskLogs (
    RiskLogId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RiskLogs PRIMARY KEY,
    ProductId INT NULL,
    UserId INT NULL,
    RiskType NVARCHAR(30) NOT NULL,
    RiskLevel NVARCHAR(20) NOT NULL,
    Message NVARCHAR(300) NOT NULL,
    RuleCode NVARCHAR(40) NULL,
    ReviewStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_RiskLogs_ReviewStatus DEFAULT N'pending',
    ReviewNote NVARCHAR(500) NULL,
    ReviewedBy INT NULL,
    ReviewedAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_RiskLogs_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_RiskLogs_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId),
    CONSTRAINT FK_RiskLogs_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT CK_RiskLogs_RiskLevel CHECK (RiskLevel IN (N'low', N'medium', N'high')),
    CONSTRAINT CK_RiskLogs_ReviewStatus CHECK (ReviewStatus IN (N'pending', N'confirmed', N'false_positive', N'resolved')),
    CONSTRAINT FK_RiskLogs_ReviewedBy FOREIGN KEY (ReviewedBy) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.AdminAuditLogs (
    AuditLogId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AdminAuditLogs PRIMARY KEY,
    AdminUserId INT NOT NULL,
    ActionType NVARCHAR(40) NOT NULL,
    TargetType NVARCHAR(30) NOT NULL,
    TargetId NVARCHAR(50) NOT NULL,
    Reason NVARCHAR(300) NULL,
    DetailJson NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AdminAuditLogs_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_AdminAuditLogs_AdminUser FOREIGN KEY (AdminUserId) REFERENCES dbo.Users(UserId)
);
GO

CREATE INDEX IX_Products_CategoryStatusCreatedAt ON dbo.Products(CategoryId, StatusName, CreatedAt DESC);
CREATE INDEX IX_Products_SellerId ON dbo.Products(SellerId);
CREATE INDEX IX_Products_Price ON dbo.Products(Price);
CREATE INDEX IX_ProductImages_ProductId ON dbo.ProductImages(ProductId);
CREATE INDEX IX_Transactions_BuyerId ON dbo.Transactions(BuyerId);
CREATE INDEX IX_Transactions_SellerId ON dbo.Transactions(SellerId);
CREATE INDEX IX_Messages_ReceiverRead ON dbo.Messages(ReceiverId, IsRead, CreatedAt DESC);
CREATE INDEX IX_AIReports_ProductType ON dbo.AIReports(ProductId, ReportType, CreatedAt DESC);
CREATE INDEX IX_RiskLogs_ProductLevel ON dbo.RiskLogs(ProductId, RiskLevel, CreatedAt DESC);
CREATE INDEX IX_RiskLogs_ReviewStatus ON dbo.RiskLogs(ReviewStatus, CreatedAt DESC);
CREATE INDEX IX_AdminAuditLogs_CreatedAt ON dbo.AdminAuditLogs(CreatedAt DESC);
GO

IF OBJECT_ID(N'dbo.ActiveProductView', N'V') IS NOT NULL DROP VIEW dbo.ActiveProductView;
GO

CREATE VIEW dbo.ActiveProductView AS
SELECT
    p.ProductId,
    p.ExternalId,
    p.ProductName,
    p.Description,
    c.CategoryName,
    p.Price,
    p.OriginalPrice,
    p.ConditionLabel,
    p.Tags,
    p.Score,
    p.Views,
    p.TrustScore,
    p.StatusName,
    u.UserName AS SellerName,
    u.Campus,
    img.ImageUrl AS CoverImageUrl,
    p.CreatedAt
FROM dbo.Products AS p
INNER JOIN dbo.Users AS u ON p.SellerId = u.UserId
INNER JOIN dbo.Categories AS c ON p.CategoryId = c.CategoryId
OUTER APPLY (
    SELECT TOP (1) pi.ImageUrl
    FROM dbo.ProductImages AS pi
    WHERE pi.ProductId = p.ProductId
    ORDER BY pi.IsCover DESC, pi.SortOrder ASC, pi.ImageId ASC
) AS img
WHERE p.StatusName = N'on_sale';
GO

CREATE VIEW dbo.UserTradeSummaryView AS
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

CREATE VIEW dbo.RiskProductView AS
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

CREATE PROCEDURE dbo.CreateOrGetUser
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
        SELECT UserId, ExternalId, LoginName, UserName, Campus, TrustScore, CreatedAt
        FROM dbo.Users
        WHERE LoginName = @LoginName;
        RETURN;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE ExternalId = @ExternalId)
    BEGIN
        INSERT INTO dbo.Users (ExternalId, LoginName, PasswordHash, UserName, Campus, TrustScore)
        VALUES (@ExternalId, @LoginName, @PasswordHash, @UserName, @Campus, 82);
    END;

    SELECT UserId, ExternalId, LoginName, UserName, Campus, TrustScore, CreatedAt
    FROM dbo.Users
    WHERE ExternalId = @ExternalId;
END;
GO

CREATE PROCEDURE dbo.CreateProduct
    @ExternalId NVARCHAR(40),
    @SellerExternalId NVARCHAR(40),
    @CategoryName NVARCHAR(40),
    @ProductName NVARCHAR(120),
    @Description NVARCHAR(800) = NULL,
    @Price DECIMAL(10,2),
    @OriginalPrice DECIMAL(10,2) = NULL,
    @ConditionLabel NVARCHAR(30),
    @Tags NVARCHAR(300) = NULL,
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
        BEGIN
            INSERT INTO dbo.Categories (CategoryName, Description, SortOrder)
            VALUES (@CategoryName, N'用户发布商品自动创建分类。', 90);
        END;

        DECLARE @CategoryId INT = (SELECT CategoryId FROM dbo.Categories WHERE CategoryName = @CategoryName);
        INSERT INTO dbo.Products (
            ExternalId, SellerId, CategoryId, ProductName, Description, Price,
            OriginalPrice, ConditionLabel, Tags, Score, Views, TrustScore
        )
        VALUES (
            @ExternalId, @SellerId, @CategoryId, @ProductName, @Description, @Price,
            @OriginalPrice, @ConditionLabel, @Tags, 4.5, 0, 90
        );

        DECLARE @ProductId INT = SCOPE_IDENTITY();
        INSERT INTO dbo.ProductImages (ProductId, ImageUrl, SortOrder, IsCover)
        VALUES (@ProductId, @ImageUrl, 1, 1);

        COMMIT TRANSACTION;
        SELECT * FROM dbo.ActiveProductView WHERE ProductId = @ProductId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

CREATE PROCEDURE dbo.CreateTransaction
    @ProductExternalId NVARCHAR(40),
    @BuyerExternalId NVARCHAR(40),
    @FinalPrice DECIMAL(10,2)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @ProductId INT;
        DECLARE @SellerId INT;
        DECLARE @BuyerId INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = @BuyerExternalId);

        SELECT @ProductId = ProductId, @SellerId = SellerId
        FROM dbo.Products WITH (UPDLOCK, HOLDLOCK)
        WHERE ExternalId = @ProductExternalId AND StatusName = N'on_sale';

        IF @BuyerId IS NULL THROW 51002, N'买家不存在。', 1;
        IF @ProductId IS NULL THROW 51003, N'商品不存在或已不可交易。', 1;
        IF @BuyerId = @SellerId THROW 51004, N'不能购买自己发布的商品。', 1;

        INSERT INTO dbo.Transactions (ProductId, BuyerId, SellerId, FinalPrice, TradeStatus)
        VALUES (@ProductId, @BuyerId, @SellerId, @FinalPrice, N'pending');

        UPDATE dbo.Products SET StatusName = N'reserved', UpdatedAt = SYSUTCDATETIME()
        WHERE ProductId = @ProductId;

        DECLARE @TransactionId INT = SCOPE_IDENTITY();
        COMMIT TRANSACTION;

        SELECT TransactionId, ProductId, BuyerId, SellerId, FinalPrice, TradeStatus, CreatedAt
        FROM dbo.Transactions
        WHERE TransactionId = @TransactionId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

CREATE TRIGGER dbo.TR_Transactions_UpdateProductStatus
ON dbo.Transactions
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE p
    SET
        p.StatusName = CASE
            WHEN i.TradeStatus = N'finished' THEN N'sold'
            WHEN i.TradeStatus = N'cancelled' THEN N'on_sale'
            ELSE p.StatusName
        END,
        p.UpdatedAt = SYSUTCDATETIME()
    FROM dbo.Products AS p
    INNER JOIN inserted AS i ON i.ProductId = p.ProductId
    WHERE i.TradeStatus IN (N'finished', N'cancelled');

    UPDATE t
    SET ConfirmedAt = CASE WHEN i.TradeStatus=N'confirmed' AND t.ConfirmedAt IS NULL THEN SYSUTCDATETIME() ELSE t.ConfirmedAt END,
        FinishedAt = CASE WHEN i.TradeStatus=N'finished' AND t.FinishedAt IS NULL THEN SYSUTCDATETIME() ELSE t.FinishedAt END,
        CancelledAt = CASE WHEN i.TradeStatus=N'cancelled' AND t.CancelledAt IS NULL THEN SYSUTCDATETIME() ELSE t.CancelledAt END,
        DisputedAt = CASE WHEN i.TradeStatus=N'disputed' AND t.DisputedAt IS NULL THEN SYSUTCDATETIME() ELSE t.DisputedAt END
    FROM dbo.Transactions AS t
    INNER JOIN inserted AS i ON i.TransactionId = t.TransactionId;
END;
GO

CREATE TRIGGER dbo.TR_Products_LogPublishingRisks
ON dbo.Products
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.RiskLogs (ProductId, UserId, RiskType, RiskLevel, Message, RuleCode)
    SELECT
        i.ProductId,
        i.SellerId,
        N'price',
        N'high',
        N'商品售价低于原价的 50%，建议核对商品状态和价格真实性。',
        N'price-below-50-percent'
    FROM inserted AS i
    WHERE i.OriginalPrice IS NOT NULL
      AND i.OriginalPrice > 0
      AND i.Price < i.OriginalPrice * 0.5
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.RiskLogs AS r
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
