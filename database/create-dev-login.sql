:ON ERROR EXIT
:setvar LoginName "campusloop_dev"

USE master;
GO

IF N'$(CampusLoopPassword)' = N''
BEGIN
    THROW 50000, 'CampusLoopPassword is required. Run with: sqlcmd ... -v CampusLoopPassword="your_password" -i database\create-dev-login.sql', 1;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'$(LoginName)')
BEGIN
    DECLARE @CreateLoginSql NVARCHAR(MAX) =
        N'CREATE LOGIN ' + QUOTENAME(N'$(LoginName)') +
        N' WITH PASSWORD = ' + QUOTENAME(N'$(CampusLoopPassword)', N'''') +
        N', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;';
    EXEC sys.sp_executesql @CreateLoginSql;
END;
GO

IF IS_SRVROLEMEMBER(N'dbcreator', N'$(LoginName)') = 0
BEGIN
    ALTER SERVER ROLE dbcreator ADD MEMBER [$(LoginName)];
END;
GO

USE CampusLoopDB;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$(LoginName)')
BEGIN
    CREATE USER [$(LoginName)] FOR LOGIN [$(LoginName)];
END;
GO

IF IS_ROLEMEMBER(N'db_datareader', N'$(LoginName)') = 0
BEGIN
    ALTER ROLE db_datareader ADD MEMBER [$(LoginName)];
END;

IF IS_ROLEMEMBER(N'db_datawriter', N'$(LoginName)') = 0
BEGIN
    ALTER ROLE db_datawriter ADD MEMBER [$(LoginName)];
END;
GO
