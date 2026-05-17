import type { Transaction } from '../context/WalletContext'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

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
  addressBook: Record<string, string> = {}
): AsyncGenerator<string> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) {
    yield 'Error: VITE_OPENAI_API_KEY is not configured.'
    return
  }

  const txHistory = formatTxHistory(transactions, addressBook)

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

Transaction history (most recent first):
${txHistory}

You help users understand their wallet, explain transactions, and answer questions about Arc and USDC. Be concise and accurate. Use the transaction history above to answer questions about past activity. Never invent transaction data beyond what is listed. If the user seems to want to send money, respond with the exact command syntax they should use: send [amount] usdc to [address]`,
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
