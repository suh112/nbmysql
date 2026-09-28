---@meta

local resource = 'nbmysql'

---@class NbMySQLMethod
---@overload fun(...: any): any
---@field await fun(...: any): any

---@param method string
---@param arity integer
---@return NbMySQLMethod
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
        local call = { table.unpack(args, 1, arity) }
        call[arity + 1] = cb

        return exports[resource][method](table.unpack(call, 1, arity + 1))
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

---@param method string
---@return fun(...: any)
local function callable(method)
    return function(...)
        exports[resource][method](...)
    end
end

---@class NbMySQL
MySQL = {}

---@type NbMySQLMethod
MySQL.query = build('query', 2)

---@type NbMySQLMethod
MySQL.cached = build('cachedQuery', 3)

---@type NbMySQLMethod
MySQL.scalar = build('scalar', 2)

---@type NbMySQLMethod
MySQL.single = build('single', 2)

---@type NbMySQLMethod
MySQL.insert = build('insert', 2)

---@type NbMySQLMethod
MySQL.update = build('update', 2)

---@type NbMySQLMethod
MySQL.prepare = build('prepare', 2)

---@class NbMySQLTransactionQuery
---@field query string
---@field params table?

---@type NbMySQLMethod
MySQL.transaction = build('transaction', 1)

---@param cb fun()
function MySQL.ready(cb)
    CreateThread(function()
        while GetResourceState(resource) ~= 'started' or not exports[resource].isReady() do
            Wait(50)
        end

        cb()
    end)
end

---@return table<string, { queries: integer, totalMs: number, slowQueries: integer, errors: integer, avgMs: number }>
function MySQL.stats()
    return exports[resource].stats()
end

function MySQL.clearCache()
    return exports[resource].clearCache()
end

---@class NbMySQLAsync
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
