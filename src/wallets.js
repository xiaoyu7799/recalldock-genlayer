import {createAccount,generatePrivateKey} from 'genlayer-js';
import {rpc} from './chain.js';
import {CHAIN_ID,RPC,EXPLORER} from './config.js';
export function discover(onChange,host=window){
 const wallets=new Map();
 const add=(id,info,provider)=>{if(!provider?.request)return;const existing=[...wallets.values()].find(x=>x.provider===provider);if(existing){if(!id.startsWith('legacy-')){wallets.delete(existing.id);wallets.set(id,{id,...info,provider});onChange([...wallets.values()]);}return;}wallets.set(id,{id,...info,provider});onChange([...wallets.values()]);};
 const announced=e=>{if(e.detail?.info?.uuid&&e.detail?.info?.name)add(e.detail.info.uuid,e.detail.info,e.detail.provider)};
 host.addEventListener('eip6963:announceProvider',announced);
 host.dispatchEvent(new Event('eip6963:requestProvider'));
 const legacy=host.ethereum?.providers|| (host.ethereum?[host.ethereum]:[]);
 for(const [i,p] of legacy.entries())add('legacy-'+i,{name:p.isRabby?'Rabby':p.isOkxWallet?'OKX Wallet':p.isCoinbaseWallet?'Coinbase Wallet':p.isMetaMask?'MetaMask':'Browser wallet',icon:''},p);
 return ()=>host.removeEventListener('eip6963:announceProvider',announced);
}
export async function ensureNetwork(provider){
 if(Number(BigInt(await provider.request({method:'eth_chainId'})))===CHAIN_ID)return;
 try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xf22f'}]})}
 catch(e){if(e.code!==4902)throw e;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0xf22f',chainName:'Stable Studionet',rpcUrls:[RPC],nativeCurrency:{name:'GEN',symbol:'GEN',decimals:18},blockExplorerUrls:[EXPLORER]}]});}
 if(Number(BigInt(await provider.request({method:'eth_chainId'})))!==CHAIN_ID)throw Error('Network did not switch. Add Stable Studionet manually.');
}
export function sessionWallet(){
 const account=createAccount(generatePrivateKey());
 // Explicit testnet session signer. No external wallet is impersonated.
 const provider={async request({method,params}){
  if(method==='eth_chainId')return '0xf22f';
  if(['eth_accounts','eth_requestAccounts'].includes(method))return [account.address];
  if(method==='eth_sendTransaction'){
   const tx=params[0];if(tx.from.toLowerCase()!==account.address.toLowerCase())throw Error('Signer mismatch');
   if(BigInt(tx.value||0)!==0n)throw Error('Session signer only supports zero-value transactions');
   const chain=await rpc('eth_chainId');if(BigInt(chain)!==61999n)throw Error('Wrong RPC chain');
   const nonce=await rpc('eth_getTransactionCount',[account.address,'latest']);
   const signed=await account.signTransaction({chainId:61999,type:'legacy',to:tx.to,data:tx.data,gas:20000000n,gasPrice:0n,value:0n,nonce:Number(BigInt(nonce))});
   return rpc('eth_sendRawTransaction',[signed]);
  }
  throw Error(`Session signer does not support ${method}`);
 }};
 return {id:crypto.randomUUID(),name:'Testnet session account',address:account.address,icon:'',provider};
}
export function listen(provider,onInvalidated){
 const accounts=()=>onInvalidated('Wallet account changed. Reconnect to confirm the selected account.');
 const chain=()=>onInvalidated('Wallet network changed. Reconnect to verify Stable Studionet.');
 const disconnect=()=>onInvalidated('Wallet disconnected.');
 provider.on?.('accountsChanged',accounts);provider.on?.('chainChanged',chain);provider.on?.('disconnect',disconnect);
 return ()=>{provider.removeListener?.('accountsChanged',accounts);provider.removeListener?.('chainChanged',chain);provider.removeListener?.('disconnect',disconnect)};
}
