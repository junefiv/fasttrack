import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const theme = createTheme({
  fontFamily: 'IBM Plex Sans KR, system-ui, sans-serif',
  headings: { fontFamily: 'IBM Plex Sans KR, system-ui, sans-serif' },
  primaryColor: 'teal',
  defaultRadius: 'md',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>,
)
