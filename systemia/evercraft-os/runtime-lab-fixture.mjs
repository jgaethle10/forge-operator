/** Fixed isolated subprocess fixture. NOT a general executable adapter. */
if(process.send) {
  process.send({schema:'evercraft.os.lab-fixture-ipc.v1',kind:'ready',challenge:process.env.EVERCRAFT_LAB_CHALLENGE});
  process.on('message',m=>{if(m?.kind==='terminate_fixture')process.exit(0);});
}
setInterval(()=>{},1000);
