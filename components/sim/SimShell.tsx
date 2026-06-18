'use client'

import { useState } from 'react'
import Header from '@/components/sim/Header'
import MobileNotice from '@/components/sim/MobileNotice'
import SimCanvas from '@/components/sim/SimCanvas'
import StatsPanel from '@/components/sim/StatsPanel'
import ControlBar from '@/components/sim/ControlBar'
import OrgInspector from '@/components/sim/OrgInspector'
import LabParameters from '@/components/sim/LabParameters'
import { useSimulation } from '@/hooks/useSimulation'
import { DEFAULT_CONFIG } from '@/sim/types'
import type { SimConfig } from '@/sim/types'
import { cloneConfig, normalizeConfig, deriveHeaderStatus } from '@/components/sim/simShell.helpers'

export default function SimShell() {
  const [appliedConfig, setAppliedConfig] = useState<SimConfig>(() => cloneConfig(DEFAULT_CONFIG))
  const [draftConfig, setDraftConfig] = useState<SimConfig>(() => cloneConfig(DEFAULT_CONFIG))
  const { worker, supported, view, simState, speed, activeSeed, start, pause, reset, restart, setSpeed, clearSelection } =
    useSimulation(appliedConfig)

  // The worker owns hit-testing, so hovered/selected organisms and the cursor's
  // world position arrive via `view`. We only track the raw pointer screen
  // position here to place the hover tooltip at the cursor.
  const [pointerScreen, setPointerScreen] = useState<{ x: number; y: number } | null>(null)

  function handlePrimary() {
    if (simState === 'running') pause()
    else start()
  }

  function handleReset() {
    const nextConfig = normalizeConfig(draftConfig)
    setDraftConfig(nextConfig)
    setAppliedConfig(nextConfig)
    setPointerScreen(null)
    reset(nextConfig)
  }

  function handleApplyRestart() {
    const nextConfig = normalizeConfig(draftConfig)
    setDraftConfig(nextConfig)
    setAppliedConfig(nextConfig)
    setPointerScreen(null)
    restart(nextConfig)
  }

  function handleRestoreDefaults() {
    setDraftConfig(cloneConfig(DEFAULT_CONFIG))
  }

  const stats = view?.stats ?? null
  const selectedOrg = view?.selected ?? null
  const hoveredOrg = view?.hovered ?? null
  const gen = stats?.generation ?? 0
  const elapsed = stats?.elapsed ?? 0
  const pop = stats?.organisms ?? 0
  const seedLabel = activeSeed !== null ? String(activeSeed) : '-'

  const headerStatus = deriveHeaderStatus(simState, stats?.organisms)

  return (
    <>
      <MobileNotice />

      <Header generation={gen} elapsed={elapsed} status={headerStatus} seedLabel={seedLabel} />

      <SimCanvas
        key={`${appliedConfig.worldWidth}x${appliedConfig.worldHeight}`}
        worker={worker}
        zoom={view?.zoom ?? 0}
        stats={stats}
        cursorPos={view?.cursorWorld ?? null}
        hasLife={view?.hasLife ?? false}
        worldWidth={appliedConfig.worldWidth}
        worldHeight={appliedConfig.worldHeight}
        onPointerScreen={setPointerScreen}
        supported={supported}
      />

      <StatsPanel
        stats={stats ?? null}
        popHistory={stats?.popHistory ?? new Array(32).fill(0)}
        predatorPopHistory={stats?.predatorPopHistory ?? new Array(32).fill(0)}
        config={appliedConfig}
        organismInspector={
          selectedOrg ? (
            <OrgInspector
              org={selectedOrg}
              mode="panel"
              onClear={clearSelection}
            />
          ) : null
        }
        labParameters={
          <LabParameters
            draftConfig={draftConfig}
            appliedConfig={appliedConfig}
            onChange={setDraftConfig}
            onApplyRestart={handleApplyRestart}
            onRestoreDefaults={handleRestoreDefaults}
          />
        }
        activeSeed={activeSeed}
      />

      <ControlBar
        simState={simState}
        speed={speed}
        gen={gen}
        elapsed={elapsed}
        pop={pop}
        telemetryState={stats?.telemetryState ?? 'STABILITY'}
        ecosystemState={stats?.ecosystemState ?? 'stable equilibrium'}
        onPrimary={handlePrimary}
        onReset={handleReset}
        onSpeedChange={setSpeed}
      />

      <OrgInspector
        org={selectedOrg ? null : hoveredOrg}
        mode="tooltip"
        position={pointerScreen}
      />
    </>
  )
}
