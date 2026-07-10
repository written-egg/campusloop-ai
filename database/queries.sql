USE CampusLoopDB;
GO

-- 在售商品、分类和卖家
SELECT TOP (20) * FROM dbo.ActiveProductView ORDER BY CreatedAt DESC;
GO

-- 每个分类的在售商品数量和平均价格
SELECT CategoryName, COUNT(*) AS ProductCount, AVG(Price) AS AveragePrice
FROM dbo.ActiveProductView
GROUP BY CategoryName
ORDER BY ProductCount DESC;
GO

-- 用户买卖汇总
SELECT * FROM dbo.UserTradeSummaryView
ORDER BY SellTransactionCount + BuyTransactionCount DESC, UserId;
GO

-- 高风险商品
SELECT * FROM dbo.RiskProductView
WHERE RiskLevel = N'high'
ORDER BY CreatedAt DESC;
GO

-- AI 报告类型和来源统计
SELECT ReportType, Provider, COUNT(*) AS ReportCount, AVG(Score) AS AverageScore
FROM dbo.AIReports
GROUP BY ReportType, Provider
ORDER BY ReportCount DESC;
GO

-- 最近交易及买卖双方
SELECT TOP (20)
    t.TransactionId,
    p.ProductName,
    buyer.UserName AS BuyerName,
    seller.UserName AS SellerName,
    t.FinalPrice,
    t.TradeStatus,
    t.CreatedAt,
    t.FinishedAt
FROM dbo.Transactions AS t
INNER JOIN dbo.Products AS p ON p.ProductId = t.ProductId
INNER JOIN dbo.Users AS buyer ON buyer.UserId = t.BuyerId
INNER JOIN dbo.Users AS seller ON seller.UserId = t.SellerId
ORDER BY t.CreatedAt DESC;
GO
