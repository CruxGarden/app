import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Mesh, MeshLambertMaterial } from 'three';
import { GRAPH_ARROW_OPACITY, graphLinkMaterial } from './graph-material';

let ThreeForceGraph: typeof import('three-forcegraph').default;
beforeAll(async () => {
  // The engine checks window.THREE before using its imported Three classes.
  vi.stubGlobal('window', {});
  ThreeForceGraph = (await import('three-forcegraph')).default;
});
afterAll(() => vi.unstubAllGlobals());

// Exercise the installed engine, including its independent arrow-alpha path.
// A token-only assertion misses the engine's default .75 node / 3× arrow alpha.
it.each([0, 0.25, 0.4, 1])(
  'retains chosen alpha %s in actual Three nodes, links and arrows',
  async (alpha) => {
    const color = `rgba(43, 173, 227, ${alpha})`;
    const linkMaterial = graphLinkMaterial(color);
    const graph = new ThreeForceGraph()
      .cooldownTicks(0)
      .nodeOpacity(1)
      .nodeColor(() => color)
      .linkWidth(2)
      .linkColor(() => color)
      .linkMaterial(() => linkMaterial)
      .linkOpacity(GRAPH_ARROW_OPACITY)
      .linkDirectionalArrowLength(5)
      .graphData({
        nodes: [
          { id: 'a', fx: 0, fy: 0, fz: 0 },
          { id: 'b', fx: 40, fy: 20, fz: 0 },
        ],
        links: [{ source: 'a', target: 'b' }],
      });
    try {
      await vi.waitFor(() => expect(graph.children).toHaveLength(4));
      graph.tickFrame();
      const meshes = graph.children as Mesh[];
      expect(meshes.every((mesh) => mesh.isMesh)).toBe(true);
      for (const mesh of meshes) {
        const material = mesh.material as MeshLambertMaterial;
        expect(material.opacity).toBeCloseTo(alpha, 8);
        expect(material.color.getHexString()).toBe('2bade3');
      }
      expect(meshes.some((mesh) => mesh.geometry.type === 'ConeGeometry')).toBe(true);
      expect(meshes.some((mesh) => mesh.material === linkMaterial)).toBe(true);
    } finally {
      graph.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      graph.clear();
    }
  },
);
