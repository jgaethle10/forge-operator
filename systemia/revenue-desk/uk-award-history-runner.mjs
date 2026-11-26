#!/usr/bin/env node
import path from 'node:path';
import {runUkAwardHistory} from './uk-award-history.mjs';

async function main(){
 const args=process.argv.slice(2);
 if(args.length!==0&&(args.length!==2||args[0]!=='--directory'))throw Error('invalid_history_arguments');
 const configured=process.env.SYSTEMIA_KAIDANCE_AWARD_HISTORY_DIR;
 if(args.length&&configured&&args[1]!==configured)throw Error('history_directory_conflict');
 const directory=args[1]||configured;
 if(!directory||!path.isAbsolute(directory))throw Error('private_history_directory_required');
 const result=await runUkAwardHistory({directory,days:30});
 console.log(JSON.stringify({schema:'evercraft.kaidance.award-history-run.v1',ok:result.state!=='hold_partial',...result,contact_authorized:false,execution_authorized:false,send_performed:false}));
 if(result.state==='hold_partial')process.exitCode=1;
}
main().catch(error=>{
 console.error(JSON.stringify({schema:'evercraft.kaidance.award-history-run.v1',ok:false,reason:error?.code==='EEXIST'?'existing_history_lock_requires_reconciliation':'history_run_failed',send_performed:false}));
 process.exitCode=1;
});
