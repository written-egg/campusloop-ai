USE CampusLoopDB;
GO

INSERT INTO dbo.Users (ExternalId, UserName, Campus, TrustScore, CreatedAt)
VALUES
    (N'u1', N'林同学', N'南校区', 86, '2026-06-09T03:00:00'),
    (N'u2', N'周同学', N'北校区', 82, '2026-06-09T03:20:00'),
    (N'u1781530319461', N'张同学', N'南校区', 82, '2026-06-15T13:31:59');
GO

INSERT INTO dbo.Categories (CategoryName, Description, SortOrder)
VALUES
    (N'数码电子', N'手机、相机、游戏机、音箱、手表等高价值商品。', 10),
    (N'运动户外', N'运动鞋、户外服饰、滑雪等校园运动商品。', 20),
    (N'生活用品', N'宿舍生活、家具、包袋等日常用品。', 30),
    (N'图书教材', N'教材、资料、考试书籍等低价高频商品。', 40),
    (N'其他', N'暂未归类的商品。', 99);
GO

DECLARE @UserLin INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = N'u1');
DECLARE @UserZhou INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = N'u2');
DECLARE @UserZhang INT = (SELECT UserId FROM dbo.Users WHERE ExternalId = N'u1781530319461');
DECLARE @Digital INT = (SELECT CategoryId FROM dbo.Categories WHERE CategoryName = N'数码电子');
DECLARE @Outdoor INT = (SELECT CategoryId FROM dbo.Categories WHERE CategoryName = N'运动户外');
DECLARE @Life INT = (SELECT CategoryId FROM dbo.Categories WHERE CategoryName = N'生活用品');

INSERT INTO dbo.Products (
    ExternalId, SellerId, CategoryId, ProductName, Description, Price, OriginalPrice,
    ConditionLabel, Tags, Score, Views, TrustScore, CreatedAt
)
VALUES
    (N'p1', @UserLin, @Digital, N'富士 X100V 复古相机', N'轻微使用痕迹，快门与各项功能正常，原盒、充电配件和说明书齐全。', 9680, 13990, N'95新', N'相机,富士,原盒齐全,热门保值', 4.9, 516, 98, '2026-06-09T03:30:00'),
    (N'p2', @UserZhou, @Outdoor, N'Salomon XT-6 越野鞋', N'日常通勤穿着数次，鞋底磨损轻微，鞋面无明显污渍，适合轻户外场景。', 760, 1598, N'九成新', N'跑鞋,轻户外,平台验真,轻微使用', 4.7, 221, 96, '2026-06-09T04:00:00'),
    (N'p3', @UserLin, @Digital, N'Nintendo Switch OLED', N'屏幕无划痕，手柄无漂移，底座、充电器和包装齐全，可正常连接电视。', 1580, 2599, N'95新', N'游戏机,双手柄,顺丰包邮,屏幕无划痕', 4.8, 367, 97, '2026-06-09T04:20:00'),
    (N'p4', @UserZhou, @Digital, N'Marshall Acton III 音箱', N'声音状态优秀，旋钮和蓝牙连接正常，机身边角有少量日常使用痕迹。', 1280, 2699, N'九成新', N'音箱,蓝牙,无拆无修,音质优秀', 4.7, 194, 95, '2026-06-09T05:10:00'),
    (N'p5', @UserLin, @Outdoor, N'始祖鸟 Beta LT 冲锋衣', N'仅轻户外穿着，面料与压胶状态良好，无破损，已清洁后收纳。', 2480, 5200, N'95新', N'冲锋衣,专柜可验,轻户外,稀有配色', 4.9, 442, 99, '2026-06-09T05:40:00'),
    (N'p6', @UserZhou, @Life, N'Herman Miller Sayl 椅', N'升降、后仰与扶手调节正常，网面完整，建议同城或校内自提。', 2890, 6599, N'九成新', N'人体工学,宿舍升级,自提优先,功能正常', 4.6, 155, 94, '2026-06-09T06:10:00'),
    (N'p7', @UserLin, @Life, N'Maison Margiela 链条包', N'包身与链条保存良好，内里干净，附防尘袋，支持专业机构复核。', 3280, 8900, N'九成新', N'包袋,平台验真,防尘袋在,支持复核', 4.8, 286, 98, '2026-06-09T06:40:00'),
    (N'p8', @UserZhou, @Digital, N'Apple Watch Ultra 2', N'屏幕与表壳无明显磕碰，电池健康 98%，附原装表带、充电线和包装。', 3980, 6499, N'95新', N'手表,在保,电池健康98%,原装配件', 4.9, 338, 97, '2026-06-09T07:10:00'),
    (N'p1781530320936', @UserZhang, @Digital, N'iPhone 13 128G', NULL, 2512, NULL, N'九成新', N'同校交易,可当面验货,价格参考透明,AI辅助发布,Apple,iPhone 13 128G', 4.5, 0, 90, '2026-06-15T13:32:00');

INSERT INTO dbo.ProductImages (ProductId, ImageUrl, SortOrder, IsCover)
SELECT ProductId, ImageUrl, 1, 1
FROM (
    VALUES
        (N'p1', N'/assets/products/camera.jpg'),
        (N'p2', N'/assets/products/shoes.jpg'),
        (N'p3', N'/assets/products/switch.jpg'),
        (N'p4', N'/assets/products/speaker.jpg'),
        (N'p5', N'/assets/products/jacket.jpg'),
        (N'p6', N'/assets/products/chair.jpg'),
        (N'p7', N'/assets/products/bag.jpg'),
        (N'p8', N'/assets/products/watch.jpg'),
        (N'p1781530320936', N'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80')
) AS src(ExternalId, ImageUrl)
INNER JOIN dbo.Products AS p ON p.ExternalId = src.ExternalId;

INSERT INTO dbo.Favorites (UserId, ProductId)
SELECT @UserZhang, ProductId
FROM dbo.Products
WHERE ExternalId IN (N'p1', N'p3');

INSERT INTO dbo.Messages (ProductId, SenderId, ReceiverId, Content, IsRead)
SELECT ProductId, @UserZhang, @UserLin, N'你好，这个商品可以校内当面验货吗？', 0
FROM dbo.Products
WHERE ExternalId = N'p1';

INSERT INTO dbo.AIReports (ProductId, UserId, ReportType, Provider, Score, ResultJson)
SELECT ProductId, SellerId, N'risk', N'local-fallback', TrustScore,
       N'{"summary":"首版种子数据，后续由AI风控接口写入真实评估结果。"}'
FROM dbo.Products;

INSERT INTO dbo.RiskLogs (ProductId, UserId, RiskType, RiskLevel, Message, RuleCode)
SELECT ProductId, SellerId, N'price', N'medium', N'首版示例风险记录，用于验证风控日志表关联关系。', N'seed-demo'
FROM dbo.Products
WHERE OriginalPrice IS NOT NULL AND Price < OriginalPrice * 0.5;
GO
