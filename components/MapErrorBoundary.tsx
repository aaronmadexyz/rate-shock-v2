'use client'

import React from 'react'
import { TOKENS } from '@/lib/tokens'

interface Props  { children: React.ReactNode }
interface State  { hasError: boolean }

export class MapErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position:       'fixed',
            inset:          0,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            background:     TOKENS.colors.n50,
            gap:            8,
          }}
        >
          <p style={{ fontFamily: TOKENS.font, fontSize: 14, color: 'var(--n-500)', margin: 0 }}>
            The map failed to load.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily:   TOKENS.font,
              fontSize:     13,
              fontWeight:   500,
              padding:      '8px 20px',
              borderRadius: 9999,
              border:       '1px solid #D4D3CE',
              background:   TOKENS.colors.n0,
              cursor:       'pointer',
              color:        TOKENS.colors.n800,
            }}
          >
            Refresh
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
