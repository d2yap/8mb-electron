import { Progress as MantineProgress} from '@mantine/core';

//progress react component
export default function Progress({ progress = 0, status }) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div style={{ marginTop: 12 }}>
      <MantineProgress value={pct} size="xl" animated color="blue" />
      <div id="statusText" style={{ marginTop: 8, fontWeight: 600 }}>{status} {pct ? `- ${pct.toFixed(0)}%` : ''}</div>
    </div>
  )
}
