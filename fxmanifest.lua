fx_version 'cerulean'
game 'common'
lua54 'yes'

name 'nbmysql'
author 'nullbound (aj)'
description 'TypeScript-based MySQL wrapper for FiveM with self-invalidating cache, request coalescing, per-resource cost attribution, and built-in migrations'
version '1.0.0'
license 'LGPL-3.0-or-later'
repository 'https://github.com/nullbound/nbmysql'

node_version '22'

shared_scripts {
    'config.lua'
}

server_scripts {
    'server/console.lua',
    'dist/server.js'
}

files {
    'lib/init.lua',
    'migrations/*.sql'
}
