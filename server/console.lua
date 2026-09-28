AddEventHandler('nbmysql:ready', function()
    print('^2[nbmysql]^7 Database connection established.')
end)

AddEventHandler('nbmysql:connectionError', function(message)
    print(('^1[nbmysql] ERROR:^7 Failed to connect to database: %s'):format(message))
end)

AddEventHandler('nbmysql:migrationApplied', function(name)
    print(('^3[nbmysql]^7 Applied migration: %s'):format(name))
end)

AddEventHandler('nbmysql:migrationFailed', function(name, message)
    print(('^1[nbmysql] ERROR:^7 Migration failed (%s): %s'):format(name, message))
end)

AddEventHandler('onResourceStart', function(resourceName)
    if resourceName == 'nbmysql' then
        print('^5[nbmysql]^7 Starting up...')
    end
end)
