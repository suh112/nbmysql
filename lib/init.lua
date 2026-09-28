local resource = 'nbmysql'

local function call(method, ...)
    return exports[resource][method](nil, ...)
end

local function build(method, arity)
    local function normalize(...)
        local n = select('#', ...)
        local args = { ... }
        local cb

        if type(args[n]) == 'function' then
            cb = args[n]
            args[n] = nil
        end

        if arity >= 2 and args[2] == nil then
            args[2] = {}
        end

        return args, cb
    end

    local function invoke(args, cb)
        local packed = {}

        for i = 1, arity do
            packed[i] = args[i]
        end

        packed[arity + 1] = cb

        return call(method, table.unpack(packed, 1, arity + 1))
    end

    local api = {}

    function api.await(...)
        local args = normalize(...)
        local p = promise.new()

        invoke(args, function(result)
            p:resolve(result)
        end)

        return Citizen.Await(p)
    end

    return setmetatable(api, {
        __call = function(_, ...)
            local args, cb = normalize(...)

            if cb then
                invoke(args, cb)
                return
            end

            return api.await(...)
        end,
    })
end

local function callable(method)
    return function(...)
        return call(method, ...)
    end
end

MySQL = {}

MySQL.query = build('query', 2)

MySQL.cached = build('cachedQuery', 3)

MySQL.scalar = build('scalar', 2)

MySQL.single = build('single', 2)

MySQL.insert = build('insert', 2)

MySQL.update = build('update', 2)

MySQL.prepare = build('prepare', 2)

MySQL.transaction = build('transaction', 1)

function MySQL.ready(cb)
    CreateThread(function()
        while GetResourceState(resource) ~= 'started' or not call('isReady') do
            Wait(50)
        end

        cb()
    end)
end

function MySQL.stats()
    return call('stats')
end

function MySQL.clearCache()
    return call('clearCache')
end

MySQL.Async = {
    query = callable('query'),
    cached = callable('cachedQuery'),
    scalar = callable('scalar'),
    single = callable('single'),
    insert = callable('insert'),
    update = callable('update'),
    prepare = callable('prepare'),
    transaction = callable('transaction'),
}
