import { defineConfig } from 'tsdown';
import { thirdPartyLicenses } from './scripts/build/third-party-licenses.ts';

// The published bin. The package ships self-contained: runtime libraries live in devDependencies, so tsdown bundles them,
// and dist/THIRD_PARTY_LICENSES.md carries their licenses.
export default defineConfig({
    entry: ['src/mcp.ts'],
    format: 'esm',
    platform: 'node',
    target: 'node22',
    dts: false,
    clean: true,
    fixedExtension: false,
    plugins: [thirdPartyLicenses()],
});
