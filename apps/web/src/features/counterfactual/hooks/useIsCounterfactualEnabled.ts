import { useHasFeature } from '@/hooks/useChains'
import useChainId from '@/hooks/useChainId'
import { FEATURES } from '@safe-global/utils/utils/chains'
import { isTronChain } from '@/utils/tron'

export function useIsCounterfactualEnabled(): boolean | undefined {
  const chainId = useChainId()
  const hasFeature = useHasFeature(FEATURES.COUNTERFACTUAL)

  // Tron CREATE2 formula differs from Ethereum — Protocol Kit address prediction
  // will mismatch. Disable counterfactual Safe creation for Tron chains.
  if (isTronChain(chainId)) return false

  return hasFeature
}
