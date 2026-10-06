const key=process.env.ALPACA_TRADING;
const secret=process.env.ALPACA_TRADING_SECRET;
if(!key||!secret){
  console.error("credential_diagnosis_missing_credentials");
  process.exit(1);
}
const headers={
  "APCA-API-KEY-ID":key,
  "APCA-API-SECRET-KEY":secret,
  accept:"application/json",
};
async function status(url){
  try{
    const r=await fetch(url,{method:"GET",headers});
    return r.status;
  }catch{
    return 0;
  }
}
const [paper,live,data]=await Promise.all([
  status("https://paper-api.alpaca.markets/v2/account"),
  status("https://api.alpaca.markets/v2/account"),
  status("https://data.alpaca.markets/v2/stocks/SOXX/quotes/latest?feed=iex"),
]);
console.log(JSON.stringify({
  schema:"evercraft.daytrade.alpaca-credential-diagnosis.v1",
  paper_account_http_status:paper,
  live_account_http_status:live,
  market_data_http_status:data,
  no_orders_submitted:true,
  read_only:true,
  live_trade_authority:false
}));
