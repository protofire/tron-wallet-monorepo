/**
 * Tron chain ids, kept free of tronweb imports so weight-sensitive modules
 * (e.g. utils/wallets.ts in the main bundle) can check the chain cheaply.
 */
const TRON_CHAIN_IDS = ['2494104990', '728126428', '3448148188'] as const

export const isTronChain = (chainId: string): boolean =>
  TRON_CHAIN_IDS.includes(chainId as (typeof TRON_CHAIN_IDS)[number])
