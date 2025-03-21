import { ICosmosGenericOfflineSigner } from '@interchainjs/cosmos/types/wallet';
import { HttpEndpoint } from '@interchainjs/types';
import { Chain, AssetList } from '@chain-registry/v2-types'
import { BaseWallet } from './wallets/base-wallet'
import { ChainName, DeviceType, DownloadInfo, EndpointOptions, Endpoints, OS, SignerOptions, SignType } from './types'
import { SigningOptions as InterchainSigningOptions } from '@interchainjs/cosmos/types/signing-client';
import { SigningClient } from '@interchainjs/cosmos/signing-client'
import Bowser from 'bowser';
import { ChainNameNotExist, ChainNotExist, getValidRpcEndpoint, isInstanceOf, NoValidRpcEndpointFound, WalletNotExist } from './utils';
import { WCWallet } from './wc-wallet';

export class WalletManager {
  chains: Chain[] = []
  assetLists: AssetList[] = []
  wallets: BaseWallet[] = []
  signerOptions: SignerOptions | undefined
  endpointOptions: EndpointOptions | undefined

  preferredSignTypeMap: Record<Chain['chainName'], SignType> = {}
  signerOptionMap: Record<Chain['chainName'], InterchainSigningOptions> = {}
  endpointOptionsMap: Record<Chain['chainName'], Endpoints> = {}

  constructor(
    chains: Chain[],
    assetLists: AssetList[],
    wallets: BaseWallet[],
    signerOptions?: SignerOptions,
    endpointOptions?: EndpointOptions,
  ) {
    this.chains = chains
    this.assetLists = assetLists
    this.wallets = wallets

    this.signerOptions = signerOptions
    this.endpointOptions = endpointOptions

    this.chains.forEach(chain => {
      this.signerOptionMap[chain.chainName] = signerOptions?.signing?.(chain.chainName)
      this.preferredSignTypeMap[chain.chainName] = signerOptions?.preferredSignType?.(chain.chainName)
      this.endpointOptionsMap[chain.chainName] = endpointOptions?.endpoints?.[chain.chainName]
    })

    this.wallets.forEach(wallet => {
      wallet.setChainMap(this.chains)
    })
  }

  async init() {
    await Promise.all(this.wallets.map(async (wallet) => wallet.init()))
  }

  static async create(
    chain: Chain[],
    assetLists: AssetList[],
    wallets: BaseWallet[],
    signerOptions?: SignerOptions,
    endpointOptions?: EndpointOptions
  ) {
    const wm = new WalletManager(chain, assetLists, wallets, signerOptions, endpointOptions)
    await wm.init()

    return wm
  }

  addChains(chains: Chain[], assetLists: AssetList[], signerOptions?: SignerOptions, endpointOptions?: EndpointOptions) {
    const existChains = this.chains
    chains.forEach(newChain => {
      const existChain = existChains.find(c => c.chainId === newChain.chainId)
      if (!existChain) {
        this.chains.push(newChain)
        const assetList = assetLists.find(a => a.chainName === newChain.chainName)
        this.assetLists.push(assetList)
      }

      this.signerOptionMap[newChain.chainName] = signerOptions?.signing?.(newChain.chainName)
      this.endpointOptionsMap[newChain.chainName] = endpointOptions?.endpoints?.[newChain.chainName]
    })
  }

  getChainLogoUrl(chainName: ChainName) {
    const assetList = this.assetLists.find(assetList => assetList.chainName === chainName)
    return assetList?.assets?.[0].logoURIs?.png || assetList?.assets?.[0].logoURIs?.svg || undefined
  }

  getWalletByName(walletName: string): BaseWallet | undefined {
    return this.wallets.find(w => w.info.name === walletName)
  }

  getChainByName(chainName: string): Chain | undefined {
    const chain = this.chains.find(chain => chain.chainName === chainName)
    return chain
  }

  getAssetListByName(chainName: string) {
    return this.assetLists.find(assetList => assetList.chainName === chainName)
  }

  async connect(walletName: string, chainName: string, wcQRcodeUriCallback?: (uri: string) => void) {
    const wallet = this.getWalletByName(walletName)
    const chain = this.getChainByName(chainName)

    if (!wallet) {
      throw new WalletNotExist(walletName)
    }

    if (!chain) {
      throw new ChainNameNotExist(chainName)
    }

    if (isInstanceOf(wallet, WCWallet)) {
      wallet.setOnPairingUriCreatedCallback(wcQRcodeUriCallback)
    }

    try {
      await wallet.connect(chain.chainId)
    } catch (error) {
      throw error
    }
  }

