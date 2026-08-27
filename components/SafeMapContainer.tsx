'use client'

/**
 * Drop-in replacement for react-leaflet's <MapContainer>.
 *
 * react-leaflet v4's MapContainer creates the Leaflet map inside a
 * `useCallback(..., [])` ref that closes over `context === null` forever. When
 * React re-attaches the same DOM node without the cleanup effect having removed
 * the map — StrictMode's dev-only mount/unmount/remount double-invoke, or an
 * Offscreen tree reappearing — the stale closure runs again and Leaflet throws
 * "Map container is already initialized."
 *
 * Fix: track the map in a ref so the guard is never stale. The container is
 * initialised exactly once per mounted node; genuine unmounts still remove the
 * map via the [context] effect (which by then has a non-null context).
 *
 * Upstream fix landed in react-leaflet v5, which requires React 19 — revisit
 * this file when the app moves off React 18.
 */

import { LeafletProvider, createLeafletContext, type LeafletContextInterface } from '@react-leaflet/core'
import { Map as LeafletMap } from 'leaflet'
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { MapContainerProps } from 'react-leaflet'

function SafeMapContainerComponent(
  {
    bounds,
    boundsOptions,
    center,
    children,
    className,
    id,
    placeholder,
    style,
    whenReady,
    zoom,
    ...options
  }: MapContainerProps,
  forwardedRef: React.ForwardedRef<LeafletMap>,
) {
  const [divProps] = useState({ className, id, style })
  const [context, setContext] = useState<LeafletContextInterface | null>(null)
  const contextRef = useRef<LeafletContextInterface | null>(null)

  useImperativeHandle<LeafletMap | null, LeafletMap | null>(forwardedRef, () => context?.map ?? null, [context])

  const mapRef = useCallback((node: HTMLDivElement | null) => {
    // Already initialised (or detaching) → never construct a second map on it.
    if (node === null || contextRef.current !== null) return

    const map = new LeafletMap(node, options)
    if (center != null && zoom != null) {
      map.setView(center, zoom)
    } else if (bounds != null) {
      map.fitBounds(bounds, boundsOptions)
    }
    if (whenReady != null) {
      map.whenReady(whenReady)
    }

    const ctx = createLeafletContext(map)
    contextRef.current = ctx
    setContext(ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (context != null) {
        context.map.remove()
        contextRef.current = null
      }
    }
  }, [context])

  const contents = context
    ? React.createElement(LeafletProvider, { value: context }, children)
    : placeholder ?? null

  return React.createElement('div', { ...divProps, ref: mapRef }, contents)
}

export const SafeMapContainer = forwardRef(SafeMapContainerComponent)
