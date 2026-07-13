:ON ERROR EXIT
USE CampusLoopDB;
GO

IF COL_LENGTH(N'dbo.Users', N'AccountStatus') IS NULL
    ALTER TABLE dbo.Users ADD AccountStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_Users_AccountStatus DEFAULT N'active';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Users_AccountStatus')
    ALTER TABLE dbo.Users ADD CONSTRAINT CK_Users_AccountStatus CHECK (AccountStatus IN (N'active', N'disabled'));
GO

IF COL_LENGTH(N'dbo.Products', N'ModerationStatus') IS NULL
    ALTER TABLE dbo.Products ADD ModerationStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_Products_ModerationStatus DEFAULT N'normal';
GO
IF COL_LENGTH(N'dbo.Products', N'AdminOfflineReason') IS NULL
    ALTER TABLE dbo.Products ADD AdminOfflineReason NVARCHAR(300) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Products_ModerationStatus')
    ALTER TABLE dbo.Products ADD CONSTRAINT CK_Products_ModerationStatus CHECK (ModerationStatus IN (N'normal', N'admin_offline'));
GO

IF COL_LENGTH(N'dbo.RiskLogs', N'ReviewStatus') IS NULL
    ALTER TABLE dbo.RiskLogs ADD ReviewStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_RiskLogs_ReviewStatus DEFAULT N'pending';
GO
IF COL_LENGTH(N'dbo.RiskLogs', N'ReviewNote') IS NULL ALTER TABLE dbo.RiskLogs ADD ReviewNote NVARCHAR(500) NULL;
GO
IF COL_LENGTH(N'dbo.RiskLogs', N'ReviewedBy') IS NULL ALTER TABLE dbo.RiskLogs ADD ReviewedBy INT NULL;
GO
IF COL_LENGTH(N'dbo.RiskLogs', N'ReviewedAt') IS NULL ALTER TABLE dbo.RiskLogs ADD ReviewedAt DATETIME2(0) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_RiskLogs_ReviewStatus')
    ALTER TABLE dbo.RiskLogs ADD CONSTRAINT CK_RiskLogs_ReviewStatus CHECK (ReviewStatus IN (N'pending', N'confirmed', N'false_positive', N'resolved'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_RiskLogs_ReviewedBy')
    ALTER TABLE dbo.RiskLogs ADD CONSTRAINT FK_RiskLogs_ReviewedBy FOREIGN KEY (ReviewedBy) REFERENCES dbo.Users(UserId);
GO

IF OBJECT_ID(N'dbo.AdminAuditLogs', N'U') IS NULL
BEGIN
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
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.AdminAuditLogs') AND name = N'IX_AdminAuditLogs_CreatedAt')
    CREATE INDEX IX_AdminAuditLogs_CreatedAt ON dbo.AdminAuditLogs(CreatedAt DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.RiskLogs') AND name = N'IX_RiskLogs_ReviewStatus')
    CREATE INDEX IX_RiskLogs_ReviewStatus ON dbo.RiskLogs(ReviewStatus, CreatedAt DESC);
GO

SELECT N'004_admin_moderation applied' AS MigrationResult;
GO
