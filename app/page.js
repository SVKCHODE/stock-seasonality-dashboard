'use client';

import { useMemo, useState } from 'react';

const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
const demoStocks=[
 {symbol:'STOCK-A',avg:7.2,positive:5,median:6.8,best:12.4,worst:2.1},
 {symbol:'STOCK-B',avg:6.4,positive:4,median:6.7,best:15.1,worst:-3.2},
 {symbol:'STOCK-C',avg:5.8,positive:5,median:5.4,best:9.7,worst:1.4},
 {symbol:'STOCK-D',avg:5.1,positive:4,median:4.8,best:11.2,worst:-1.8},
 {symbol:'STOCK-E',avg:4.7,positive:5,median:4.4,best:8.9,worst:1.1},
 {symbol:'STOCK-F',avg:4.1,positive:4,median:4.0,best:9.5,worst:-2.7}
];

export default function Home(){
 const [month,setMonth]=useState(7),[years,setYears]=useState(5),[universe,setUniverse]=useState('Nifty 500'),[minAvg,setMinAvg]=useState(0),[minPositive,setMinPositive]=useState(0),[scanned,setScanned]=useState(false);
 const results=useMemo(()=>demoStocks.filter(s=>s.avg>=Number(minAvg)&&s.positive>=Number(minPositive)).sort((a,b)=>b.avg-a.avg),[minAvg,minPositive]);
 return <main style={{maxWidth:1150,margin:'0 auto',padding:'30px 18px'}}>
  <div style={{fontSize:12,fontWeight:800,letterSpacing:1.2}}>MARKET RESEARCH TOOL</div>
  <h1 style={{fontSize:34,margin:'8px 0'}}>Seasonal Stock Scanner</h1>
  <p style={{color:'#667085',maxWidth:760}}>Find stocks that historically perform well in a selected calendar month. Use the shortlist for deeper fundamental analysis elsewhere.</p>
  <section style={{background:'#fff',border:'1px solid #e4e7ec',borderRadius:14,padding:20,marginTop:24}}>
   <h2 style={{marginTop:0}}>Screening criteria</h2>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14}}>
    <label>Month<select value={month} onChange={e=>setMonth(Number(e.target.value))} style={input}>{months.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></label>
    <label>Lookback<select value={years} onChange={e=>setYears(Number(e.target.value))} style={input}>{[3,5,10].map(y=><option key={y} value={y}>{y} years</option>)}</select></label>
    <label>Universe<select value={universe} onChange={e=>setUniverse(e.target.value)} style={input}><option>Nifty 50</option><option>Nifty 200</option><option>Nifty 500</option><option>NSE listed</option></select></label>
    <label>Minimum avg return (%)<input type="number" value={minAvg} onChange={e=>setMinAvg(e.target.value)} style={input}/></label>
    <label>Minimum positive years<select value={minPositive} onChange={e=>setMinPositive(Number(e.target.value))} style={input}><option value="0">Any</option>{[3,4,5].map(y=><option key={y} value={y}>{y}/{years}</option>)}</select></label>
   </div>
   <button onClick={()=>setScanned(true)} style={{marginTop:18,padding:'12px 24px',border:0,borderRadius:9,fontWeight:800,cursor:'pointer'}}>Scan Stocks</button>
  </section>
  <section style={{marginTop:22}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>{scanned?'Results':'Preview results'}</h2><span style={{color:'#667085',fontSize:13}}>{results.length} stocks matched</span></div>
   <div style={{overflowX:'auto',background:'#fff',border:'1px solid #e4e7ec',borderRadius:14}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:760}}><thead><tr>{['Rank','Stock','Avg return','Positive years','Median','Best','Worst'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{results.map((s,i)=><tr key={s.symbol}>{[i+1,s.symbol,`+${s.avg.toFixed(1)}%`,`${s.positive}/${years}`,`${s.median>0?'+':''}${s.median.toFixed(1)}%`,`+${s.best.toFixed(1)}%`,`${s.worst>0?'+':''}${s.worst.toFixed(1)}%`].map((v,j)=><td key={j} style={td}>{v}</td>)}</tr>)}</tbody></table></div>
   <p style={{fontSize:12,color:'#667085',marginTop:12}}>Prototype results are illustrative. The next build connects this screen to real historical market data and the selected stock universe.</p>
  </section>
 </main>
}
const input={display:'block',width:'100%',boxSizing:'border-box',marginTop:6,padding:11,border:'1px solid #d0d5dd',borderRadius:8,background:'#fff'};
const th={textAlign:'left',padding:13,borderBottom:'1px solid #e4e7ec',fontSize:13,color:'#667085'};
const td={padding:13,borderBottom:'1px solid #f0f2f5',fontSize:14};
