export function gradeLabel(score: number): string {
  if (score >= 90) return '1등급'
  if (score >= 80) return '2등급'
  if (score >= 70) return '3등급'
  if (score >= 60) return '4등급'
  if (score >= 50) return '5등급'
  if (score >= 40) return '6등급'
  if (score >= 31) return '7등급'
  if (score >= 23) return '8등급'
  return '9등급'
}
