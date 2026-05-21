import { useState } from 'react'
import { useVault } from '../hooks/useVault'
import VaultDashboard from '../components/Vault/VaultDashboard'
import CreateVault from '../components/Vault/CreateVault'

export default function VaultView() {
  const [creating, setCreating] = useState(false)
  const { vaults, loading, error, createVault, withdraw, refetch } = useVault()

  if (creating) {
    return (
      <CreateVault
        onBack={() => setCreating(false)}
        onCreate={async (amount, unlockDate) => {
          await createVault(amount, unlockDate)
          setCreating(false)
          refetch()
        }}
      />
    )
  }

  return (
    <VaultDashboard
      vaults={vaults}
      loading={loading}
      error={error}
      onCreateNew={() => setCreating(true)}
      onWithdraw={withdraw}
    />
  )
}
