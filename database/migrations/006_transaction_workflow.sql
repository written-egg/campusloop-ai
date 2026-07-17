:ON ERROR EXIT
USE CampusLoopDB;
GO

IF COL_LENGTH(N'dbo.Transactions', N'ConfirmedAt') IS NULL
    ALTER TABLE dbo.Transactions ADD ConfirmedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.Transactions', N'CancelledAt') IS NULL
    ALTER TABLE dbo.Transactions ADD CancelledAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.Transactions', N'DisputedAt') IS NULL
    ALTER TABLE dbo.Transactions ADD DisputedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.Transactions', N'DisputeReason') IS NULL
    ALTER TABLE dbo.Transactions ADD DisputeReason NVARCHAR(500) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Transactions_TradeStatus')
    ALTER TABLE dbo.Transactions DROP CONSTRAINT CK_Transactions_TradeStatus;
GO
ALTER TABLE dbo.Transactions ADD CONSTRAINT CK_Transactions_TradeStatus
    CHECK (TradeStatus IN (N'pending',N'confirmed',N'finished',N'cancelled',N'disputed'));
GO

CREATE OR ALTER TRIGGER dbo.TR_Transactions_UpdateProductStatus
ON dbo.Transactions
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE p
    SET p.StatusName = CASE
            WHEN i.TradeStatus = N'finished' THEN N'sold'
            WHEN i.TradeStatus = N'cancelled' THEN N'on_sale'
            ELSE p.StatusName
        END,
        p.UpdatedAt = SYSUTCDATETIME()
    FROM dbo.Products AS p
    INNER JOIN inserted AS i ON i.ProductId = p.ProductId
    WHERE i.TradeStatus IN (N'finished',N'cancelled');

    UPDATE t
    SET ConfirmedAt = CASE WHEN i.TradeStatus=N'confirmed' AND t.ConfirmedAt IS NULL THEN SYSUTCDATETIME() ELSE t.ConfirmedAt END,
        FinishedAt = CASE WHEN i.TradeStatus=N'finished' AND t.FinishedAt IS NULL THEN SYSUTCDATETIME() ELSE t.FinishedAt END,
        CancelledAt = CASE WHEN i.TradeStatus=N'cancelled' AND t.CancelledAt IS NULL THEN SYSUTCDATETIME() ELSE t.CancelledAt END,
        DisputedAt = CASE WHEN i.TradeStatus=N'disputed' AND t.DisputedAt IS NULL THEN SYSUTCDATETIME() ELSE t.DisputedAt END
    FROM dbo.Transactions AS t
    INNER JOIN inserted AS i ON i.TransactionId=t.TransactionId;
END;
GO

SELECT N'006_transaction_workflow applied' AS MigrationResult;
GO
