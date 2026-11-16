import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discover,ensureNetwork,listen} from '../src/wallets.js';
import {isFinal,execution,failureReason,submit} from '../src/chain.js';

test('EIP-6963 keeps different wallet providers distinct and deduplicates legacy reference',()=>{
 const host=new EventTarget(),p1={request:async()=>[]},p2={request:async()=>[]};host.ethereum={providers:[p1,p2]};let found=[];
 const stop=discover(xs=>found=xs,host);
 for(const [uuid,name,provider] of [['okx','OKX',p1],['rabby','Rabby',p2]]){const e=new Event('eip6963:announceProvider');e.detail={info:{uuid,name},provider};host.dispatchEvent(e)}
 assert.equal(found.length,2);assert.notEqual(found[0].provider,found[1].provider);stop();
});
test('EIP-6963 announcements select the actual announced providers',()=>{
 const host=new EventTarget();let found=[];const stop=discover(x=>found=x,host);
 const provider={request:async()=>[]};const event=new Event('eip6963:announceProvider');event.detail={info:{uuid:'wallet-a',name:'Wallet A'},provider};host.dispatchEvent(event);
 assert.equal(found[0].provider,provider);assert.equal(found[0].name,'Wallet A');stop();
});
test('unknown chain is added and confirmed; a refused switch fails',async()=>{
 let network='0x1';const calls=[];const provider={request:async x=>{calls.push(x.method);if(x.method==='eth_chainId')return network;if(x.method==='wallet_switchEthereumChain')throw Object.assign(Error(),{code:4902});if(x.method==='wallet_addEthereumChain')network='0xf22f'}};
 await ensureNetwork(provider);assert.deepEqual(calls,['eth_chainId','wallet_switchEthereumChain','wallet_addEthereumChain','eth_chainId']);
 await assert.rejects(ensureNetwork({request:async x=>{if(x.method==='eth_chainId')return '0x1';throw Error('Rejected')}}),/Rejected/);
});
test('all EIP-1193 lifecycle listeners are registered and removed',()=>{
 const listeners={},removed=[];let invalidated=0;const p={on:(e,fn)=>listeners[e]=fn,removeListener:(e,fn)=>{assert.equal(fn,listeners[e]);removed.push(e)}};
 const stop=listen(p,()=>invalidated++);for(const fn of Object.values(listeners))fn();assert.equal(invalidated,3);stop();assert.equal(removed.length,3);
});
test('ACCEPTED is never final; execution error is distinct from finality',()=>{
 assert.equal(isFinal({status:'ACCEPTED'}),false);assert.equal(isFinal({status:'FINALIZED'}),true);assert.equal(execution({consensus_data:{leader_receipt:[{mode:'leader',execution_result:'ERROR'}]}}),'ERROR');
});
test('account mismatch prevents eth_sendTransaction',async()=>{
 const calls=[];const w={address:'0x'+'a'.repeat(40),provider:{request:async x=>{calls.push(x.method);return x.method==='eth_chainId'?'0xf22f':['0x'+'b'.repeat(40)]}}};
 await assert.rejects(submit(w,'cancel_case',['x'],()=>w),/account changed/);assert(!calls.includes('eth_sendTransaction'));
});

test('finalized failures show the actual contract error',()=>{assert.equal(failureReason({consensus_data:{leader_receipt:[{mode:'leader',genvm_result:{stderr:'Traceback\nException: CUSTODIAN_ONLY\n'}}]}}),'Exception: CUSTODIAN_ONLY')});
