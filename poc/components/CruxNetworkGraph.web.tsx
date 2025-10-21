import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Colors, Fonts, FontSizes } from '@/constants/theme';

interface Node {
  id: string;
  name: string;
  slug: string;
  type?: string;
  status?: string;
}

interface Link {
  source: string;
  target: string;
  type: 'gate' | 'garden' | 'growth' | 'graft';
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface CruxNetworkGraphProps {
  authorKey: string;
}

export default function CruxNetworkGraph({ authorKey }: CruxNetworkGraphProps) {
  const router = useRouter();
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [graphReady, setGraphReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ForceGraph, setForceGraph] = useState<any>(null);
  const graphRef = useRef();

  // Dynamically import the force graph library
  useEffect(() => {
    import('react-force-graph-2d').then((module) => {
      setForceGraph(() => module.default);
    });
  }, []);

  useEffect(() => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

    // Fetch graph data from API
    fetch(`${apiUrl}/authors/${authorKey}/graph`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch graph data');
        return res.json();
      })
      .then((data) => {
        setGraphData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        setGraphReady(true);
      });
  }, [authorKey]);

  // Center graph after data loads
  useEffect(() => {
    if (graphRef.current && graphData.nodes.length > 0 && ForceGraph) {
      // Wait for graph to render and stabilize, then center it
      const timer = setTimeout(() => {
        if (graphRef.current) {
          const graph = graphRef.current as any;
          console.log(graph);
          graph.zoomToFit?.(100, 100);
          setGraphReady(true);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else if (!loading && graphData.nodes.length === 0) {
      // If there are no nodes, mark as ready immediately
      setGraphReady(true);
    }
  }, [graphData, ForceGraph, loading]);

  // Dimension type colors (using theme)
  const getLinkColor = (link: Link) => {
    const colors = {
      gate: Colors.gate, // Faded blue-gray - origins/sources
      garden: Colors.garden, // Faded mint green - creations/consequences
      growth: Colors.growth, // Faded amber-brown - evolution
      graft: Colors.graft, // Faded purple-gray - associations
    };
    return colors[link.type];
  };

  const getNodeColor = (node: Node) => {
    // Customize based on status
    if (node.status === 'living') return Colors.accentSecondary;
    if (node.status === 'dormant') return Colors.textTertiary;
    return Colors.accentPrimary;
  };

  if (!ForceGraph || loading) {
    return (
      <div
        style={{
          width: '800px',
          height: '600px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: Colors.background,
          color: Colors.textPrimary,
          margin: '0 auto',
          borderRadius: '12px',
          border: `1px solid ${Colors.border}`,
          fontFamily: Fonts.body,
          fontSize: `${FontSizes.lg}px`,
        }}
      >
        Loading network...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          width: '800px',
          height: '600px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: Colors.background,
          color: Colors.error,
          margin: '0 auto',
          borderRadius: '12px',
          border: `1px solid ${Colors.border}`,
          fontFamily: Fonts.body,
          fontSize: `${FontSizes.lg}px`,
        }}
      >
        Error: {error}
      </div>
    );
  }

  if (graphData.nodes.length === 0) {
    return (
      <div
        style={{
          width: '800px',
          height: '600px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: Colors.background,
          color: Colors.textTertiary,
          margin: '0 auto',
          borderRadius: '12px',
          border: `1px solid ${Colors.border}`,
          fontFamily: Fonts.body,
          fontSize: `${FontSizes.lg}px`,
        }}
      >
        No cruxes found
      </div>
    );
  }

  const ForceGraphComponent = ForceGraph;

  return (
    <div
      style={{
        width: '800px',
        height: '600px',
        backgroundColor: Colors.background,
        position: 'relative',
        margin: '0 auto',
        borderRadius: '12px',
        border: `1px solid ${Colors.border}`,
        overflow: 'hidden',
      }}
    >
      {/* Loading overlay */}
      {!graphReady && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: Colors.background,
            color: Colors.textPrimary,
            zIndex: 10,
            fontFamily: Fonts.body,
            fontSize: `${FontSizes.lg}px`,
          }}
        >
          Loading network...
        </div>
      )}
      <ForceGraphComponent
        ref={graphRef}
        width={800}
        height={600}
        graphData={graphData}
        nodeLabel="name"
        nodeColor={getNodeColor}
        linkColor={getLinkColor}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.2}
        backgroundColor={Colors.background}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        cooldownTicks={100}
        onNodeClick={(node: any) => {
          // Navigate to crux using app format: /@username/+slug
          if (node.slug) {
            const username = authorKey.replace('@', '');
            router.push(`/@${username}/+${node.slug}`);
          }
        }}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          // Custom node rendering
          const label = node.name || 'Untitled';
          const fontSize = FontSizes.sm / globalScale;
          const nodeSize = 5;

          // Draw node circle
          ctx.fillStyle = getNodeColor(node);
          ctx.beginPath();
          ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
          ctx.fill();

          // Draw label
          ctx.font = `${fontSize}px ${Fonts.body}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = Colors.textPrimary;
          ctx.fillText(label, node.x, node.y + nodeSize + 8);
        }}
      />

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          backgroundColor: Colors.surfaceElevated,
          padding: '16px',
          borderRadius: '8px',
          color: Colors.textPrimary,
          fontSize: `${FontSizes.sm}px`,
          border: `1px solid ${Colors.border}`,
          fontFamily: Fonts.body,
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Dimensions</div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ width: 20, height: 3, backgroundColor: Colors.gate, marginRight: 8 }}></div>
          Gate (origins)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <div
            style={{ width: 20, height: 3, backgroundColor: Colors.garden, marginRight: 8 }}
          ></div>
          Garden (creations)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <div
            style={{ width: 20, height: 3, backgroundColor: Colors.growth, marginRight: 8 }}
          ></div>
          Growth (evolution)
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{ width: 20, height: 3, backgroundColor: Colors.graft, marginRight: 8 }}
          ></div>
          Graft (associations)
        </div>
      </div>
    </div>
  );
}
