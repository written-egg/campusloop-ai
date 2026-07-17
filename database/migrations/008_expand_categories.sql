USE CampusLoopDB;
GO

MERGE dbo.Categories AS target
USING (VALUES
    (N'校园交通', N'电动车、自行车、电动滑板车等校园代步工具。', 50),
    (N'服饰鞋包', N'服装、鞋履、背包和箱包等个人闲置。', 60),
    (N'乐器音频', N'吉他、键盘乐器、麦克风和声卡等设备。', 70),
    (N'美妆个护', N'符合平台交易规范的个护电器和未拆封用品。', 80)
) AS source(CategoryName, Description, SortOrder)
ON target.CategoryName = source.CategoryName
WHEN MATCHED THEN
    UPDATE SET Description = source.Description, SortOrder = source.SortOrder
WHEN NOT MATCHED THEN
    INSERT (CategoryName, Description, SortOrder)
    VALUES (source.CategoryName, source.Description, source.SortOrder);
GO
