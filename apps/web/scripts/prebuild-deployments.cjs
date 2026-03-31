/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path')
const fs = require('fs')

/**
 * Patches @safe-global/safe-deployments and @safe-global/protocol-kit
 * to include Tron network addresses and chain configuration.
 *
 * Reads tron-deployments.json from the CGW repo (shared config) and patches:
 * 1. safe-deployments asset JSON files with Tron networkAddresses
 * 2. protocol-kit EIP-3770 config with Tron chain short names
 *
 * Run before build: node scripts/prebuild-deployments.cjs
 */

const TRON_CHAINS = {
  2494104990: { shortName: 'trx-shasta' },
  728126428: { shortName: 'trx' },
  3448148188: { shortName: 'trx-nile' },
}

// Try to load tron-deployments from local copy
function loadDeploymentsConfig() {
  const paths = [path.resolve(__dirname, '../tron-deployments.json')]

  for (const p of paths) {
    if (fs.existsSync(p)) {
      console.log(`Loading deployments config from: ${p}`)
      return JSON.parse(fs.readFileSync(p, 'utf8'))
    }
  }

  console.warn('No tron-deployments.json found, skipping safe-deployments patch.')
  return null
}

function findNodeModulesPath(pkg, subpath) {
  const candidates = [
    path.join(process.cwd(), 'node_modules', pkg, subpath),
    path.join(process.cwd(), '..', '..', 'node_modules', pkg, subpath),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function findAllSafeDeploymentsAssetDirs() {
  // Find ALL copies of safe-deployments in node_modules (including nested ones)
  const { execSync } = require('child_process')
  const rootDir = path.join(process.cwd(), '..', '..')
  try {
    const result = execSync(`find ${rootDir}/node_modules -path "*/safe-deployments/dist/assets" -type d 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 10000,
    })
    return result.trim().split('\n').filter(Boolean)
  } catch (e) {
    // Fallback to known locations
    return [findNodeModulesPath('@safe-global/safe-deployments', path.join('dist', 'assets'))].filter(Boolean)
  }
}

function patchSafeDeployments(config) {
  const assetsDirs = findAllSafeDeploymentsAssetDirs()

  if (assetsDirs.length === 0) {
    console.warn('safe-deployments assets directory not found, skipping.')
    return 0
  }

  console.log(`  Found ${assetsDirs.length} safe-deployments location(s):`)
  assetsDirs.forEach((d) => console.log(`    - ${d}`))

  let patchCount = 0

  for (const assetsBaseDir of assetsDirs) {
    for (const [chainId, versions] of Object.entries(config)) {
      for (const [version, contracts] of Object.entries(versions)) {
        const versionDir = path.join(assetsBaseDir, `v${version}`)

        if (!fs.existsSync(versionDir)) {
          continue
        }

        for (const [contractKey, address] of Object.entries(contracts)) {
          const assetFile = path.join(versionDir, `${contractKey}.json`)

          if (!fs.existsSync(assetFile)) {
            continue
          }

          const asset = JSON.parse(fs.readFileSync(assetFile, 'utf8'))

          if (!asset.networkAddresses) {
            asset.networkAddresses = {}
          }

          // Add to deployments with a chain-specific key
          const deploymentKey = `tron_${chainId}`
          if (asset.deployments) {
            asset.deployments[deploymentKey] = {
              address,
              codeHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
              deploymentType: 'custom',
            }
          }

          // networkAddresses maps chainId to a deployment key (not raw address).
          // safe-deployments' mapJsonToDeploymentsFormatV1 resolves deployments[key].address
          asset.networkAddresses[chainId] = deploymentKey

          fs.writeFileSync(assetFile, JSON.stringify(asset, null, 2))
          patchCount++
          console.log(`  Patched ${contractKey}.json: chain ${chainId} -> ${address}`)
        }
      }
    }
  } // end for assetsDirs

  return patchCount
}

function patchProtocolKitEip3770() {
  const subpaths = [
    path.join('dist', 'src', 'utils', 'eip-3770', 'config.js'),
    path.join('dist', 'esm', 'src', 'utils', 'eip-3770', 'config.js'),
  ]
  const configPaths = subpaths.map((sub) => findNodeModulesPath('@safe-global/protocol-kit', sub)).filter(Boolean)

  let patchCount = 0

  for (const configPath of configPaths) {
    if (!fs.existsSync(configPath)) continue

    let content = fs.readFileSync(configPath, 'utf8')

    for (const [chainId, { shortName }] of Object.entries(TRON_CHAINS)) {
      const entry = `{ chainId: ${chainId}n, shortName: '${shortName}' }`

      if (content.includes(chainId)) {
        continue
      }

      // Find the array closing bracket and add entry before it
      const insertPoint = content.lastIndexOf(']')
      if (insertPoint === -1) continue

      // Ensure the last element before ] has a trailing comma
      const before = content.slice(0, insertPoint)
      const lastNonWhitespace = before.trimEnd()
      const needsComma = lastNonWhitespace.endsWith('}') && !lastNonWhitespace.endsWith(',')
      const prefix = needsComma ? before.trimEnd() + ',\n' : before

      content = prefix + `  ${entry},\n` + content.slice(insertPoint)
      patchCount++
      console.log(`  Patched EIP-3770 config: ${chainId} -> ${shortName}`)
    }

    if (patchCount > 0) {
      fs.writeFileSync(configPath, content)
    }
  }

  return patchCount
}

/**
 * Patch Protocol Kit's getSafeContractVersion to normalize "1.5.0" -> "1.4.1"
 * for Tron chains. The Tron Safe contracts were forked from v1.5.0 but are
 * functionally v1.4.1. Protocol Kit's switch only handles known versions.
 */
function patchProtocolKitVersionDetection() {
  const subpaths = [
    path.join('dist', 'src', 'contracts', 'utils.js'),
    path.join('dist', 'esm', 'src', 'contracts', 'utils.js'),
  ]
  const tronChainIds = Object.keys(TRON_CHAINS)
  let patchCount = 0

  for (const sub of subpaths) {
    const filePath = findNodeModulesPath('@safe-global/protocol-kit', sub)
    if (!filePath || !fs.existsSync(filePath)) continue

    let content = fs.readFileSync(filePath, 'utf8')

    // Already patched?
    if (content.includes('TRON_VERSION_OVERRIDE')) continue

    // Patch getSafeContractVersion to return "1.4.1" instead of "1.5.0" for Tron chains
    const searchStr = 'async function getSafeContractVersion(safeProvider, safeAddress) {'
    if (!content.includes(searchStr)) continue

    const replacement = `async function getSafeContractVersion(safeProvider, safeAddress) {
    // TRON_VERSION_OVERRIDE: Tron Safe contracts report "1.5.0" but are functionally "1.4.1"
    const TRON_CHAIN_IDS = new Set([${tronChainIds.map((id) => `'${id}'`).join(', ')}]);
    const _chainId = (await safeProvider.getChainId()).toString();
    const _origVersion = await safeProvider.readContract({
        address: safeAddress,
        abi: (0, viem_1.parseAbi)(['function VERSION() view returns (string)']),
        functionName: 'VERSION'
    });
    if (TRON_CHAIN_IDS.has(_chainId) && _origVersion === '1.5.0') {
        return '1.4.1';
    }
    return _origVersion;
}`

    content = content.replace(
      searchStr +
        "\n    return (await safeProvider.readContract({\n        address: safeAddress,\n        abi: (0, viem_1.parseAbi)(['function VERSION() view returns (string)']),\n        functionName: 'VERSION'\n    }));\n}",
      replacement,
    )

    fs.writeFileSync(filePath, content)
    patchCount++
    console.log(`  Patched getSafeContractVersion in ${sub}`)
  }

  return patchCount
}

/**
 * Patch Protocol Kit's adjustVInSignature to accept Tron v values (v > 30).
 *
 * Protocol Kit validates that v ∈ {0, 1, 27, 28} and throws "Invalid signature"
 * for any other value. On Tron, TronLink signs with a TRON message prefix and
 * viem-transport applies vValueOffset=31, producing v=58 or 59.
 * safe-eth-py expects v > 30 for Tron to use the correct ecrecover path.
 *
 * This patch modifies the ETHEREUM_V_VALUES check to pass through v > 30 unchanged,
 * so Tron-prefixed signatures flow through to the backend without Protocol Kit rejecting them.
 */
function patchProtocolKitAdjustV() {
  let patchCount = 0
  const filePath = path.resolve(
    __dirname,
    '../../../node_modules/@safe-global/protocol-kit/dist/src/utils/signatures/utils.js',
  )

  if (!fs.existsSync(filePath)) {
    console.log('  Skipped: protocol-kit signatures utils.js not found')
    return patchCount
  }

  let content = fs.readFileSync(filePath, 'utf8')

  // Replace the strict v-value check to allow v > 30 (Tron signatures)
  const oldCheck = `if (!ETHEREUM_V_VALUES.includes(signatureV)) {
        throw new Error('Invalid signature');
    }`
  const newCheck = `if (!ETHEREUM_V_VALUES.includes(signatureV) && signatureV <= 30) {
        throw new Error('Invalid signature');
    }
    // Tron: v > 30 means the signature uses TRON message prefix — pass through unchanged
    if (signatureV > 30) {
        return signature;
    }`

  if (content.includes(oldCheck)) {
    content = content.replace(oldCheck, newCheck)
    fs.writeFileSync(filePath, content)
    patchCount++
    console.log('  Patched adjustVInSignature for Tron v > 30 passthrough')
  } else if (content.includes('signatureV <= 30')) {
    console.log('  Already patched: adjustVInSignature')
  } else {
    console.log('  Warning: adjustVInSignature pattern not found — may need manual patch')
  }

  return patchCount
}

/**
 * Patch Protocol Kit's BaseContract._resolveAddress to handle deployment keys.
 *
 * When networkAddresses[chainId] is a deployment key (e.g., "tron_2494104990")
 * instead of a raw address, the default _resolveAddress returns the key as-is,
 * which fails validation. This patch makes it look up the address from
 * deployment.deployments[key].address when the value isn't a valid hex address.
 */
function patchProtocolKitResolveAddress() {
  const subpaths = [
    path.join('dist', 'src', 'contracts', 'BaseContract.js'),
    path.join('dist', 'esm', 'src', 'contracts', 'BaseContract.js'),
  ]
  let patchCount = 0

  for (const sub of subpaths) {
    const filePath = findNodeModulesPath('@safe-global/protocol-kit', sub)
    if (!filePath || !fs.existsSync(filePath)) continue

    let content = fs.readFileSync(filePath, 'utf8')

    if (content.includes('TRON_RESOLVE_ADDRESS')) continue

    // The original resolveAddress returns networkAddresses as-is if it's a string.
    // We need to intercept: if it's a string but not a valid 0x address, treat it as a
    // deployment key and resolve deployment.deployments[key].address
    const oldPattern = `if (typeof networkAddresses === 'string') {
        return networkAddresses;
    }`
    const newPattern = `if (typeof networkAddresses === 'string') {
        // TRON_RESOLVE_ADDRESS: If the value is a deployment key (not a 0x address),
        // resolve it from deployment.deployments[key].address
        if (!networkAddresses.startsWith('0x') && deployment && deployment.deployments && deployment.deployments[networkAddresses]) {
            return deployment.deployments[networkAddresses].address;
        }
        return networkAddresses;
    }`

    if (content.includes(oldPattern)) {
      content = content.replace(oldPattern, newPattern)
      fs.writeFileSync(filePath, content)
      patchCount++
      console.log(`  Patched BaseContract._resolveAddress for deployment key resolution`)
    } else if (content.includes('TRON_RESOLVE_ADDRESS')) {
      console.log('  Already patched: BaseContract._resolveAddress')
    } else {
      console.log('  Warning: BaseContract._resolveAddress pattern not found')
    }
  }

  return patchCount
}

function main() {
  console.log('\n=== Tron Prebuild: Patching Dependencies ===\n')

  const config = loadDeploymentsConfig()

  let total = 0

  if (config) {
    console.log('Patching safe-deployments...')
    total += patchSafeDeployments(config)
  }

  console.log('\nPatching protocol-kit EIP-3770 config...')
  total += patchProtocolKitEip3770()

  console.log('\nPatching protocol-kit version detection for Tron...')
  total += patchProtocolKitVersionDetection()

  console.log('\nPatching protocol-kit signature validation for Tron...')
  total += patchProtocolKitAdjustV()

  console.log('\nPatching protocol-kit BaseContract address resolution for Tron...')
  total += patchProtocolKitResolveAddress()

  console.log(`\nPrebuild complete: ${total} patch(es) applied.\n`)
}

main()
