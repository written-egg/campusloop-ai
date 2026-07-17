USE CampusLoopDB;
GO

SELECT
    DB_NAME() AS DatabaseName,
    COUNT(*) AS UserCount
FROM dbo.Users;
GO

SELECT
    COUNT(*) AS ProductCount
FROM dbo.Products;
GO

SELECT TOP (20)
    ProductName,
    CategoryName,
    Price,
    ConditionLabel,
    SellerName,
    Campus,
    CoverImageUrl,
    CreatedAt
FROM dbo.ActiveProductView
ORDER BY CreatedAt DESC;
GO

SELECT
    CategoryName,
    COUNT(*) AS ProductCount
FROM dbo.ActiveProductView
GROUP BY CategoryName
ORDER BY ProductCount DESC, CategoryName ASC;
GO

SELECT
    RiskLevel,
    COUNT(*) AS RiskCount
FROM dbo.RiskLogs
GROUP BY RiskLevel;
GO
