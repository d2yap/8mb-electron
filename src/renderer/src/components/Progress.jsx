//progress react component
export default function Progress({ progress = 0, status }) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div style={{ marginTop: 12 }}>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} style={{ width: '100%' }}>
        <div style={{
          height: 12,
          borderRadius: 8,
          background: 'var(--border)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent), #1e40af)',
            transition: 'width 200ms linear',
          }} />
        </div>
      </div>
      <div id="statusText" style={{ marginTop: 8, fontWeight: 600 }}>{status} {pct ? `- ${pct.toFixed(0)}%` : ''}</div>
    </div>
  )
}
