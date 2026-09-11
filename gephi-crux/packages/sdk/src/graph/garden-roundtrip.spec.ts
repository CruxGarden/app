import { describe, expect, it } from 'vitest';
import { getEmptyGraphDataset, datasetToString, parseDataset } from './index';
describe('portable Garden graph dataset', () => {
 it('round-trips 6000 nodes, edges, coordinates and data beyond the browser recovery cutoff', () => {
  const graph = getEmptyGraphDataset();
  for (let i=0;i<6000;i++) { const key=String(i); graph.fullGraph.addNode(key); graph.nodeData[key]={label:'Node '+i}; graph.layout[key]={x:i,y:-i}; if(i) graph.fullGraph.addEdge(String(i-1),key); }
  const restored=parseDataset(datasetToString(graph))!;
  expect(restored.fullGraph.order).toBe(6000);
  expect(restored.fullGraph.size).toBe(5999);
  expect(restored.nodeData['5999']).toEqual({label:'Node 5999'});
  expect(restored.layout['5999']).toEqual({x:5999,y:-5999});
 });
});
