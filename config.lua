---@class NbMySQLConfig
---@field ConnectionString string
---@field Debug boolean
---@field PoolSize integer
---@field SlowQueryWarningMs integer
---@field MaxRetries integer
---@field DefaultCacheTtlMs integer
---@field VersionCheck boolean

Config = {}

Config.ConnectionString = GetConvar('mysql_connection_string', 'mysql://user:password@localhost/database')

Config.Debug = GetConvar('nbmysql_debug', 'false') == 'true'

Config.PoolSize = tonumber(GetConvar('nbmysql_pool_size', '10')) --[[@as integer]]

Config.SlowQueryWarningMs = tonumber(GetConvar('nbmysql_slow_query_ms', '150')) --[[@as integer]]

Config.MaxRetries = tonumber(GetConvar('nbmysql_max_retries', '3')) --[[@as integer]]

Config.DefaultCacheTtlMs = tonumber(GetConvar('nbmysql_cache_ttl_ms', '5000')) --[[@as integer]]

Config.VersionCheck = GetConvar('nbmysql_version_check', 'true') == 'true'
