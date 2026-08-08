'use client';

import { useMemo, useState } from 'react';

const months=['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function Home(){
 const [month,setMonth]=useState(6),[years,setYears]=useState(0),[universe,setUniverse]=useState('nifty500'),[minAvg,setMinAvg]=useState(0),[recentConsecutive,setRecentConsecutive]=useState(4),[scanned,setScanned]=useState(false),[loading,setLoading]=useState(false),[data,setData]=useState(null),[error,setError]=useState('');
 const results=useMemo(()=>data?.results ?? [],[data]);
 async function scan(){
   setLoading(true); setError(''); setScanned(true); setData(null);
   try{
     const baseParams={month:String(month+1),years:String(years),universe,minAvg:String(minAvg),recentConsecutive:String(recentConsecutive)};
     const batchSize=500; const responses=[];
     if(universe==='allnse'){
       let offset=0;
       while(true){
         const params=new URLSearchParams({...baseParams,offset:String(offset),limit:String(batchSize)});
         const response=await fetch(`/api/scan?${params.toString()}`,{cache:'no-store'}); const body=await response.json();
         if(!response.ok || !body.ok) throw new Error(body.error || 'Scanner request failed');
         responses.push(body); offset += body.batchCount ?? batchSize;
         if((body.batchCount ?? 0) < batchSize || offset >= (body.totalUniverse ?? offset)) break;
       }
     } else {
       const params=new URLSearchParams(baseParams); const response=await fetch(`/api/scan?${params.toString()}`,{cache:'no-store'}); const body=await response.json();
       if(!response.ok || !body.ok) throw new Error(body.error || 'Scanner request failed'); responses.push(body);
     }
     const combinedResults=responses.flatMap(body=>body.results ?? []).sort((a,b)=>b.average-a.average);
     const combinedErrors=responses.flatMap(body=>body.errors ?? []); const totalScanned=responses.reduce((sum,body)=>sum+(body.scanned ?? 0),0); const totalUniverse=responses[0]?.totalUniverse ?? totalScanned;
     setData({...responses[0],totalUniverse,scanned:totalScanned,matched:combinedResults.length,results:combinedResults,errors:combinedErrors});
   }catch(e){setData(null);setError(e.message);} finally{setLoading(false);}
 }
 return <main style={{maxWidth:1150,margin:'0 auto',padding:'30px 18px',fontFamily:'Arial, sans-serif'}}>
  <div style={{fontSize:12,fontWeight:800,letterSpacing:1.2}}>MARKET RESEARCH TOOL · V0.8</div>
  <h1 style={{fontSize:34,margin:'8px 0'}}>Seasonal Stock Scanner</h1>
  <p style={{color:'#667085',maxWidth:780}}>Screen NSE stocks for monthly seasonality using stored historical monthly candles. Scans read the local historical dataset, so normal scans do not call Upstox.</p>
  <section style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:14,padding:20,marginTop:24}}>
   <h2 style={{marginTop:0}}>Screening criteria</h2>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14}}>
    <label>Month<select value={month} onChange={e=>setMonth(Number(e.target.value))} style={input}>{months.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></label>
    <label>Lookback<select value={years} onChange={e=>setYears(Number(e.target.value))} style={input}><option value="0">Maximum available</option><option value="3">3 years</option><option value="5">5 years</option><option value="6">6 years</option><option value="10">10 years</option></select></label>
    <label>Universe<select value={universe} onChange={e=>setUniverse(e.target.value)} style={input}><option value="nifty50">Nifty 50</option><option value="niftynext50">Nifty Next 50</option><option value="nifty500">NSE Nifty 500</option><option value="allnse">All NSE Equity</option></select></label>
    <label>Minimum avg return (%)<input type="number" value={minAvg} onChange={e=>setMinAvg(e.target.value)} style={input}/></label>
    <label>Recent consecutive years<select value={recentConsecutive} onChange={e=>setRecentConsecutive(Number(e.target.value))} style={input}>{[2,3,4,5,6,7].map(y=><option key={y} value={y}>{y} years</option>)}</select></label>
   </div>
   <button onClick={scan} disabled={loading} style={{marginTop:18,padding:'12px 24px',border:0,borderRadius:9,fontWeight:800,cursor:loading?'wait':'pointer'}}>{loading?'Calculating…':'Scan Stocks'}</button>
  </section>
  <section style={{marginTop:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>{scanned?'Results':'Run your first scan'}</h2><span style={{color:'#667085',fontSize:13}}>{data?`${data.matched} matched / ${data.scanned} scanned`:'Stored-data scan'}</span></div>
   {data?.dataUpdatedAt && <div style={{fontSize:12,color:'#667085',marginBottom:12}}>Historical data updated: {new Date(data.dataUpdatedAt).toLocaleString()}</div>}
   {error && <div style={{padding:14,borderRadius:10,border:'1px solid #fecdca',marginBottom:14}}>Scanner error: {error}</div>}
   {results.length>0 && <div style={{overflowX:'auto',background:'#fff',border:'1px solid #e4e7ec',borderRadius:14}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:1050}}><thead><tr>{['Rank','Stock','Avg return','Positive years','Above threshold','Recent streak','History','Median','Best','Worst'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{results.map((s,i)=>{const streak=s.recentConsecutiveMet ?? s.qualifyingRecentYears ?? 0; return <tr key={s.symbol}>{[i+1,s.symbol,`${s.average>=0?'+':''}${s.average.toFixed(2)}%`,`${s.positiveYears}/${s.yearsAvailable}`,`${s.qualifyingYears}/${s.yearsAvailable}`,`${streak}/${s.recentYearsChecked ?? recentConsecutive}`,`${s.yearsAvailable} yrs`,`${s.median>=0?'+':''}${s.median.toFixed(2)}%`,`${s.best>=0?'+':''}${s.best.toFixed(2)}%`,`${s.worst>=0?'+':''}${s.worst.toFixed(2)}%`].map((v,j)=><td key={j} style={td}>{v}</td>)}</tr>})}</tbody></table></div>}
   {results.map(s=><details key={`detail-${s.symbol}`} style={{marginTop:12,border:'1px solid #e4e7ec',borderRadius:12,padding:'10px 14px',background:'#fff'}}><summary style={{fontWeight:800,cursor:'pointer'}}>{s.symbol} — yearly breakdown</summary><div style={{overflowX:'auto',marginTop:10}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}><thead><tr>{['Year','Previous month close','Month close','Return'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{s.yearlyReturns.map(r=><tr key={r.year}><td style={td}>{r.year}</td><td style={td}>{r.previousMonthClose.toFixed(2)}</td><td style={td}>{r.monthClose.toFixed(2)}</td><td style={td}>{`${r.returnPct>=0?'+':''}${r.returnPct.toFixed(2)}%`}</td></tr>)}</tbody></table></div></details>)}
   {data && results.length===0 && !error && <div style={{padding:18,border:'1px solid #e4e7ec',borderRadius:12}}>No stocks matched the selected filters.</div>}
   {data?.errors?.length>0 && <details style={{marginTop:14}}><summary>{data.errors.length} stock(s) could not be scanned</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(data.errors,null,2)}</pre></details>}
   <p style={{fontSize:12,color:'#667085',marginTop:12}}>Method: previous month-end close → selected month-end close. Lookback defaults to maximum available history. Positive-year counts and historical breakdown use only the years available for each stock. A stock qualifies when its selected-month average meets the minimum and its most recent available years meet the consecutive-years threshold.</p>
  </section>
 </main>
}
const input={display:'block',width:'100%',boxSizing:'border-box',marginTop:6,padding:11,border:'1px solid #d0d5dd',borderRadius:8,background:'#fff'};
const th={textAlign:'left',padding:13,borderBottom:'1px solid #e4e7ec',fontSize:13,color:'#667085'};
const td={padding:13,borderBottom:'1px solid #f0f2f5',fontSize:14};
