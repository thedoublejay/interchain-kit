import { Wallet } from "@interchain-kit/core";
import { ICON } from "./constant";

export const Coin98ExtensionInfo: Wallet = {
  windowKey: 'coin98.keplr',
  ethereumKey: 'coin98.provider',
  name: 'coin98-extension',
  prettyName: 'Coin98',
  logo: ICON,
  mode: 'extension',
  keystoreChange: 'keplr_keystorechange',
  downloads: [
    {
      device: 'desktop',
      browser: 'chrome',
      link:
        'https://chrome.google.com/webstore/detail/aeachknmefphepccionboohckonoeemg',
    },
    {
      link: 'https://coin98.com/wallet',
    },
  ],
};
