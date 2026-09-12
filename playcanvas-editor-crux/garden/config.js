import { schema, projectDefaults } from './schema.js';
export function configure(initial) {
    const base = new URL('../', import.meta.url).href;
    const plan = { id: 1, type: 'free' };
    return {
        version: '2.32.0',
        self: {
            id: 1,
            username: 'local',
            flags: { tips: {} },
            plan,
            locale: 'en',
            branch: { id: 'local', name: 'Local', createdAt: '2026-09-11', latestCheckpointId: '' }
        },
        owner: { id: 1, username: 'local', plan, size: 0, diskAllowance: 128000000 },
        accessToken: '',
        project: {
            id: 1,
            name: initial?.name || 'PlayCanvas Project',
            description: '',
            permissions: { admin: [1], write: [], read: [] },
            private: false,
            privateAssets: false,
            hasPrivateSettings: false,
            thumbnails: {},
            masterBranch: 'local',
            settings: structuredClone(initial?.settings?.project || projectDefaults)
        },
        scene: { id: '1', uniqueId: '1' },
        aws: { s3Prefix: '' },
        store: { sketchfab: { clientId: '', cookieName: '', redirectUrl: '' } },
        url: {
            api: base + 'unavailable',
            home: base,
            launch: base + 'launch.html?scene=',
            frontend: base,
            engine: base + 'js/playcanvas.js',
            static: base + 'static',
            images: base + 'static/img',
            store: base + 'unavailable',
            howdoi: base + 'unavailable',
            realtime: { http: base + 'unavailable' },
            messenger: { http: base + 'unavailable', ws: '' },
            relay: { http: base + 'unavailable', ws: '' }
        },
        schema,
        engineVersions: {
            current: { version: '2.22.1', description: 'Local' },
            force: { version: '2.22.1', description: 'Local' }
        },
        wasmModules: [],
        sentry: { enabled: false },
        metrics: { env: 'local', send: false },
        oneTrustDomainKey: ''
    };
}
