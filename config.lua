Config = {}

Config.ConnectionString = GetConvar('mysql_connection_string', 'mysql://user:password@localhost/database')

Config.Debug = GetConvar('nbmysql_debug', 'false') == 'true'

Config.PoolSize = tonumber(GetConvar('nbmysql_pool_size', '10'))

Config.SlowQueryWarningMs = tonumber(GetConvar('nbmysql_slow_query_ms', '150'))

Config.MaxRetries = tonumber(GetConvar('nbmysql_max_retries', '3'))

Config.DefaultCacheTtlMs = tonumber(GetConvar('nbmysql_cache_ttl_ms', '5000'))

Config.VersionCheck = GetConvar('nbmysql_version_check', 'true') == 'true'
