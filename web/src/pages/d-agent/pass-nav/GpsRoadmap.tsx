import { Box, Text } from '@mantine/core'

type Props = {
  dDay: number
  expectedProgress: number
  userProgress: number | null
  deviated: boolean
}

export function GpsRoadmap({ dDay, expectedProgress, userProgress, deviated }: Props) {
  const milestones = [
    { label: 'D-180', x: 0 },
    { label: 'D-90', x: 50 },
    { label: 'D-30', x: 80 },
    { label: 'D-0', x: 100 },
  ]
  const daySpan = 180
  const pos = Math.min(100, Math.max(0, ((daySpan - Math.min(daySpan, Math.max(0, dDay))) / daySpan) * 100))
  const userY = userProgress != null ? Math.min(92, Math.max(8, 100 - userProgress * 0.85)) : 50
  const greyY = Math.min(92, Math.max(8, 100 - expectedProgress * 0.85))

  return (
    <Box>
      <Text size="sm" c="dimmed" mb={6}>
        합격 GPS 로드맵 · D-Day {dDay}일 · 기대 진행 {expectedProgress.toFixed(0)}%
        {deviated ? ' · 경로 재탐색 필요' : ''}
      </Text>
      <svg width="100%" height={120} viewBox="0 0 400 120" preserveAspectRatio="none" aria-label="입시 GPS 타임라인">
        <line x1="20" y1={greyY} x2="380" y2="20" stroke="var(--mantine-color-gray-5)" strokeWidth="2" strokeDasharray="6 4" />
        {milestones.map((m) => (
          <g key={m.label}>
            <line x1={20 + (m.x / 100) * 360} y1="100" x2={20 + (m.x / 100) * 360} y2="108" stroke="var(--mantine-color-dark-2)" strokeWidth="1" />
            <text x={20 + (m.x / 100) * 360} y="118" fontSize="9" fill="var(--mantine-color-dimmed)" textAnchor="middle">
              {m.label}
            </text>
          </g>
        ))}
        <circle
          cx={20 + (pos / 100) * 360}
          cy={userY}
          r={deviated ? 9 : 7}
          fill={deviated ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-blue-6)'}
          className={deviated ? 'pass-nav-gps-pulse' : undefined}
        />
        <text x={20 + (pos / 100) * 360} y={userY - 14} fontSize="10" fill="var(--mantine-color-blue-2)" textAnchor="middle">
          나
        </text>
      </svg>
      {deviated ? (
        <Text size="xs" c="red" mt={4} fw={600}>
          경로 재탐색: 기대 진행률 대비 뒤처져 있습니다.
        </Text>
      ) : null}
    </Box>
  )
}
