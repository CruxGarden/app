// Local catalog for the explicitly supported editor subset. Engine 2.22.1 values.
// This is not the upstream test catalog or a copy of the hosted backend's schema.
const object = (properties) => ({ type: 'object', properties });
const value = (defaultValue, extra = {}) => ({
    type: Array.isArray(defaultValue) ? 'array' : defaultValue === null ? 'object' : typeof defaultValue,
    default: defaultValue,
    ...(Array.isArray(defaultValue) ? { items: { type: 'number' } } : {}),
    ...extra
});
const fields = (defaults) => Object.fromEntries(Object.entries(defaults).map(([key, item]) => [key, value(item)]));
const vector = (v) => value(v, { minItems: v.length, maxItems: v.length });
export const projectDefaults = {
    id: 'project_1',
    engineV2: true,
    width: 960,
    height: 640,
    antiAlias: true,
    enableWebGl2: true,
    enableWebGpu: false,
    useLegacyScripts: false,
    externalScripts: [],
    scripts: [],
    i18nAssets: [],
    plugins: [],
    batchGroups: {},
    use3dPhysics: false,
    useDevicePixelRatio: true,
    fillMode: 'FILL_WINDOW',
    resolutionMode: 'AUTO',
    useKeyboard: true,
    useMouse: true,
    useTouch: true,
    useGamepads: false,
    preserveDrawingBuffer: false,
    transparentCanvas: false,
    powerPreference: 'default',
    maxAssetRetries: 0,
    maxConcurrentRequests: 8,
    withCredentials: false,
    layers: {
        0: { name: 'World', opaqueSortMode: 2, transparentSortMode: 3 },
        1: { name: 'Depth', opaqueSortMode: 2, transparentSortMode: 3 },
        2: { name: 'Skybox', opaqueSortMode: 0, transparentSortMode: 3 },
        3: { name: 'Immediate', opaqueSortMode: 0, transparentSortMode: 3 },
        4: { name: 'UI', opaqueSortMode: 1, transparentSortMode: 1 }
    },
    layerOrder: [
        { layer: 0, transparent: false, enabled: true },
        { layer: 1, transparent: false, enabled: true },
        { layer: 2, transparent: false, enabled: true },
        { layer: 0, transparent: true, enabled: true },
        { layer: 3, transparent: false, enabled: true },
        { layer: 3, transparent: true, enabled: true },
        { layer: 4, transparent: true, enabled: true }
    ]
};
export const editorDefaults = {
    gridDivisions: 20,
    gridDivisionSize: 1,
    cameraNearClip: 0.1,
    cameraFarClip: 1000,
    cameraClearColor: [0.12, 0.12, 0.12, 1],
    cameraToneMapping: 0,
    cameraGammaCorrection: 1,
    snapIncrement: 1,
    showFog: true,
    lastSelectedFontId: -1,
    pipeline: { defaultAssetPreload: true },
    cameras: {}
};
export const sceneDefaults = {
    physics: { gravity: [0, -9.8, 0] },
    render: {
        fog: 'none',
        fog_color: [0, 0, 0],
        fog_start: 1,
        fog_end: 1000,
        fog_density: 0,
        global_ambient: [0.4, 0.4, 0.4],
        gamma_correction: 1,
        tonemapping: 0,
        exposure: 1,
        skyboxIntensity: 1,
        skyboxMip: 0,
        skyboxRotation: [0, 0, 0],
        skybox: null,
        lightmapMode: 1,
        lightmapMaxResolution: 2048,
        lightmapSizeMultiplier: 16,
        clusteredLightingEnabled: true
    }
};
const components = {
    render: object(
        fields({
            enabled: true,
            type: 'box',
            castShadows: true,
            shadowCascadeMask: 15,
            receiveShadows: true,
            castShadowsLightmap: true,
            lightmapped: false,
            lightmapSizeMultiplier: 1,
            isStatic: false,
            layers: [0],
            materialAssets: [],
            asset: null,
            batchGroupId: -1,
            rootBone: null
        })
    ),
    camera: object({
        ...fields({
            enabled: true,
            projection: 0,
            fov: 45,
            horizontalFov: false,
            nearClip: 0.1,
            farClip: 1000,
            clearColorBuffer: true,
            clearDepthBuffer: true,
            priority: 0,
            frustumCulling: true,
            layers: [0, 1, 2, 3, 4],
            gammaCorrection: 1,
            toneMapping: 0
        }),
        clearColor: vector([0.08, 0.09, 0.12, 1]),
        rect: vector([0, 0, 1, 1])
    }),
    light: object({
        ...fields({
            enabled: true,
            type: 'directional',
            intensity: 1,
            castShadows: false,
            layers: [0],
            shadowDistance: 40,
            shadowResolution: 1024,
            shadowBias: 0.05,
            normalOffsetBias: 0,
            range: 10,
            innerConeAngle: 40,
            outerConeAngle: 45,
            falloffMode: 0
        }),
        color: vector([1, 1, 1])
    }),
    script: object({
        enabled: value(true),
        order: value([], { items: { type: 'string' } }),
        scripts: { type: 'object', additionalProperties: {}, default: {}, 'x-open-map': true }
    })
};
components.render.properties.asset['x-editor-type'] = 'asset';
components.render.properties.materialAssets['x-editor-type'] = 'array:asset';
components.render.properties.rootBone['x-editor-type'] = 'entity';
const entity = object({
    ...fields({ name: 'Entity', tags: [], enabled: true, parent: null, children: [], resource_id: '' }),
    position: vector([0, 0, 0]),
    rotation: vector([0, 0, 0]),
    scale: vector([1, 1, 1]),
    components: object(components)
});
/** @type {Record<string, any>} */
const settings = Object.fromEntries(
    Object.entries(projectDefaults).map(([key, v]) => [key, value(v, { 'x-scope': 'project' })])
);
settings.editor = object(
    Object.fromEntries(Object.entries(editorDefaults).map(([key, v]) => [key, value(v, { 'x-scope': 'projectUser' })]))
);
export const schema = {
    version: 1,
    documents: {
        scene: object({
            settings: object({
                physics: object(fields(sceneDefaults.physics)),
                render: object(fields(sceneDefaults.render))
            }),
            entities: { type: 'object', additionalProperties: entity, 'x-open-map': true }
        }),
        settings: object(settings),
        asset: object({ type: { type: 'string', enum: ['texture', 'script', 'material', 'folder', 'json', 'text'] } })
    },
    assetData: {
        material: object({
            ...fields({
                name: 'Material',
                opacity: 1,
                blendType: 0,
                useLighting: true,
                metalness: 0,
                gloss: 25,
                useMetalness: false,
                diffuseMap: null,
                emissiveMap: null,
                emissiveIntensity: 1,
                cull: 1,
                depthWrite: true,
                depthTest: true
            }),
            diffuse: vector([0.7, 0.7, 0.7]),
            emissive: vector([0, 0, 0]),
            specular: vector([0.2, 0.2, 0.2])
        }),
        texture: object(
            fields({
                minfilter: 5,
                magfilter: 1,
                addressu: 0,
                addressv: 0,
                mipmaps: true,
                anisotropy: 1,
                flipY: false,
                type: 'default'
            })
        ),
        script: object({ order: value(0), scripts: { type: 'object', additionalProperties: {}, default: {} } }),
        folder: object({}),
        json: object({}),
        text: object({})
    },
    assetMeta: {}
};
