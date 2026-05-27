import { useEffect } from 'react'
import type { SafeTransaction } from '@safe-global/types-kit'
import useAsync from '@safe-global/utils/hooks/useAsync'
import useChainId from '@/hooks/useChainId'
import { useWeb3ReadOnly } from '@/hooks/wallets/web3ReadOnly'
import chains from '@/config/chains'
import { useSigner } from './wallets/useWallet'
import { useSafeSDK } from './coreSDK/safeCoreSDK'
import useIsSafeOwner from './useIsSafeOwner'
import { Errors, logError } from '@/services/exceptions'
import useSafeInfo from './useSafeInfo'
import {
  getEncodedSafeTx,
  GasMultipliers,
  incrementByGasMultiplier,
  getGasLimitForZkSync as getGasLimitForZkSyncUtil,
} from '@safe-global/utils/hooks/coreSDK/gasLimitUtils'
import { isTronChain } from '@/utils/tron'

/**
 * Display-only gas limit (energy units) for Tron Safe execTransaction-class
 * calls. Tron /jsonrpc does not support reliable eth_estimateGas, so we use
 * a constant tuned to typical Safe owner-management ops (addOwnerWithThreshold,
 * swapOwner, changeThreshold) which consume ~20-25k energy. Combined with
 * the 420 sun/energy display price in useGasPrice this renders ~10.5 TRX,
 * matching the TronLink signing popup within a small upper-bound margin
 * (BUG-07 / GSD-12881 — previous 50_000 yielded an over-estimate of 21 TRX).
 * Real energy consumption is computed and burned at execution time by
 * viem-transport via triggerConstantContract; this constant is purely a
 * pre-sign UI hint.
 */
const TRON_DEFAULT_GAS_LIMIT = 25_000n

const useGasLimit = (
  safeTx?: SafeTransaction,
): {
  gasLimit?: bigint
  gasLimitError?: Error
  gasLimitLoading: boolean
} => {
  const safeSDK = useSafeSDK()
  const web3ReadOnly = useWeb3ReadOnly()
  const { safe } = useSafeInfo()
  const safeAddress = safe.address.value
  const threshold = safe.threshold
  const wallet = useSigner()
  const walletAddress = wallet?.address
  const isOwner = useIsSafeOwner()
  const currentChainId = useChainId()
  const hasSafeTxGas = !!safeTx?.data?.safeTxGas

  const [gasLimit, gasLimitError, gasLimitLoading] = useAsync<bigint | undefined>(async () => {
    if (!safeAddress || !walletAddress || !safeSDK || !web3ReadOnly || !safeTx) return

    // Tron /jsonrpc does not support reliable eth_estimateGas.
    // Return a display-only default; viem-transport handles actual energy limits.
    if (isTronChain(currentChainId)) {
      return TRON_DEFAULT_GAS_LIMIT
    }

    const encodedSafeTx = getEncodedSafeTx(
      safeSDK,
      safeTx,
      isOwner ? walletAddress : undefined,
      safeTx.signatures.size < threshold,
    )

    // if we are dealing with zksync and the walletAddress is a Safe, we have to do some magic
    // FIXME a new check to indicate ZKsync chain will be added to the config service and available under Chain
    if (
      (safe.chainId === chains.zksync || safe.chainId === chains.lens) &&
      (await web3ReadOnly.getCode(walletAddress)) !== '0x'
    ) {
      return getGasLimitForZkSyncUtil(web3ReadOnly, safeSDK, safeTx, safe.chainId, safe.address.value)
    }

    return web3ReadOnly
      .estimateGas({
        to: safeAddress,
        from: walletAddress,
        data: encodedSafeTx,
      })
      .then((gasLimit) => {
        // Due to a bug in Nethermind estimation, we need to increment the gasLimit by 30%
        // when the safeTxGas is defined and not 0. Currently Nethermind is used only for Gnosis Chain.
        if (currentChainId === chains.gno && hasSafeTxGas) {
          return incrementByGasMultiplier(gasLimit, GasMultipliers[chains.gno])
        }

        return gasLimit
      })
  }, [
    safeAddress,
    walletAddress,
    safeSDK,
    web3ReadOnly,
    safeTx,
    isOwner,
    currentChainId,
    hasSafeTxGas,
    threshold,
    safe,
  ])

  useEffect(() => {
    if (gasLimitError) {
      logError(Errors._612, gasLimitError.message)
    }
  }, [gasLimitError])

  return { gasLimit, gasLimitError, gasLimitLoading }
}

export default useGasLimit
