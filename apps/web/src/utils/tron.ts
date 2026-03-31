const TRON_CHAIN_IDS = ['2494104990', '728126428', '3448148188'] as const

export const isTronChain = (chainId: string): boolean =>
  TRON_CHAIN_IDS.includes(chainId as (typeof TRON_CHAIN_IDS)[number])

/**
 * Synchronous 0x → base58 conversion using TronLink's window.tronWeb.
 * Falls back to 0x if TronLink is not available.
 */
export const toTronBase58Sync = (hexAddr: string): string => {
  try {
    const tronWeb = window.tronWeb
    if (!tronWeb?.address?.fromHex) return hexAddr
    // TronWeb expects hex with 41 prefix
    const raw = '41' + hexAddr.replace(/^0x/, '')
    return tronWeb.address.fromHex(raw)
  } catch {
    return hexAddr
  }
}

/**
 * Synchronous base58 → 0x conversion using TronLink's window.tronWeb.
 * Falls back to the original value if TronLink is not available.
 */
export const fromTronBase58Sync = (base58Addr: string): string => {
  try {
    const tronWeb = window.tronWeb
    if (!tronWeb?.address?.toHex) return base58Addr
    const hex = tronWeb.address.toHex(base58Addr)
    // TronWeb returns hex with 41 prefix, convert to 0x
    return '0x' + hex.slice(2)
  } catch {
    return base58Addr
  }
}

/**
 * Check if a string looks like a Tron base58 address (starts with T, 34 chars).
 */
export const isTronBase58Address = (value: string): boolean => {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)
}

/**
 * Format a Tron base58 address for short display: TXyz...89ab
 */
export const formatTronShortAddress = (base58Addr: string, chars = 4): string => {
  if (!base58Addr || base58Addr.length < chars * 2 + 1) return base58Addr
  return `${base58Addr.slice(0, chars + 1)}...${base58Addr.slice(-chars)}`
}

/**
 * Convert a 0x hex address to Tron base58 format for display.
 * Uses TronWeb if available, otherwise returns the hex address as-is.
 */
export const toTronBase58 = async (hexAddr: string): Promise<string> => {
  try {
    const { TronWeb } = await import('tronweb')
    // TronWeb expects address without 0x prefix, with 41 prefix
    const raw = '41' + hexAddr.replace(/^0x/, '')
    // @ts-expect-error — TronWeb.utils is available at runtime but missing from type declarations
    return TronWeb.utils.address.fromHex(raw)
  } catch {
    return hexAddr
  }
}

/**
 * Convert a Tron base58 address to 0x hex format for internal operations.
 */
export const fromTronBase58 = async (base58Addr: string): Promise<string> => {
  try {
    const { TronWeb } = await import('tronweb')
    // @ts-expect-error — TronWeb.utils is available at runtime but missing from type declarations
    const hex = TronWeb.utils.address.toHex(base58Addr)
    // TronWeb returns hex with 41 prefix, convert to 0x
    return '0x' + hex.slice(2)
  } catch {
    return base58Addr
  }
}
