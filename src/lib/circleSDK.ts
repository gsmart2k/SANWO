import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'

let sdk: W3SSdk | null = null

export function initCircleSDK(userToken: string, encryptionKey: string): void {
  // Create (or re-create) the SDK with the App ID in the constructor
  sdk = new W3SSdk({
    appSettings: {
      appId: import.meta.env.VITE_CIRCLE_APP_ID,
    },
  })
  sdk.setAuthentication({ userToken, encryptionKey })
}

export function executeChallenge(challengeId: string): Promise<void> {
  if (!sdk) throw new Error('Circle SDK not initialised — call initCircleSDK first')
  return new Promise((resolve, reject) => {
    sdk!.execute(challengeId, (error: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (error) reject(new Error(error.message ?? String(error)))
      else resolve()
    })
  })
}
