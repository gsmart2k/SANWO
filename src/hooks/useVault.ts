import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '../context/WalletContext'
import { executeChallenge } from '../lib/circleSDK'

export interface Vault {
  id: string
  userId: string
  userWalletId: string
  userAddress: string
  vaultWalletId: string
  vaultAddress: string
  amount: string
  lockDate: string
  unlockDate: string
  status: 'active' | 'unlocked' | 'withdrawn' | 'broken_early' | 'pending'
  penaltyPaid: boolean
  withdrawnAt?: string
  amountReturned?: string
}

export function useVault() {
  const { walletId, userToken, connectedAddress } = useWallet()
  const [vaults, setVaults] = useState<Vault[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchVaults = useCallback(async () => {
    if (!walletId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/vault/${encodeURIComponent(walletId)}`)
      if (!res.ok) throw new Error('Failed to load vaults')
      const data = (await res.json()) as { vaults: Vault[] }
      setVaults(data.vaults ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vaults')
    } finally {
      setLoading(false)
    }
  }, [walletId])

  useEffect(() => {
    fetchVaults()
  }, [fetchVaults])

  const createVault = useCallback(
    async (amount: string, unlockDate: Date): Promise<Vault> => {
      if (!walletId || !userToken || !connectedAddress) throw new Error('Not authenticated')

      const res = await fetch('/api/vault/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Token': userToken },
        body: JSON.stringify({
          userId: walletId,
          userWalletId: walletId,
          userAddress: connectedAddress,
          amount,
          unlockDate: unlockDate.toISOString(),
        }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Failed to create vault')
      }

      const data = (await res.json()) as { vault: Vault; challengeId: string }

      // User signs the transfer with their PIN
      await executeChallenge(data.challengeId)

      // Mark vault active now that PIN was completed
      await fetch(`/api/vault/activate/${data.vault.id}`, { method: 'POST' })

      const activeVault: Vault = { ...data.vault, status: 'active' }
      setVaults((prev) => [activeVault, ...prev])
      return activeVault
    },
    [walletId, userToken, connectedAddress]
  )

  const withdraw = useCallback(
    async (vaultId: string): Promise<{ amountReturned: string; penaltyDeducted: string; isEarly: boolean }> => {
      const res = await fetch(`/api/vault/withdraw/${vaultId}`, { method: 'POST' })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Withdrawal failed')
      }

      const data = (await res.json()) as { amountReturned: string; penaltyDeducted: string; isEarly: boolean }

      setVaults((prev) =>
        prev.map((v) =>
          v.id === vaultId ? { ...v, status: data.isEarly ? 'broken_early' : 'withdrawn' } : v
        )
      )

      return data
    },
    []
  )

  return { vaults, loading, error, createVault, withdraw, refetch: fetchVaults }
}
