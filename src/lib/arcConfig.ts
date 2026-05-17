import { defineChain } from 'viem'
import { createPublicClient, http } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
})

// The ERC-20 interface for USDC on Arc (6 decimals)
export const USDC_CONTRACT = '0x3600000000000000000000000000000000000000' as const

// App Kit uses this string to identify the chain
export const ARC_CHAIN_NAME = 'Arc_Testnet' as const

export const EXPLORER_BASE = 'https://testnet.arcscan.app'

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http('https://rpc.testnet.arc.network'),
})

export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatUSDC(amount: string | number, decimals = 2): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '0.00'
  return num.toFixed(decimals)
}
