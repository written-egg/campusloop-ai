:ON ERROR EXIT

USE CampusLoopDB;
GO

CREATE OR ALTER VIEW dbo.ActiveProductView AS
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

SELECT N'003_product_description_view applied' AS MigrationResult;
GO
