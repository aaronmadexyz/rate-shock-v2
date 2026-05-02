import type { Metadata } from 'next'
import { Inter, IBM_Plex_Mono } from 'next/font/google'
import Nav from '@/components/Nav'
import '@/styles/globals.css'

// Variable font — axes: ['opsz'] loads the optical-size axis (range 14–32).
// Weight axis is included automatically; no need to enumerate individual weights.
const inter = Inter({
  subsets: ['latin'],
  axes:    ['opsz'],
  display: 'swap',
  variable: '--font-sans',
})

// IBM Plex Mono is not a variable font — load only the weights we use.
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight:  ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'RateMap',
  description: 'See what Canadians are really paying.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${ibmPlexMono.variable}`}>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  )
}
