import { resolveAdapter } from './discovery.ts';
import type { AdapterSpec } from './discovery.ts';
import type { HarnessDefinition } from './types.ts';

// Gemini CLI speaks ACP itself (`gemini --acp`), so the adapter and the harness are one binary.
const spec: AdapterSpec = {
    id: 'gemini',
    installHint: 'npm i -g @google/gemini-cli',
    adapter: 'gemini',
    args: ['--acp'],
};

export const gemini: HarnessDefinition = {
    id: spec.id,
    resolve: (config, env) => resolveAdapter(spec, config, env),
    // Gemini CLI exposes no thought_level option (docs/harnesses.md).
    mapEffort: () => undefined,
    // Trust under both modes: an untrusted folder refuses `yolo`.
    permissionSetup: mode => ({
        modeId: mode === 'auto' ? 'yolo' : 'default',
        env: { GEMINI_CLI_TRUST_WORKSPACE: 'true' },
    }),
    // Gemini CLI echoes every set_mode as agent text.
    preTurnNoise: [/^\[MODE_UPDATE\] \S+$/],
};
