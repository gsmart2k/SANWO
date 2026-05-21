import type { Transaction } from '../context/WalletContext'

export interface VaultInfo {
  name?: string
  amount: string
  unlockDate: string
  status: string
  penaltyPaid: boolean
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

function formatVaults(vaults: VaultInfo[]): string {
  const active = vaults.filter((v) => !['withdrawn', 'broken_early'].includes(v.status))
  if (active.length === 0) return 'No active vaults.'
  return active
    .map((v, i) => {
      const label = v.name ? `"${v.name}"` : `Vault ${i + 1}`
      const daysLeft = Math.max(0, Math.ceil((new Date(v.unlockDate).getTime() - Date.now()) / 86_400_000))
      const unlockStr = new Date(v.unlockDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      return `${i + 1}. ${label} — ${v.amount} USDC locked, ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining (unlocks ${unlockStr}), status: ${v.status}`
    })
    .join('\n')
}

function formatTxHistory(transactions: Transaction[], addressBook: Record<string, string>): string {
  if (transactions.length === 0) return 'No transactions yet.'
  return transactions
    .slice(0, 20)
    .map((tx, i) => {
      const dir = tx.direction === 'sent' ? 'SENT' : 'RECEIVED'
      const counterparty = tx.direction === 'sent' ? tx.to : tx.from
      const label = addressBook[counterparty.toLowerCase()]
      const counterpartyStr = label ? `${label} (${counterparty})` : counterparty
      const date = new Date(tx.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      return `${i + 1}. ${dir} ${tx.amount} USDC ${tx.direction === 'sent' ? 'to' : 'from'} ${counterpartyStr} — ${date} (${tx.status})`
    })
    .join('\n')
}

export async function* streamClaude(
  userMessage: string,
  walletAddress: string,
  usdcBalance: string,
  transactions: Transaction[] = [],
  addressBook: Record<string, string> = {},
  vaults: VaultInfo[] = []
): AsyncGenerator<string> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) {
    yield 'Error: VITE_OPENAI_API_KEY is not configured.'
    return
  }

  const txHistory = formatTxHistory(transactions, addressBook)
  const vaultSummary = formatVaults(vaults)

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      stream: true,
      messages: [
        {
          role: 'system',
          content: `You are the AI assistant inside SANWO, a USDC payment app on the Arc blockchain.

User wallet address: ${walletAddress}
Current USDC balance: ${usdcBalance} USDC

Active vaults:
${vaultSummary}

Transaction history (most recent first):
${txHistory}

You help users understand their wallet, explain transactions, and answer questions about Arc and USDC. Be concise and accurate. Use the transaction history and vault data above to answer questions. Never invent data beyond what is listed. If the user wants to send money, give the exact command syntax: send [amount] usdc to [address]`,
        },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    yield `Error ${response.status}: ${error}`
    return
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          const parsed = JSON.parse(data)
          const text = parsed.choices?.[0]?.delta?.content
          if (text) yield text
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
