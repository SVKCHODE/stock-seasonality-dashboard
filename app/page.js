'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const sample = {
  RELIANCE: [1.8,0.9,-1.4,2.7,1.2,0.4,-0.8,1.9,0.6,-0.5,2.1,1.3],
  INFY: [0.7,1.4,-0.9,2.1,0.4,-1.1,1.5,0.8,-0.3,1.7,0.9,1.1],
  TCS: [1.1,0.8,-0.6,1.5,0.7,0.2,1.0,-0.4,0.5,1.3,0.6,0.9]
};
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function Home(){
 const [ticker,setTicker]=useState('RELIANCE'); const [query,setQuery]=useState('RELIANCE');
 const data=useMemo(()=> (sample[ticker]||sample.RELIANCE).map((v,i)=>({month:months[i],return:v})),[ticker]);
 const avg=(data.reduce((a,b)=>a+b.return,0)/12).toFixed(2);
 const positive=data.filter(x=>x.return>0).length;
 return <main style={{maxWidth:1100,margin:'0 auto',padding:'28px 18px'}}>
  <header><div style={{fontSize:13,fontWeight:700,letterSpacing:1,color:'#53627a'}}>MARKET ANALYTICS</div><h1 style={{margin:'8px 0 4px',fontSize:32}}>Stock Seasonality Dashboard</h1><p style={{color:'#667085'}}>Explore historical monthly performance patterns.</p></header>
  <section style={{display:'flex',gap:10,margin:'24px 0'}}><input value={query} onChange={e=>setQuery(e.target.value.toUpperCase())} placeholder="Enter NSE ticker" style={{flex:1,padding:13,border:'1px solid #d0d5dd',borderRadius:9,fontSize:16}}/><button onClick={()=>setTicker(query)} style={{padding:'0 22px',border:0,borderRadius:9,fontWeight:700,cursor:'pointer'}}>Analyze</button></section>
  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:18}}>{[['Ticker',ticker],['Average monthly return',avg+'%'],['Positive months',positive+'/12']].map(([a,b])=><div key={a} style={{background:'white',padding:18,borderRadius:12,border:'1px solid #e4e7ec'}}><div style={{fontSize:13,color:'#667085'}}>{a}</div><div style={{fontSize:24,fontWeight:700,marginTop:7}}>{b}</div></div>)}</div>
  <section style={{background:'white',padding:20,borderRadius:12,border:'1px solid #e4e7ec'}}><h2 style={{marginTop:0}}>Average monthly return</h2><div style={{width:'100%',height:360}}><ResponsiveContainer><BarChart data={data}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month"/><YAxis unit="%"/><Tooltip formatter={(v)=>[v+'%','Return']}/><Bar dataKey="return"/></BarChart></ResponsiveContainer></div></section>
  <p style={{fontSize:12,color:'#667085',marginTop:16}}>Prototype data is currently illustrative. The next step is connecting this dashboard to a real historical market-data source.</p>
 </main>
}