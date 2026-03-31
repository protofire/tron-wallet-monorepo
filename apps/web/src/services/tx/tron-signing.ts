import type { Eip1193Provider } from 'ethers'
import { encodeFunctionData } from 'viem'

/**
 * Check if an error from the backend is a signature verification failure.
 * These errors indicate the off-chain sig was correctly formed but the backend
 * can't verify it (Tron prefix mismatch).
 */
export const isSignatureVerificationError = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error)
  return /signature.*invalid|could not recover|signer.*mismatch|not.*owner/i.test(msg)
}

/**
 * Encode an approveHash() call for the Safe contract.
 * approveHash(bytes32 hashToApprove) — selector 0xd4d9bdcd
 */
export const encodeApproveHash = (safeTxHash: string): string => {
  return encodeFunctionData({
    abi: [
      {
        name: 'approveHash',
        type: 'function',
        inputs: [{ name: 'hashToApprove', type: 'bytes32' }],
        outputs: [],
      },
    ],
    functionName: 'approveHash',
    args: [safeTxHash as `0x${string}`],
  })
}

/**
 * On-chain approve hash via direct contract call.
 * Sends approveHash(txHash) to the Safe contract via the connected TronLink wallet.
 */
export const approveHashOnChain = async (
  safeAddress: string,
  safeTxHash: string,
  signerAddress: string,
  provider: Eip1193Provider,
): Promise<string> => {
  const data = encodeApproveHash(safeTxHash)

  const txHash: string = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from: signerAddress, to: safeAddress, data }],
  })

  return txHash
}
