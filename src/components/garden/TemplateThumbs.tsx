
const T = {
  wrap: {
    width: '100%',
    height: 52,
    borderRadius: 4,
    overflow: 'hidden' as const,
    position: 'relative' as const,
    fontSize: 0,
  },
  bar: (w: string | number, h = 3, bg = '#555') => ({
    width: w,
    height: h,
    borderRadius: 1,
    background: bg,
  }),
  line: (w: string | number, h = 2, bg = '#444') => ({
    width: w,
    height: h,
    borderRadius: 1,
    background: bg,
  }),
  box: (w: string | number, h: string | number, bg = '#333') => ({
    width: w,
    height: h,
    borderRadius: 2,
    background: bg,
  }),
  flex: (gap = 3, dir: 'row' | 'column' = 'row') => ({
    display: 'flex' as const,
    gap,
    flexDirection: dir,
  }),
  col: (gap = 2) => ({ display: 'flex' as const, flexDirection: 'column' as const, gap }),
  pad: (p = 6) => ({ padding: p }),
  center: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
} as const;

/** The little pictures on the Add Crux cards: one hand-drawn thumbnail per app-owned template. */
export function BlankThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1a1a1a', ...T.center }}>
      <div style={{ ...T.col(3), alignItems: 'center' }}>
        <div style={T.bar(16, 16, '#252525')} />
        <div style={T.line(24, 2, '#252525')} />
      </div>
    </div>
  );
}

export function HomeThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1c1c1c', ...T.pad(6) }}>
      <div style={T.col(3)}>
        <div style={T.bar('55%', 5)} />
        <div style={T.line('45%', 2, '#3a3a3a')} />
        <div style={{ marginTop: 2, ...T.flex(3) }}>
          <div style={T.box(14, 5, '#2e4a3c')} />
          <div style={T.box(14, 5, '#2e4a3c')} />
          <div style={T.box(14, 5, '#2e4a3c')} />
        </div>
        <div style={{ marginTop: 2, ...T.col(2) }}>
          <div style={T.line('80%')} />
          <div style={T.line('65%')} />
        </div>
      </div>
    </div>
  );
}

export function BlogThumb() {
  return (
    <div style={{ ...T.wrap, background: '#1c1c1c', ...T.pad(6) }}>
      <div style={T.col(3)}>
        <div style={T.bar('40%', 3)} />
        <div style={T.line('90%')} />
        <div style={T.line('80%')} />
        <div style={T.line('70%')} />
        <div style={{ marginTop: 3, ...T.col(2) }}>
          <div style={T.bar('35%', 2)} />
          <div style={T.line('85%')} />
          <div style={T.line('60%')} />
        </div>
      </div>
    </div>
  );
}

export function ResumeThumb() {
  return (
    <div style={{ ...T.wrap, background: '#eef1fb', ...T.pad(7) }}>
      <div style={{ ...T.box('52%', 5, '#2c3350'), marginBottom: 3 }} />
      <div style={{ ...T.box('30%', 3, '#8b93b5'), marginBottom: 6 }} />
      {['88%', '70%', '80%'].map((w, i) => (
        <div key={i} style={{ ...T.box(w, 2, '#c3c9de'), marginBottom: 3 }} />
      ))}
      <div style={{ ...T.box('34%', 3, '#2c3350'), margin: '6px 0 3px' }} />
      {['82%', '64%'].map((w, i) => (
        <div key={i} style={{ ...T.box(w, 2, '#c3c9de'), marginBottom: 3 }} />
      ))}
    </div>
  );
}

