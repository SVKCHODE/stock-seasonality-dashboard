'use client';

import { useMemo, useState } from 'react';

const months=['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function Home(){
 const [month,setMonth]=useState(7),[years,setYears]=useState(5),[universe,setUniverse]=useState('Initial 10-stock test universe'),[minAvg,setMinAvg]=useState(0),[minPositive,setMinPositive]=useState(0),[scanned,setScanned]=useState(false),[loading,setLoading]=useState(false),[data,setData]=useState(null),[error,setError]=useState('');
 const results=useMemo(()=>data?.results ?? [],[data]);
 async function scan(){
   setLoading(true); setError(''); setScanned(true);
   try{
     const params=new URLSearchParams({month:String(month+1),years:String(years),minAvg:String(minAvg),minPositive:String(minPositive)});
     const response=await fetch(`/api/scan?${params.toString()}`,{cache:'no-store'});
     const body=await response.json();
     if(!response.ok || !body.ok) throw new Error(body.error || 'Scanner request failed');
     setData(body);
   }catch(e){setData(null);setError(e.message);}
   finally{setLoading(false);}
 }
 return <main style={{maxWidth:1150,margin:'0 auto',padding:'30px 18px',fontFamily:'Arial, sans-serif'}}>
  <div style={{fontSize:12,fontWeight:800,letterSpacing:1.2}}>MARKET RESEARCH TOOL · V0.3</div>
  <h1 style={{fontSize:34,margin:'8px 0'}}>Seasonal Stock Scanner</h1>
  <p style={{color:'#667085',maxWidth:760}}>Find stocks that historically perform well in a selected calendar month. The scanner uses real Upstox historical candles for the current test universe. Select the month and historical period, scan, then take the shortlist to Moneycontrol for deeper analysis.</p>
  <section style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:14,padding:20,marginTop:24}}>
   <h2 style={{marginTop:0}}>Screening criteria</h2>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14}}>
    <label>Month<select value={month} onChange={e=>setMonth(Number(e.target.value))} style={input}>{months.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></label>
    <label>Lookback<select value={years} onChange={e=>setYears(Number(e.target.value))} style={input}>{[3,5,10].map(y=><option key={y} value={y}>{y} years</option>)}</select></label>
    <label>Universe<select value={universe} onChange={e=>setUniverse(e.target.value)} style={input}><option>Initial 10-stock test universe</option></select></label>
    <label>Minimum avg return (%)<input type="number" value={minAvg} onChange={e=>setMinAvg(e.target.value)} style={input}/></label>
    <label>Minimum positive years<select value={minPositive} onChange={e=>setMinPositive(Number(e.target.value))} style={input}><option value="0">Any</option>{[3,4,5].filter(y=>y<=years).map(y=><option key={y} value={y}>{y}/{years}</option>)}</select></label>
   </div>
   <button onClick={scan} disabled={loading} style={{marginTop:18,padding:'12px 24px',border:0,borderRadius:9,fontWeight:800,cursor:loading?'wait':'pointer'}}>{loading?'Scanning Upstox…':'Scan Stocks'}</button>
  </section>
  <section style={{marginTop:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>{scanned?'Results':'Run your first scan'}</h2><span style={{color:'#667085',fontSize:13}}>{data?`${data.matched} matched / ${data.scanned} scanned`:'Real-data scan'}</span></div>
   {error && <div style={{padding:14,borderRadius:10,border:'1px solid #fecdca',marginBottom:14}}>Scanner error: {error}</div>}
   {results.length>0 && <div style={{overflowX:'auto',background:'#fff',border:'1px solid #e4e7ec',borderRadius:14}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:850}}><thead><tr>{['Rank','Stock','Avg return','Positive years','Median','Best','Worst'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{results.map((s,i)=><tr key={s.symbol}>{[i+1,s.symbol,`${s.average>=0?'+':''}${s.average.toFixed(2)}%`,`${s.positiveYears}/${s.yearsAvailable}`,`${s.median>=0?'+':''}${s.median.toFixed(2)}%`,`${s.best>=0?'+':''}${s.best.toFixed(2)}%`,`${s.worst>=0?'+':''}${s.worst.toFixed(2)}%`].map((v,j)=><td key={j} style={td}>{v}</td>)}</tr>)}</tbody></table></div>}
   {data && results.length===0 && !error && <div style={{padding:18,border:'1px solid #e4e7ec',borderRadius:12}}>No stocks matched the selected filters.</div>}
   {data?.errors?.length>0 && <details style={{marginTop:14}}><summary>{data.errors.length} stock(s) could not be scanned</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(data.errors,null,2)}</pre></details>}
   <p style={{fontSize:12,color:'#667085',marginTop:12}}>Method: calendar-month close-to-close return. The current incomplete month is excluded when it is the selected month. This V0.3 version uses a 10-stock test universe; after validation against Moneycontrol, we will expand it to Nifty 500 and add stored historical data.</p>
  </section>
 </main>
}
const input={display:'block',width:'100%',boxSizing:'border-box',marginTop:6,padding:11,border:'1px solid #d0d5dd',borderRadius:8,background:'#fff'};
const th={textAlign:'left',padding:13,borderBottom:'1px solid #e4e7ec',fontSize:13,color:'#667085'};
const td={padding:13,borderBottom:'1px solid #f0f2f5',fontSize:14};
