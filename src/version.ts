import https from 'https';

const RESOURCE = GetCurrentResourceName();
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_REPOSITORY = 'https://github.com/suh112/nbmysql';

let lastAnnounced: string | null = null;

function normalize(version: string): number[] {
    return version
        .trim()
        .replace(/^v/i, '')
        .split(/[-+]/)[0]
        .split('.')
        .map((part) => parseInt(part, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
    const a = normalize(latest);
    const b = normalize(current);
    const length = Math.max(a.length, b.length);

    for (let i = 0; i < length; i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        if (diff !== 0) return diff > 0;
    }

    return false;
}

function getRepository(): { slug: string; url: string } | null {
    const metadata = GetResourceMetadata(RESOURCE, 'repository', 0) || FALLBACK_REPOSITORY;
    const match = metadata.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i);

    if (!match) return null;

    return { slug: `${match[1]}/${match[2]}`, url: `https://github.com/${match[1]}/${match[2]}` };
}

function fetchLatestTag(slug: string): Promise<string | null> {
    return new Promise((resolve) => {
        const request = https.get(
            `https://api.github.com/repos/${slug}/releases/latest`,
            {
                headers: { 'User-Agent': `${RESOURCE}-version-checker`, Accept: 'application/vnd.github+json' },
                timeout: 10000,
            },
            (response) => {
                if (response.statusCode !== 200) {
                    response.resume();
                    resolve(null);
                    return;
                }

                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => (body += chunk));
                response.on('end', () => {
                    try {
                        resolve(JSON.parse(body).tag_name ?? null);
                    } catch {
                        resolve(null);
                    }
                });
            },
        );

        request.on('timeout', () => request.destroy());
        request.on('error', () => resolve(null));
    });
}

async function check(): Promise<void> {
    const repository = getRepository();
    const current = GetResourceMetadata(RESOURCE, 'version', 0);

    if (!repository || !current) return;

    const tag = await fetchLatestTag(repository.slug);

    if (!tag || tag === lastAnnounced || !isNewer(tag, current)) return;

    lastAnnounced = tag;
    console.log(
        `^3[${RESOURCE}]^7 Your script is outdated. Installed: ^1${current}^7, latest: ^2${tag.replace(/^v/i, '')}^7 - ${repository.url}/releases/latest`,
    );
}

export function startVersionChecker(): void {
    if (GetConvar('nbmysql_version_check', 'true') === 'false') return;

    const run = () => {
        check().catch(() => undefined);
    };

    run();

    const timer = setInterval(run, CHECK_INTERVAL_MS);
    if (typeof (timer as any).unref === 'function') (timer as any).unref();
}
