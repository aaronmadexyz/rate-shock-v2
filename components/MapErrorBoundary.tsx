'use client'

import React from 'react'

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
            background:     '#F5F4F1',
            gap:            8,
          }}
        >
          <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, color: 'var(--n-500)', margin: 0 }}>
            The map failed to load.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily:   "'Inter', system-ui, sans-serif",
              fontSize:     13,
              fontWeight:   500,
              padding:      '8px 20px',
              borderRadius: 9999,
              border:       '1px solid #D4D3CE',
              background:   '#FFFFFF',
              cursor:       'pointer',
              color:        '#2C2B27',
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
