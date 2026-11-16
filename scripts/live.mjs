import {createClient,createAccount,generatePrivateKey} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {TransactionStatus} from 'genlayer-js/types';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const stringify=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
if(existsSync('evidence/live.json'))throw Error('Existing run: inspect evidence before resuming; no automatic resend.');
const owner=createAccount(generatePrivateKey()),custodian=createAccount(generatePrivateKey());
const clients=[owner,custodian].map(account=>createClient({chain:studionet,account}));
const code=readFileSync('contracts/recalldock.py','utf8');
const report={network:'Stable Studionet',chainId:61999,source_sha256:createHash('sha256').update(code).digest('hex'),owner:owner.address,custodian:custodian.address,transactions:[],readbacks:[]};
const save=()=>writeFileSync('evidence/live.json',stringify(report));
async function send(label,promise,expected='SUCCESS'){
 const hash=await promise; const item={label,hash,submitted_at:new Date().toISOString()};report.transactions.push(item);save();console.log(label,hash);
 const receipt=await clients[0].waitForTransactionReceipt({hash,status:TransactionStatus.FINALIZED,retries:240,interval:5000});
 const tx=await clients[0].getTransaction({hash});item.receipt=receipt;item.transaction=tx;save();
 const leaders=tx.consensus_data?.leader_receipt;const arr=Array.isArray(leaders)?leaders:[leaders];
 const lead=arr.find(x=>x?.mode==='leader')||arr.find(Boolean);
 item.final_status=receipt.statusName??tx.statusName??receipt.status;item.execution_result=lead?.execution_result;save();console.log(label,item.final_status,item.execution_result);
 if(!['FINALIZED',7].includes(item.final_status))throw Error('Not finalized');
 if(expected && item.execution_result!==expected)throw Error(`Unexpected execution: ${item.execution_result}`);
 return receipt;
}
const receipt=await send('deploy',clients[0].deployContract({code,args:[],leaderOnly:false}));
const address=receipt.data?.contract_address??receipt.txDataDecoded?.contractAddress??receipt.contractAddress;
if(!address)throw Error('Missing deploy address');report.contract=address;save();
writeFileSync('deployment.json',stringify({network:'Stable Studionet',chainId:61999,rpc:'https://studio.genlayer.com/api',address,deploy_transaction:report.transactions[0].hash,source_sha256:report.source_sha256}));
writeFileSync('src/config.js',`export const RPC='https://studio.genlayer.com/api';\nexport const CHAIN_ID=61999;\nexport const EXPLORER='https://explorer-studio.genlayer.com';\nexport const CONTRACT='${address}';\n`);
const id=owner.address.toLowerCase()+':acceptance-lot';
async function write(label,who,method,args,expected='SUCCESS'){return send(label,clients[who].writeContract({address,functionName:method,args,value:0n,leaderOnly:false}),expected)}
async function read(label){const raw=await clients[0].readContract({address,functionName:'get_case',args:[id],transactionHashVariant:'latest-final'});const record=typeof raw==='string'?JSON.parse(raw):raw;report.readbacks.push({label,record,at:new Date().toISOString()});save();return record}
await write('open',0,'open_case',['acceptance-lot','F-1170-2024','05/24 and 03/24; acceptance inventory declaration',100,custodian.address]);await read('unverified');
await write('verify-fda',0,'verify_recall',[id]);let state=await read('quarantined');if(state.state!=='QUARANTINED')throw Error('Quarantine missing');
await write('unauthorized-proposal',0,'propose_disposition',[id,'RETURN',40,'receipt-unauthorized'],'ERROR');state=await read('unauthorized-unchanged');if(state.proposal!==null)throw Error('Unauthorized mutation');
await write('propose-return',1,'propose_disposition',[id,'RETURN',40,'acceptance-return-receipt-001']);await read('awaiting');
await write('confirm-return',0,'confirm_disposition',[id,1,true]);state=await read('partial');if(state.remaining!==60||state.resolved!==40)throw Error('Partial invariant');
await write('replay-confirmation',0,'confirm_disposition',[id,1,true],'ERROR');state=await read('replay-unchanged');if(state.remaining!==60)throw Error('Replay mutated state');
await write('propose-destroy',1,'propose_disposition',[id,'DESTROY',60,'acceptance-destruction-receipt-002']);
await write('confirm-destroy',0,'confirm_disposition',[id,2,true]);state=await read('reconciled');if(state.state!=='RECONCILED'||state.remaining!==0||state.resolved!==100)throw Error('Final invariant');
report.completed_at=new Date().toISOString();save();console.log('Verified complete',address);
