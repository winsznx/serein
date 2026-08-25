import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { sepolia } from "wagmi/chains";

import { RPC_PROXY_PATH } from "@/lib/chain";

/**
 * A connector-free mirror of the wagmi config, for server use only.
 *
 * `cookieToInitialState` runs in the root layout — a server component — but the real config is built
 * with RainbowKit's `connectorsForWallets`, which is client-only and throws if evaluated on the
 * server. Since restoring state from a cookie is pure deserialisation and never touches a connector,
 * a config carrying the same chains, storage and transports parses the same payload.
 *
 * The two must stay in step on `chains` and `storage`; they are adjacent for that reason. Nothing
 * else here is load-bearing, and nothing here is ever used to connect a wallet.
 */
export const ssrConfig = createConfig({
  chains: [sepolia],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [sepolia.id]: http(RPC_PROXY_PATH),
  },
});
