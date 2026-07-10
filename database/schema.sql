IF DB_ID(N'CampusLoopDB') IS NULL
BEGIN
    EXEC(N'CREATE DATABASE CampusLoopDB;');
END;
GO

USE CampusLoopDB;
GO

IF OBJECT_ID(N'dbo.RiskLogs', N'U') IS NOT NULL DROP TABLE dbo.RiskLogs;
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
    UserName NVARCHAR(50) NOT NULL,
    Campus NVARCHAR(50) NOT NULL,
    TrustScore INT NOT NULL CONSTRAINT DF_Users_TrustScore DEFAULT 80,
    RoleName NVARCHAR(20) NOT NULL CONSTRAINT DF_Users_RoleName DEFAULT N'student',
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Users_TrustScore CHECK (TrustScore BETWEEN 0 AND 100)
);
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
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Products_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Products_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Products_Users FOREIGN KEY (SellerId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_Products_Categories FOREIGN KEY (CategoryId) REFERENCES dbo.Categories(CategoryId),
    CONSTRAINT CK_Products_Price CHECK (Price >= 0),
    CONSTRAINT CK_Products_OriginalPrice CHECK (OriginalPrice IS NULL OR OriginalPrice >= 0),
    CONSTRAINT CK_Products_Score CHECK (Score BETWEEN 0 AND 5),
    CONSTRAINT CK_Products_TrustScore CHECK (TrustScore BETWEEN 0 AND 100),
    CONSTRAINT CK_Products_StatusName CHECK (StatusName IN (N'on_sale', N'reserved', N'sold', N'offline'))
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
    FinishedAt DATETIME2(0) NULL,
    CONSTRAINT FK_Transactions_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId),
    CONSTRAINT FK_Transactions_Buyer FOREIGN KEY (BuyerId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_Transactions_Seller FOREIGN KEY (SellerId) REFERENCES dbo.Users(UserId),
    CONSTRAINT CK_Transactions_FinalPrice CHECK (FinalPrice >= 0),
    CONSTRAINT CK_Transactions_TradeStatus CHECK (TradeStatus IN (N'pending', N'paid', N'finished', N'cancelled', N'disputed'))
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
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_RiskLogs_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_RiskLogs_Products FOREIGN KEY (ProductId) REFERENCES dbo.Products(ProductId),
    CONSTRAINT FK_RiskLogs_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT CK_RiskLogs_RiskLevel CHECK (RiskLevel IN (N'low', N'medium', N'high'))
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
GO

IF OBJECT_ID(N'dbo.ActiveProductView', N'V') IS NOT NULL DROP VIEW dbo.ActiveProductView;
GO

CREATE VIEW dbo.ActiveProductView AS
SELECT
    p.ProductId,
    p.ExternalId,
    p.ProductName,
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
