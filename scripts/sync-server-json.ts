// `changeset version` bumps package.json only. The MCP Registry takes the version from server.json,
// so the release PR carries the same version there too.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const server = JSON.parse(readFileSync('server.json', 'utf8')) as {
    version: string;
    packages: { version: string }[];
};
server.version = version;
for (const pkg of server.packages) pkg.version = version;
writeFileSync('server.json', JSON.stringify(server, null, 4) + '\n');
