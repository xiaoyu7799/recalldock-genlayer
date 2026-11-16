// Read-only independent verification. Never broadcasts a transaction.
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const client=createClient({chain:studionet}),deployment=JSON.parse(readFileSync('deployment.json'));
const live=JSON.parse(readFileSync('evidence/live.json')),browser=JSON.parse(readFileSync('evidence/browser.json'));
const evidence={checked_at:new Date().toISOString(),chain_id:Number(await client.request({method:'eth_chainId',params:[]})),transactions:[],readbacks:[]};
assert.equal(evidence.chain_id,61999);
const code=readFileSync('contracts/recalldock.py','utf8');const remote=Buffer.from(await client.request({method:'gen_getContractCode',params:[deployment.address]}),'base64').toString('utf8');
assert.equal(remote,code);evidence.source_sha256=createHash('sha256').update(remote).digest('hex');assert.equal(evidence.source_sha256,deployment.source_sha256);evidence.source_bytes_match=true;
for(const item of [...live.transactions,...browser.transactions]){
 const tx=await client.getTransaction({hash:item.hash});assert.equal(tx.statusName,'FINALIZED');
 const raw=tx.consensus_data?.leader_receipt;const arr=Array.isArray(raw)?raw:[raw];const leader=arr.find(x=>x?.mode==='leader')||arr.find(Boolean);
 const expected=['unauthorized-proposal','replay-confirmation'].includes(item.label)?'ERROR':'SUCCESS';assert.equal(leader.execution_result,expected);
 const votes=tx.consensus_data?.votes; evidence.transactions.push({label:item.label,hash:item.hash,status:tx.statusName,execution_result:leader.execution_result,leader_only:tx.leader_only,votes});
}
for(const id of [live.owner.toLowerCase()+':acceptance-lot',browser.case_id]){
 const raw=await client.readContract({address:deployment.address,functionName:'get_case',args:[id],transactionHashVariant:'latest-final'});const c=JSON.parse(raw);assert.equal(c.state,'RECONCILED');assert.equal(c.remaining,0);assert.equal(c.resolved,c.quantity);assert.equal(c.source.recall_number,'F-1170-2024');evidence.readbacks.push(c);
}
writeFileSync('evidence/independent-verification.json',JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');console.log(`Read-only verification: ${evidence.transactions.length} finalized transactions; source bytes match; 2 reconciled records.`);