export function BusinessThumb() {
  return (
    <div style={{ ...T.wrap, background: '#f4f4f2', ...T.pad(6) }}>
      <div style={{ ...T.flex(3), alignItems: 'center', marginBottom: 5 }}>
        <div style={{ ...T.box(8, 8, '#2f6f62'), borderRadius: 2 }} />
        <div style={T.line('18px', 2, '#b9b9b4')} />
        <div style={{ marginLeft: 'auto', ...T.box(14, 5, '#2f6f62'), borderRadius: 2 }} />
      </div>
      <div style={{ ...T.box('70%', 5, '#3c3c38'), marginBottom: 3 }} />
      <div style={{ ...T.box('48%', 3, '#b9b9b4'), marginBottom: 5 }} />
      <div style={T.flex(3)}>
        <div style={{ ...T.box('32%', 14, '#e2e2dd') }} />
        <div style={{ ...T.box('32%', 14, '#e2e2dd') }} />
        <div style={{ ...T.box('32%', 14, '#e2e2dd') }} />
      </div>
    </div>
  );
}

export function GalleryThumb() {
  return (
    <div style={{ ...T.wrap, background: '#0f0f0e', ...T.pad(6) }}>
      <div style={T.col(3)}>
        <div style={T.bar('34%', 3)} />
        <div style={{ ...T.flex(2) }}>
          <div style={{ ...T.box('46%', 14, '#3a4a52') }} />
          <div style={{ ...T.box('28%', 14, '#4a4238') }} />
          <div style={{ ...T.box('26%', 14, '#2f3f36') }} />
        </div>
        <div style={{ ...T.flex(2) }}>
          <div style={{ ...T.box('30%', 12, '#443a44') }} />
          <div style={{ ...T.box('42%', 12, '#38434f') }} />
          <div style={{ ...T.box('28%', 12, '#4b4030') }} />
        </div>
      </div>
    </div>
  );
}

export function FeedThumb() {
  return (
    <div style={{ ...T.wrap, background: '#161616', ...T.pad(6) }}>
      <div style={{ ...T.flex(4), alignItems: 'center', marginBottom: 4 }}>
        <div style={{ ...T.box(9, 9, '#d96c3f'), borderRadius: 5 }} />
        <div style={T.col(2)}>
          <div style={T.bar('22px', 2)} />
          <div style={T.line('14px', 2, '#3a3a3a')} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
        {['#3b2a24', '#1f3a2a', '#2a2f3b', '#3b3324', '#2b2b2b', '#24333b'].map((c, i) => (
          <div key={i} style={{ ...T.box('100%', 9, c) }} />
        ))}
      </div>
    </div>
  );
}

export function MediaThumb() {
  return (
    <div style={{ ...T.wrap, background: '#0c0d10', ...T.pad(6) }}>
      <div style={T.col(3)}>
        <div style={T.bar('40%', 3)} />
        <div style={{ ...T.flex(4), alignItems: 'center' }}>
          <div style={T.box(10, 10, '#1d2027')} />
          <div style={{ ...T.col(2), flex: 1 }}>
            <div style={T.line('60%')} />
            <div style={{ ...T.bar('100%', 3, '#22252c'), position: 'relative' }}>
              <div
                style={{ ...T.bar('45%', 3, '#5b8def'), position: 'absolute', left: 0, top: 0 }}
              />
            </div>
          </div>
        </div>
        <div style={{ ...T.box('100%', 14, '#000'), border: '1px solid #22252c' }} />
      </div>
    </div>
  );
}

export function FiveWsThumb() {
  return (
    <div style={{ ...T.wrap, background: '#171512', ...T.pad(6) }}>
      <div style={T.col(3)}>
        <div style={T.bar('55%', 5, '#c9bda6')} />
        <div style={{ height: 2 }} />
        <div style={{ ...T.flex(6) }}>
          <div style={T.col(2)}>
            <div style={T.line('100%', 2, '#6b6255')} />
            <div style={T.line('100%', 2, '#6b6255')} />
            <div style={T.line('100%', 2, '#6b6255')} />
            <div style={T.line('100%', 2, '#6b6255')} />
          </div>
          <div style={T.col(2)}>
            <div style={T.line('100%', 2, '#6b6255')} />
            <div style={T.line('100%', 2, '#6b6255')} />
            <div style={T.line('100%', 2, '#6b6255')} />
            <div style={T.line('100%', 2, '#6b6255')} />
          </div>
        </div>
      </div>
    </div>
  );
}
