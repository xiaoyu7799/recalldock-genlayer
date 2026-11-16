import {abi} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {encodeFunctionData} from 'viem';
import {RPC,CHAIN_ID,CONTRACT} from './config.js';
export const encoded=(method,args=[])=>abi.transactions.serialize([abi.calldata.encode(abi.calldata.makeCalldataObject(method,args,{})),false]);
export async function rpc(method,params=[]){
 const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw Error(`RPC HTTP ${r.status}`);
 const body=await r.json();if(body.error)throw Error(body.error.message);return body.result;
}
export async function read(method,args=[]){
 if(!CONTRACT)throw Error('Contract deployment is not configured');
 const r=await rpc('gen_call',[{type:'read',to:CONTRACT,from:'0x0000000000000000000000000000000000000000',data:encoded(method,args),transaction_hash_variant:'latest-final'}]);
 if(r?.status?.code)throw Error(r.status.message);
 const hex=typeof r==='string'?r:r?.data;if(typeof hex!=='string')throw Error('Invalid contract response');
 return JSON.parse(abi.calldata.decode(Uint8Array.from(hex.replace(/^0x/,'').match(/../g)||[],x=>parseInt(x,16))));
}
export function envelope(sender,method,args){
 const entry=studionet.consensusMainContract.abi.find(x=>x.type==='function'&&x.name==='addTransaction');
 const params=[sender,CONTRACT,5,3,encoded(method,args)];
 if(entry.inputs.length===6)params.push(BigInt(Math.floor(Date.now()/1000)+3600));
 return {to:studionet.consensusMainContract.address,data:encodeFunctionData({abi:[entry],functionName:'addTransaction',args:params})};
}
export function leaderReceipt(tx){
 const items=tx?.consensus_data?.leader_receipt;
 const arr=Array.isArray(items)?items:[items];return arr.find(x=>x?.mode==='leader')||arr.find(Boolean);
}
export const execution=tx=>leaderReceipt(tx)?.execution_result;
export function failureReason(tx){const leader=leaderReceipt(tx);const stderr=leader?.genvm_result?.stderr;const lines=typeof stderr==='string'?stderr.trim().split('\n'):[];return lines.at(-1)||leader?.result?.payload||'No detailed reason returned; inspect the explorer receipt.';}
export const isFinal=tx=>tx?.status==='FINALIZED'||tx?.status===7;
export async function waitFinal(hash,onProgress,timeout=900000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){
  const tx=await rpc('eth_getTransactionByHash',[hash]);onProgress(tx?.status||'PENDING');
  if(isFinal(tx)){
   if(execution(tx)!=='SUCCESS')throw Error(`Finalized with ${execution(tx)||'unknown execution result'}: ${failureReason(tx)}`);
   return tx;
  }
  if(['CANCELED','UNDETERMINED',8,6].includes(tx?.status))throw Error(`Transaction ${tx.status}; inspect before retrying.`);
  await new Promise(r=>setTimeout(r,5000));
 }
 throw Error('Still pending. Use Resume tracking; do not send the transaction again.');
}
export async function submit(wallet,method,args,current){
 if(!wallet)throw Error('Choose a wallet first');
 const checked=()=>{if(current()!==wallet)throw Error('Selected account changed; review and retry');};
 const chain=await wallet.provider.request({method:'eth_chainId'});
 const accounts=await wallet.provider.request({method:'eth_accounts'});
 if(Number(BigInt(chain))!==CHAIN_ID)throw Error('Switch to Stable Studionet (61999)');
 if(accounts[0]?.toLowerCase()!==wallet.address.toLowerCase())throw Error('Wallet account changed');
 checked();const tx=envelope(wallet.address,method,args);
 return wallet.provider.request({method:'eth_sendTransaction',params:[{from:wallet.address,...tx,value:'0x0',gas:'0x1312d00',gasPrice:'0x0'}]});
}
