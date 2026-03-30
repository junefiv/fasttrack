/**
 * `web/src/assets/mock-exam-catalog/{slug}.jpg` 또는 `{slug}.jpeg`
 * slug 값은 DB `fasttrack_mock_exam_catalog.slug` 와 동일해야 합니다.
 * 파일을 추가하면 Vite가 glob으로 묶어 빌드에 포함합니다.
 */
const catalogImages = import.meta.glob<string>('../assets/mock-exam-catalog/*.{jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const bySlug = new Map<string, string>()
for (const path of Object.keys(catalogImages)) {
  const file = path.split('/').pop() ?? ''
  const slug = file.replace(/\.(jpe?g)$/i, '')
  if (slug) bySlug.set(slug, catalogImages[path] as string)
}

export function resolveMockExamCatalogImage(slug: string): string | undefined {
  return bySlug.get(slug)
}
