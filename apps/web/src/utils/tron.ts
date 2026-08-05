import { utils as tronWebUtils } from 'tronweb'

export { isTronChain } from './tron-chains'

/**
 * Synchronous 0x → base58 conversion using the bundled TronWeb util.
 * Independent of window.tronWeb / TronLink injection timing, so first paint
 * after a page refresh shows the correct base58 (T...) format.
 * Falls back to the input on conversion failure.
 */
export const toTronBase58Sync = (hexAddr: string): string => {
  try {
    // TronWeb expects hex with 41 prefix
    const raw = '41' + hexAddr.replace(/^0x/, '')
    return tronWebUtils.address.fromHex(raw)
  } catch {
    return hexAddr
  }
}

/**
 * Synchronous base58 → 0x conversion using the bundled TronWeb util.
 * Independent of window.tronWeb. Falls back to the input on failure.
 */
export const fromTronBase58Sync = (base58Addr: string): string => {
  try {
    const hex = tronWebUtils.address.toHex(base58Addr)
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
