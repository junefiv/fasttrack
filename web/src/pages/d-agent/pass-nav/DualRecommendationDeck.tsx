import { Card, SimpleGrid, Text, Anchor } from '@mantine/core'
import type { DualCards } from '../../../lib/passNavRecommendations'

export function DualRecommendationDeck({ cards }: { cards: DualCards }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <Card withBorder padding="lg" radius="md" shadow="sm">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          기능적 추천 (Content Gap)
        </Text>
        <Text mt="sm" size="sm">
          {cards.functional}
        </Text>
        <Anchor href={cards.functionalHref} size="sm" mt="md" display="block">
          바로 가기
        </Anchor>
      </Card>
      <Card withBorder padding="lg" radius="md" shadow="sm">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          처방적 추천 (Behavioral FOMO)
        </Text>
        <Text mt="sm" size="sm">
          {cards.prescriptive}
        </Text>
        <Anchor href={cards.prescriptiveHref} size="sm" mt="md" display="block">
          학습 시작
        </Anchor>
      </Card>
    </SimpleGrid>
  )
}
