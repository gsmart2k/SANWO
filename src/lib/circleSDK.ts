// Lazy-loaded so a module-level SDK error never crashes the initial page render
let sdk: import('@circle-fin/w3s-pw-web-sdk').W3SSdk | null = null

export async function initCircleSDK(userToken: string, encryptionKey: string): Promise<void> {
  const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
  sdk = new W3SSdk({
    appSettings: { appId: import.meta.env.VITE_CIRCLE_APP_ID },
  })
  sdk.setAuthentication({ userToken, encryptionKey })
}

export function executeChallenge(challengeId: string): Promise<void> {
  if (!sdk) throw new Error('Circle SDK not initialised — call initCircleSDK first')
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sdk!.execute(challengeId, (error: any) => {
      if (error) reject(new Error(error.message ?? String(error)))
      else resolve()
    })
  })
}
