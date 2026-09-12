const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc) {
    if (
        !object(doc) ||
        doc.version !== 1 ||
        doc.app !== 'playcanvas-editor' ||
        Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
    )
        throw Error('Invalid PlayCanvas project.');
    if (doc.project === null) return;
    if (!object(doc.project) || Object.keys(doc.project).length > 10004) throw Error('Invalid project components.');
    for (const key of ['scene', 'settings', 'assets', 'name'])
        if (!Object.hasOwn(doc.project, key)) throw Error('Missing project component.');
    for (const [key, value] of Object.entries(doc.project)) {
        if (!['scene', 'settings', 'assets', 'name'].includes(key) && !/^file-[1-9][0-9]*$/.test(key))
            throw Error('Invalid project component name.');
        if (object(value) && Object.keys(value).length === 1 && value.__cruxBinary) {
            const ref = value.__cruxBinary;
            if (
                !object(ref) ||
                !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
                ref.kind !== 'buffer' ||
                typeof ref.type !== 'string' ||
                !Number.isSafeInteger(ref.size) ||
                ref.size < 0 ||
                ref.size > 128000000 ||
                Object.keys(ref).some((k) => !['path', 'kind', 'type', 'size'].includes(k))
            )
                throw Error('Invalid project content reference.');
        } else if (key === 'name') {
            if (typeof value !== 'string' || value.length > 200) throw Error('Invalid project name.');
        } else if (key === 'scene') {
            if (
                !object(value) ||
                !object(value.entities) ||
                !object(value.settings) ||
                Object.keys(value.entities).length > 10000
            )
                throw Error('Invalid native scene.');
            let roots = 0;
            for (const [id, entity] of Object.entries(value.entities)) {
                if (
                    !/^[a-f0-9-]{36}$/i.test(id) ||
                    !object(entity) ||
                    entity.resource_id !== id ||
                    !Array.isArray(entity.children) ||
                    !object(entity.components) ||
                    !['position', 'rotation', 'scale'].every(
                        (k) => Array.isArray(entity[k]) && entity[k].length === 3 && entity[k].every(Number.isFinite)
                    )
                )
                    throw Error('Invalid native entity.');
                if (entity.parent === null) roots++;
                else if (typeof entity.parent !== 'string' || !Object.hasOwn(value.entities, entity.parent))
                    throw Error('Missing parent entity.');
                if (
                    new Set(entity.children).size !== entity.children.length ||
                    entity.children.some(
                        (child) => !Object.hasOwn(value.entities, child) || value.entities[child].parent !== id
                    )
                )
                    throw Error('Invalid child entity links.');
                if (entity.parent !== null && !value.entities[entity.parent].children?.includes(id))
                    throw Error('Parent does not contain child.');
            }
            if (roots !== 1) throw Error('A scene needs exactly one root.');
            const visited = new Set();
            const root = Object.values(value.entities).find((entity) => entity.parent === null);
            const pending = [root.resource_id];
            while (pending.length) {
                const id = pending.pop();
                if (visited.has(id)) throw Error('Cyclic scene hierarchy.');
                visited.add(id);
                pending.push(...value.entities[id].children);
            }
            if (visited.size !== Object.keys(value.entities).length) throw Error('Disconnected scene hierarchy.');
        } else if (key === 'settings' || key === 'assets') {
            if (!object(value)) throw Error('Invalid native settings or assets.');
        } else if (!object(value) || !(value.bytes instanceof Uint8Array) || typeof value.type !== 'string') {
            throw Error('Invalid original asset.');
        }
    }
}