  async disconnect(walletName: string, chainName: string) {
    const wallet = this.getWalletByName(walletName)
    const chain = this.getChainByName(chainName)

    if (!wallet) {
      throw new WalletNotExist(walletName)
    }

    if (!chain) {
      throw new ChainNameNotExist(chainName)
    }
    return wallet.disconnect(chain.chainId)
  }

  getAccount(walletName: string, chainName: string) {
    const wallet = this.getWalletByName(walletName)
    const chain = this.getChainByName(chainName)
    if (!wallet) {
      throw new WalletNotExist(walletName)
    }

    if (!chain) {
      throw new ChainNameNotExist(chainName)
    }
    return wallet.getAccount(chain.chainId)
  }

  getRpcEndpoint = async (walletName: string, chainName: string) => {
    const existRpcEndpoint = this.endpointOptionsMap?.[chainName]?.rpc?.[0]
    if (existRpcEndpoint) {
      return existRpcEndpoint
    }

    const chain = this.getChainByName(chainName)

    let rpcEndpoint: string | HttpEndpoint = ''
    const providerRpcEndpoints = this.endpointOptions?.endpoints[chain.chainName]?.rpc || []
    // const walletRpcEndpoints = wallet?.info?.endpoints?.[chain.chainName]?.rpc || []
    const chainRpcEndpoints = chain.apis.rpc.map(url => url.address)

    if (providerRpcEndpoints?.[0]) {
      rpcEndpoint = providerRpcEndpoints[0]
      this.endpointOptionsMap?.[chainName]?.rpc.push(rpcEndpoint)
      return rpcEndpoint
    }

    const validRpcEndpoint = await getValidRpcEndpoint([...providerRpcEndpoints, ...chainRpcEndpoints])

    if (validRpcEndpoint === '') {
      throw new NoValidRpcEndpointFound()
    }

    rpcEndpoint = validRpcEndpoint
    this.endpointOptionsMap?.[chainName]?.rpc.push(rpcEndpoint)
    return rpcEndpoint
  }

  getPreferSignType(chainName: string) {
    return this.preferredSignTypeMap[chainName] || 'direct'
  }

  getSignerOptions(chainName: string): InterchainSigningOptions {
    const chain = this.getChainByName(chainName)
    const signingOptions = this.signerOptionMap[chainName]

    const options: InterchainSigningOptions = {
      broadcast: {
        checkTx: true,
        deliverTx: false,
      },
      ...signingOptions,
      signerOptions: {
        prefix: chain.bech32Prefix,
        ...signingOptions?.signerOptions,
      }
    }
    return options
  }

  async getOfflineSigner(walletName: string, chainName: string) {
    const preferredSignType = this.getPreferSignType(chainName)

    const wallet = this.getWalletByName(walletName)
    const chain = this.getChainByName(chainName)
    if (!wallet) {
      throw new WalletNotExist(walletName)
    }
    if (!chain) {
      throw new ChainNotExist(chainName)
    }

    return wallet.getOfflineSigner(chain.chainId, preferredSignType)
  }

  async getSigningClient(walletName: string, chainName: ChainName): Promise<SigningClient> {
    const rpcEndpoint = await this.getRpcEndpoint(walletName, chainName)
    const offlineSigner = await this.getOfflineSigner(walletName, chainName) as ICosmosGenericOfflineSigner
    const signerOptions = await this.getSignerOptions(chainName)
    return SigningClient.connectWithSigner(rpcEndpoint, offlineSigner, signerOptions)
  }

  getEnv() {
    const parser = Bowser.getParser(window.navigator.userAgent)
    const env = {
      browser: parser.getBrowserName(true),
      device: (parser.getPlatform().type || 'desktop') as DeviceType,
      os: parser.getOSName(true) as OS,
    }
    return env
  }

  getDownloadLink(walletName: string) {
    const env = this.getEnv()
    const wallet = this.getWalletByName(walletName)
    return wallet.info.downloads.find((d: DownloadInfo) => {
      if (d.device === 'desktop') {
        return d.browser === env.browser
      } else if (d.device === 'mobile') {
        return d.os === env.os
      } else {
        return null
      }
    })
  }

}