:ON ERROR EXIT
USE CampusLoopDB;
GO

IF COL_LENGTH(N'dbo.Users', N'DeletedAt') IS NULL
    ALTER TABLE dbo.Users ADD DeletedAt DATETIME2(0) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Users_AccountStatus')
    ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_AccountStatus;
GO
ALTER TABLE dbo.Users ADD CONSTRAINT CK_Users_AccountStatus CHECK (AccountStatus IN (N'active',N'disabled',N'deleted'));
GO

SELECT N'005_account_management applied' AS MigrationResult;
GO
