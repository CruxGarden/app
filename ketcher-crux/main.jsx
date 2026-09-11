import React from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import 'ketcher-react/dist/index.css';
import { validateState } from './garden/model.js';

export function mountEditor(garden, storage) {
  const provider = new StandaloneStructServiceProvider();
  let pending = 0;
  const createService = provider.createStructService.bind(provider);
  provider.createStructService = (options) => {
    const service = createService(options);
    return new Proxy(service, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        return (...args) => {
          const result = value.apply(target, args);
          if (!result || typeof result.then !== 'function') return result;
          pending++;
          return result.finally(() => pending--);
        };
      },
    });
  };
  async function initialize(ketcher) {
    try {
      // The public API belongs to the native editor and is useful for local
      // customization. Garden agents use the scoped host command boundary.
      window.ketcher = ketcher;
      if (garden.initial) await ketcher.setMolecule(JSON.stringify(garden.initial.structure));
      ketcher.changeEvent.add(garden.changed);
      async function inspect() {
        const structure = JSON.parse(await ketcher.getKet());
        const molecules = Object.values(structure).filter((value) => value?.type === 'molecule');
        return {
          molecules: molecules.length,
          atoms: molecules.reduce((sum, value) => sum + (value.atoms?.length || 0), 0),
          bonds: molecules.reduce((sum, value) => sum + (value.bonds?.length || 0), 0),
          reaction: ketcher.containsReaction(),
          smiles: await ketcher.getSmiles(),
        };
      }
      garden.connect({
        busy: () => pending > 0,
        async capture() {
          const state = { structure: JSON.parse(await ketcher.getKet()), storage: storage() };
          validateState(state);
          return state;
        },
        async command(command) {
          if (command.op === 'inspect') return inspect();
          if (
            command.op !== 'set-structure' ||
            typeof command.structure !== 'string' ||
            !command.structure.trim() ||
            command.structure.length > 100_000
          )
            throw new Error('Choose a structure up to 100,000 characters.');
          await ketcher.setMolecule(command.structure);
          garden.changed();
          return inspect();
        },
      });
    } catch (error) {
      garden.failed(error);
    }
  }
  createRoot(document.getElementById('root')).render(
    <Editor
      staticResourcesUrl="./"
      structServiceProvider={provider}
      disableMacromoleculesEditor
      onInit={initialize}
      errorHandler={(error) => garden.failed(new Error(String(error)))}
    />,
  );
}
