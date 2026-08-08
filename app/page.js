'use client';

import { useMemo, useState } from 'react';

const months=['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function Home(){
 const [month,setMonth]=useState(6),[years,setYears]=useState(6),[universe,setUniverse]=useState('test10'),[minAvg,setMinAvg]=useState(0),[minPositive,setMinPositive]=useState(0),[scanned,setScanned]=useState(false),[loading,setLoading]=useState(false),[progress,setProgress]=useState(''),[data,setData]=useState(null),[error,setError]=useState('');
 const results=useMemo(()=>data?.results ?? [],[data]);
 async function scan(){
   setLoading(true); setError(''); setScanned(true); setData(null); setProgress('');
   try{
     const base={month:String(month+1),years:String(years),universe,minAvg:String(minAvg),minPositive:String(minPositive)};
     if(universe==='nifty500'){
       const allResults=[]; const allErrors=[]; let totalScanned=0; let totalUniverse=500;
       const batchSize=50;
       for(let offset=0; offset<500; offset+=batchSize){
         setProgress(`Scanning Nifty 500: ${Math.min(offset+batchSize,500)} / 500`);
         const params=new URLSearchParams({...base,offset:String(offset),limit:String(batchSize)});
         const response=await fetch(`/api/scan?${params.toString()}`,{cache:'no-store'});
         const body=await response.json();
         if(!response.ok || !body.ok) throw new Error(body.error || `Nifty 500 batch ${offset/batchSize+1} failed`);
         allResults.push(...(body.results||[])); allErrors.push(...(body.errors||[])); totalScanned+=body.scanned||0; totalUniverse=body.totalUniverse||totalUniverse;
       }
       allResults.sort((a,b)=>b.average-a.average);
       setData({ok:true,source:'Upstox historical candles',universe,month:Number(base.month),years,completedMonthOnly:true,scanned:totalScanned,totalUniverse,matched:allResults.length,results:allResults,errors:allErrors});
     } else {
       setProgress('Scanning initial test universe…');
       const response=await fetch(`/api/scan?${new URLSearchParams(base)}`,{cache:'no-store'});
       const body=await response.json();
       if(!response.ok || !body.ok) throw new Error(body.error || 'Scanner request failed');
       setData(body);
     }
   }catch(e){setData(null);setError(e.message);}
   finally{setLoading(false);setProgress('');}
 }
 return <main style={{maxWidth:1150,margin:'0 auto',padding:'30px 18px',fontFamily:'Arial, sans-serif'}}>
  <div style={{fontSize:12,fontWeight:800,letterSpacing:1.2}}>MARKET RESEARCH TOOL · V0.5</div>
  <h1 style={{fontSize:34,margin:'8px 0'}}>Seasonal Stock Scanner</h1>
  <p style={{color:'#667085',maxWidth:780}}>Screen NSE stocks for monthly seasonality using real Upstox historical monthly candles. The Nifty 500 universe is loaded from NSE and scanned in controlled batches.</p>
  <section style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:14,padding:20,marginTop:24}}>
   <h2 style={{marginTop:0}}>Screening criteria</h2>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14}}>
    <label>Month<select value={month} onChange={e=>setMonth(Number(e.target.value))} style={input}>{months.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></label>
    <label>Lookback<select value={years} onChange={e=>{const y=Number(e.target.value);setYears(y);if(minPositive>y)setMinPositive(0)}} style={input}>{[3,5,6,10].map(y=><option key={y} value={y}>{y} years</option>)}</select></label>
    <label>Universe<select value={universe} onChange={e=>setUniverse(e.target.value)} style={input}><option value="test10">Initial 10-stock test universe</option><option value="nifty500">NSE Nifty 500</option></select></label>
    <label>Minimum avg return (%)<input type="number" value={minAvg} onChange={e=>setMinAvg(e.target.value)} style={input}/></label>
    <label>Minimum positive years<select value={minPositive} onChange={e=>setMinPositive(Number(e.target.value))} style={input}><option value="0">Any</option>{[3,4,5,6].filter(y=>y<=years).map(y=><option key={y} value={y}>{y}/{years}</option>)}</select></label>
   </div>
   <button onClick={scan} disabled={loading} style={{marginTop:18,padding:'12px 24px',border:0,borderRadius:9,fontWeight:800,cursor:loading?'wait':'pointer'}}>{loading?'Scanning Upstox…':'Scan Stocks'}</button>
   {progress && <div style={{marginTop:12,color:'#667085',fontSize:13}}>{progress}</div>}
  </section>
  <section style={{marginTop:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>{scanned?'Results':'Run your first scan'}</h2><span style={{color:'#667085',fontSize:13}}>{data?`${data.matched} matched / ${data.scanned} scanned`:'Real-data scan'}</span></div>
   {error && <div style={{padding:14,borderRadius:10,border:'1px solid #fecdca',marginBottom:14}}>Scanner error: {error}</div>}
   {results.length>0 && <div style={{overflowX:'auto',background:'#fff',border:'1px solid #e4e7ec',borderRadius:14}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:850}}><thead><tr>{['Rank','Stock','Avg return','Positive years','Median','Best','Worst'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{results.map((s,i)=><tr key={s.symbol}>{[i+1,s.symbol,`${s.average>=0?'+':''}${s.average.toFixed(2)}%`,`${s.positiveYears}/${s.yearsAvailable}`,`${s.median>=0?'+':''}${s.median.toFixed(2)}%`,`${s.best>=0?'+':''}${s.best.toFixed(2)}%`,`${s.worst>=0?'+':''}${s.worst.toFixed(2)}%`].map((v,j)=><td key={j} style={td}>{v}</td>)}</tr>)}</tbody></table></div>}
   {results.map(s=><details key={`detail-${s.symbol}`} style={{marginTop:12,border:'1px solid #e4e7ec',borderRadius:12,padding:'10px 14px',background:'#fff'}}><summary style={{fontWeight:800,cursor:'pointer'}}>{s.symbol} — yearly breakdown</summary><div style={{overflowX:'auto',marginTop:10}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}><thead><tr>{['Year','Previous month close','Month close','Return'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{s.yearlyReturns.map(r=><tr key={r.year}><td style={td}>{r.year}</td><td style={td}>{r.previousMonthClose.toFixed(2)}</td><td style={td}>{r.monthClose.toFixed(2)}</td><td style={td}>{`${r.returnPct>=0?'+':''}${r.returnPct.toFixed(2)}%`}</td></tr>)}</tbody></table></div></details>)}
   {data && results.length===0 && !error && <div style={{padding:18,border:'1px solid #e4e7ec',borderRadius:12}}>No stocks matched the selected filters.</div>}
   {data?.errors?.length>0 && <details style={{marginTop:14}}><summary>{data.errors.length} stock(s) could not be scanned</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(data.errors,null,2)}</pre></details>}
   <p style={{fontSize:12,color:'#667085',marginTop:12}}>Method: previous month-end close → selected month-end close. The current incomplete month is excluded when it is the selected month. Nifty 500 scans run in 50-stock batches with bounded Upstox concurrency.</p>
  </section>
 </main>
}
const input={display:'block',width:'100%',boxSizing:'border-box',marginTop:6,padding:11,border:'1px solid #d0d5dd',borderRadius:8,background:'#fff'};
const th={textAlign:'left',padding:13,borderBottom:'1px solid #e4e7ec',fontSize:13,color:'#667085'};
const td={padding:13,borderBottom:'1px solid #f0f2f5',fontSize:14};
