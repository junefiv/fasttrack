import { Loader, Modal, Stack, Text } from '@mantine/core'
import { PASS_NAV_DATA_LOADING_MESSAGE } from '../lib/passNavLoadingCopy'

type Props = {
  opened: boolean
}

export function PassNavDataLoadingModal({ opened }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      overlayProps={{ backgroundOpacity: 0.5, blur: 3 }}
    >
      <Stack align="center" gap="md" py="sm">
        <Loader color="teal" />
        <Text ta="center" size="sm" c="dimmed">
          {PASS_NAV_DATA_LOADING_MESSAGE}
        </Text>
      </Stack>
    </Modal>
  )
}
