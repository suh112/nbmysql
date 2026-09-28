import { readdirSync, readFileSync, writeFileSync, copyFileSync, renameSync, existsSync } from 'fs';
import { join, basename, extname, relative } from 'path';
import { logInfo, logError } from './logger';

const BACKUP_SUFFIX = '.nbmysql.bak';
const SKIP_RESOURCES = new Set(['nbmysql', 'oxmysql']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'web', 'html', 'ui', 'stream']);

type FileKind = 'manifest' | 'lua' | 'code';

interface Rule {
    pattern: RegExp;
    replace: string;
}

interface ReviewRule {
    pattern: RegExp;
    note: string;
}

interface FileChange {
    path: string;
    next: string;
    replacements: number;
}

interface ReviewItem {
    path: string;
    line: number;
    note: string;
}

interface ResourceReport {
    name: string;
    base: string;
    changes: FileChange[];
    review: ReviewItem[];
}

const PATH_RULE: Rule = { pattern: /@oxmysql\/lib\/MySQL\.lua/g, replace: '@nbmysql/lib/init.lua' };

const RULES: Record<'manifest' | 'lua', Rule[]> = {
    manifest: [PATH_RULE, { pattern: /(['"])oxmysql\1/g, replace: '$1nbmysql$1' }],
    lua: [
        PATH_RULE,
        { pattern: /exports\.oxmysql\b/g, replace: 'exports.nbmysql' },
        { pattern: /exports\[(['"])oxmysql\1\]/g, replace: "exports['nbmysql']" },
        { pattern: /GetResourceState\((['"])oxmysql\1\)/g, replace: "GetResourceState('nbmysql')" },
    ],
};

const REVIEW_RULES: ReviewRule[] = [
    { pattern: /MySQL\.Sync\./, note: 'mysql-async style MySQL.Sync is not supported' },
    { pattern: /MySQL\.Async\.(fetchAll|fetchScalar|fetchSingle|fetch|execute)\b/, note: 'mysql-async style MySQL.Async call is not supported' },
    { pattern: /\b(query|single|scalar|insert|update|prepare|transaction)_async\b/, note: '*_async export is not provided by nbmysql' },
    { pattern: /\brawExecute\b/, note: 'rawExecute is not provided by nbmysql' },
    { pattern: /oxmysql/, note: 'still references oxmysql' },
];

function kindOf(file: string): FileKind | null {
    const name = basename(file);

    if (name.endsWith(BACKUP_SUFFIX)) return null;
    if (name === 'fxmanifest.lua' || name === '__resource.lua') return 'manifest';

    const ext = extname(name).toLowerCase();

    if (ext === '.lua') return 'lua';
    if (['.js', '.ts', '.mjs', '.cjs'].includes(ext)) return 'code';

    return null;
}

function walk(dir: string, out: string[] = []): string[] {
    let entries;

    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }

    for (const entry of entries) {
        const full = join(dir, entry.name);

        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) walk(full, out);
        } else {
            out.push(full);
        }
    }

    return out;
}

function listResources(): { name: string; base: string }[] {
    const resources: { name: string; base: string }[] = [];
    const total = GetNumResources();

    for (let i = 0; i < total; i++) {
        const name = GetResourceByFindIndex(i);

        if (!name || SKIP_RESOURCES.has(name)) continue;

        const base = GetResourcePath(name);

        if (base) resources.push({ name, base });
    }

    return resources;
}

function transform(source: string, kind: FileKind): { next: string; replacements: number } {
    if (kind === 'code') return { next: source, replacements: 0 };

    let next = source;
    let replacements = 0;

    for (const rule of RULES[kind]) {
        next = next.replace(rule.pattern, (...args) => {
            replacements++;
            const groups = args.slice(0, -2) as string[];

            return rule.replace.replace(/\$(\d)/g, (_, index: string) => groups[Number(index)] ?? '');
        });
    }

    return { next, replacements };
}

function scanResource(name: string, base: string): ResourceReport {
    const report: ResourceReport = { name, base, changes: [], review: [] };

    for (const file of walk(base)) {
        const kind = kindOf(file);

        if (!kind) continue;

        let source: string;

        try {
            source = readFileSync(file, 'utf8');
        } catch {
            continue;
        }

        if (!/oxmysql|MySQL\.(Sync|Async)|_async|rawExecute/.test(source)) continue;

        const { next, replacements } = transform(source, kind);

        if (replacements > 0) report.changes.push({ path: file, next, replacements });

        next.split('\n').forEach((line, index) => {
            for (const rule of REVIEW_RULES) {
                if (rule.pattern.test(line)) {
                    report.review.push({ path: file, line: index + 1, note: rule.note });
                    break;
                }
            }
        });
    }

    return report;
}

function rel(base: string, file: string): string {
    return relative(base, file).replace(/\\/g, '/');
}

function isPermissionError(err: unknown): boolean {
    const error = err as NodeJS.ErrnoException;

    return error.code === 'ERR_ACCESS_DENIED' || error.code === 'EACCES' || error.code === 'EPERM';
}

function reportDenied(denied: Set<string>): void {
    if (!denied.size) return;

    logError('FiveM blocked writing to other resources. Add these lines to server.cfg, restart, then run again:');

    for (const name of denied) {
        console.log(`add_filesystem_permission nbmysql write ${name}`);
    }
}

function scan(apply: boolean): void {
    const resources = listResources();
    const reports = resources.map((r) => scanResource(r.name, r.base)).filter((r) => r.changes.length || r.review.length);

    logInfo(`migratesql: scanned ${resources.length} resources (${apply ? 'applying' : 'dry run'}).`);

    let files = 0;
    let written = 0;
    let touched = 0;
    let reviewCount = 0;
    const denied = new Set<string>();

    for (const report of reports) {
        console.log(`^5${report.name}^7`);

        for (const change of report.changes) {
            console.log(`  ^2rewrite^7 ${rel(report.base, change.path)} (${change.replacements})`);
            files++;

            if (apply) {
                const backup = change.path + BACKUP_SUFFIX;

                try {
                    if (!existsSync(backup)) copyFileSync(change.path, backup);
                    writeFileSync(change.path, change.next);
                    written++;
                } catch (err) {
                    if (isPermissionError(err)) {
                        denied.add(report.name);
                    } else {
                        logError(`Failed to write ${rel(report.base, change.path)}: ${(err as Error).message}`);
                    }
                }
            }
        }

        for (const item of report.review) {
            console.log(`  ^3review^7 ${rel(report.base, item.path)}:${item.line} ${item.note}`);
            reviewCount++;
        }

        if (report.changes.length) touched++;
    }

    if (!reports.length) {
        logInfo('Nothing references oxmysql. Nothing to do.');
        return;
    }

    if (apply) {
        logInfo(`${written}/${files} file(s) rewritten, ${reviewCount} line(s) need manual review.`);
    } else {
        logInfo(`${files} file(s) in ${touched} resource(s) would be rewritten, ${reviewCount} line(s) need manual review.`);
    }

    if (!apply) {
        logInfo('Run `migratesql apply` to write the changes (a .nbmysql.bak backup is kept for every file).');
        return;
    }

    reportDenied(denied);

    if (written === 0) return;

    logInfo('Next: replace `ensure oxmysql` with `ensure nbmysql` in server.cfg (before the resources that use it) and restart. Undo with `migratesql revert`.');
}

function revert(): void {
    let restored = 0;
    const denied = new Set<string>();

    for (const { name, base } of listResources()) {
        for (const file of walk(base)) {
            if (!file.endsWith(BACKUP_SUFFIX)) continue;

            try {
                renameSync(file, file.slice(0, -BACKUP_SUFFIX.length));
                restored++;
            } catch (err) {
                if (isPermissionError(err)) {
                    denied.add(name);
                } else {
                    logError(`Failed to restore ${rel(base, file)}: ${(err as Error).message}`);
                }
            }
        }
    }

    reportDenied(denied);

    logInfo(restored ? `Restored ${restored} file(s) from backup.` : 'No backups found.');
}

export function registerMigrateCommand(): void {
    RegisterCommand(
        'migratesql',
        (source: number, args: string[]) => {
            if (source !== 0) return;

            const mode = (args[0] || 'scan').toLowerCase();

            if (mode === 'apply') return scan(true);
            if (mode === 'revert') return revert();
            if (mode === 'scan' || mode === 'dry') return scan(false);

            logInfo('Usage: migratesql [scan | apply | revert]');
        },
        true,
    );
}
