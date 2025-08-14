// Leads Metrics dashboard (dummy-data powered) — v2 with 'All' in every filter
(function(){
  const diag = document.getElementById('diag');
  function log(msg){ if(diag){ diag.innerHTML = msg; } }

  function ensurePlotly(){
    if(!window.Plotly){
      log('⚠️ Plotly failed to load. Check your network/Content Security Policy.'); 
      return false;
    }
    return true;
  }

  const now = new Date();
  function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addMonths(d,n){ const x=new Date(d); x.setMonth(x.getMonth()+n); return x; }
  function monthShort(y,m){ return new Date(y,m,1).toLocaleString('en-US',{month:'short'}); }

  // Seeded RNG for reproducible mock data
  function mulberry32(a){ return function(){ let t=a += 0x6D2B79F5; t = Math.imul(t ^ t>>>15, t | 1); t ^= t + Math.imul(t ^ t>>>7, t | 61); return ((t ^ t>>>14) >>> 0) / 4294967296; } }
  let rng = mulberry32(777777);
  function rand(a=0,b=1){ return a + (b-a)*rng(); }
  function choice(arr){ return arr[Math.floor(rand(0,arr.length))]; }

  // Dimensions
  const Countries = ["Indonesia","Malaysia","Phillipine","Thailand","Vietnam"];
  const PartnerCats = ["VC Partner","Referral partner","AM managed Partners","Alliance Partner","Distribution Partner","TPI Partner","Embedded partner","Refferal Others"];
  const Agreements = ["Revenue Sharing","Non Revenue Sharing"];
  const Industries = ["Digital Product","Entertainment","Property","Financial Service","Travel&Hospitality","Non Profit","Retail","Services","Other"];
  const CPMs = ["Charisse","OT","Hanna","Rizki"];
  const Products = ["VA","eWallet","Cards","Direct Debit","QR Code"];
  const LeadFlows = ["Self Serve","Sales","CPM"];
  const MktActs = ["Event campaign","Campaign","Non Marketing"];

  // Mock partners
  const Partners = Array.from({length: 180}).map((_,i)=>{
    const product = choice(Products);
    const industry = choice(Industries);
    const country = choice(Countries);
    const baseTPV = (
      product==='Cards' ? rand(400000, 5000000) :
      product==='eWallet' ? rand(250000, 3000000) :
      product==='QR Code' ? rand(180000, 1500000) :
      product==='Direct Debit'? rand(120000, 900000) :
      rand(150000, 1200000)
    );
    const grossRate = rand(0.006, 0.02);
    const netRate   = Math.max(0.002, grossRate - rand(0.001, 0.006));
    const netNetRate= Math.max(0.001, netRate   - rand(0.0005, 0.004));
    const monthsAgo = Math.floor(rand(0, 16));
    const activation = new Date(now.getFullYear(), now.getMonth()-monthsAgo, 1 + Math.floor(rand(0,25)));
    return { id:'P'+(i+1), country, partnerCat:choice(PartnerCats), agreement:choice(Agreements), industry, cpm:choice(CPMs), product, lead:choice(LeadFlows), mkt:choice(MktActs), activation, baseTPV, grossRate, netRate, netNetRate };
  });

  function seasonalFactor(month, industry){
    let f = 1.0;
    if(industry==='Retail'){ if(month===10||month===11) f += 0.18; if(month===0) f -= 0.05; }
    if(industry==='Travel&Hospitality'){ if(month===5||month===6) f += 0.15; if(month===1) f -= 0.05; }
    if(industry==='Entertainment'){ if(month===11) f += 0.10; }
    return f;
  }

  function getFilters(){
    return {
      country: document.getElementById('f_country').value,
      partnerCat: document.getElementById('f_partnerCat').value,
      agreement: document.getElementById('f_agreement').value,
      industry: document.getElementById('f_industry').value,
      cpm: document.getElementById('f_cpm').value,
      product: document.getElementById('f_product').value,
      lead: document.getElementById('f_lead').value,
      mkt: document.getElementById('f_mkt').value,
      age: document.getElementById('f_age').value,
    };
  }

  function partnerMatches(p, f){
    if(f.country!=='All' && p.country!==f.country) return false;
    if(f.partnerCat!=='All' && p.partnerCat!==f.partnerCat) return false;
    if(f.agreement!=='All' && p.agreement!==f.agreement) return false;
    if(f.industry!=='All' && p.industry!==f.industry) return false;
    if(f.cpm!=='All' && p.cpm!==f.cpm) return false;
    if(f.product!=='All' && p.product!==f.product) return false;
    if(f.lead!=='All' && p.lead!==f.lead) return false;
    if(f.mkt!=='All' && p.mkt!==f.mkt) return false;
    const monthsActive = (now.getFullYear()-p.activation.getFullYear())*12 + (now.getMonth()-p.activation.getMonth()) - (now.getDate()<p.activation.getDate()?1:0);
    if(f.age==='Less than 6 months transacting' && monthsActive>=6) return false;
    if(f.age==='More than 6 months transacting' && monthsActive<6) return false;
    return true;
  }

  function aggregateMonthly(N=12, filters=getFilters()){
    const months = [];
    const monthly = Array.from({length:N}, ()=>({ tpv:0, gross:0, net:0, netnet:0, leads:0 }));
    for(let k=N-1;k>=0;k--){
      const d = startOfMonth(addMonths(now, -k));
      months.push({ y:d.getFullYear(), m:d.getMonth(), dim:daysInMonth(d.getFullYear(), d.getMonth()) });
    }
    const selected = Partners.filter(p=>partnerMatches(p, filters));
    monthly.forEach(mo=>{
      mo.byFlow = { "Self Serve":{gross:0,net:0,netnet:0,count:0}, "Sales":{gross:0,net:0,netnet:0,count:0}, "CPM":{gross:0,net:0,netnet:0,count:0} };
      mo.byPartner = { "VC Partner":{gross:0,net:0,netnet:0,count:0}, "Referral partner":{gross:0,net:0,netnet:0,count:0}, "AM managed Partners":{gross:0,net:0,netnet:0,count:0}, "Alliance Partner":{gross:0,net:0,netnet:0,count:0}, "Distribution Partner":{gross:0,net:0,netnet:0,count:0}, "TPI Partner":{gross:0,net:0,netnet:0,count:0}, "Embedded partner":{gross:0,net:0,netnet:0,count:0} };
    });
    selected.forEach(p=>{
      months.forEach((mo, idx)=>{
        const monthStart = new Date(mo.y, mo.m, 1);
        if(p.activation > new Date(mo.y, mo.m, mo.dim)) return;
        const monthsActive = (monthStart.getFullYear()-p.activation.getFullYear())*12 + (monthStart.getMonth()-p.activation.getMonth());
        const growth = Math.min(1 + 0.015*monthsActive, 2.2);
        const season = seasonalFactor(mo.m, p.industry);
        const noise = 0.9 + 0.2*rand();
        const tpv = p.baseTPV * growth * season * noise;
        const gross = tpv * p.grossRate;
        const net   = tpv * p.netRate;
        const netnet= tpv * p.netNetRate;
        monthly[idx].tpv   += tpv;
        monthly[idx].gross += gross;
        monthly[idx].net   += net;
        monthly[idx].netnet+= netnet;
        monthly[idx].leads += Math.max(0, Math.round((tpv/20000) * (0.7 + 0.6*rand())));
        monthly[idx].byFlow[p.lead].gross += gross;
        monthly[idx].byFlow[p.lead].net   += net;
        monthly[idx].byFlow[p.lead].netnet+= netnet;
        monthly[idx].byFlow[p.lead].count += 1;
        if(monthly[idx].byPartner[p.partnerCat]){
          monthly[idx].byPartner[p.partnerCat].gross += gross;
          monthly[idx].byPartner[p.partnerCat].net   += net;
          monthly[idx].byPartner[p.partnerCat].netnet+= netnet;
          monthly[idx].byPartner[p.partnerCat].count += 1;
        }
      });
    });
    // Leads targets (cards)
    const monthsInQuarter = (m)=>{ const q = Math.floor(m/3); return [q*3, q*3+1, q*3+2]; };
    const curMonth = months[months.length-1];
    const prevQuarterMonths = monthsInQuarter((curMonth.m+9)%12);
    let prevQuarterLeads = 0;
    months.forEach((mo, idx)=>{ if(prevQuarterMonths.includes((mo.m))) prevQuarterLeads += monthly[idx].leads; });
    const quarterTarget = Math.round(prevQuarterLeads * 1.10);
    return { months, monthly, quarterTarget, selectedCount: selected.length };
  }

  function monthLabels(months){ return months.map(m=> monthShort(m.y, m.m)); }

  function computeAvgSeries({months, monthly}, kind, mode){
    const labels = monthLabels(months);
    const groups = (mode==='Sales Flow')
      ? ["Self Serve","Sales","CPM"]
      : ["VC Partner","Referral partner","AM managed Partners","Alliance Partner","Distribution Partner","TPI Partner","Embedded partner"];
    const series = groups.map(g=>({ name:g, y:[] }));
    for(let i=0;i<monthly.length;i++){
      if(mode==='Sales Flow'){
        groups.forEach((g,gi)=>{
          const b = monthly[i].byFlow[g];
          const v = b.count>0 ? b[kind]/b.count : null;
          series[gi].y.push(v);
        });
      } else {
        groups.forEach((g,gi)=>{
          const b = monthly[i].byPartner[g] || {gross:0,net:0,netnet:0,count:0};
          const v = b.count>0 ? b[kind]/b.count : null;
          series[gi].y.push(v);
        });
      }
    }
    return { labels, series };
  }

  function updateCards({months, monthly, quarterTarget}){
    const cur = monthly[monthly.length-1];
    const curMonth = months[months.length-1];
    const dayN = new Date().getDate();
    const dim = curMonth.dim;
    const prevLeads = monthly[monthly.length-2]?.leads || 0;
    const monthlyTarget = Math.round(prevLeads * 1.05);
    const mtdTarget = Math.round(monthlyTarget * dayN / dim);
    const q = Math.floor(curMonth.m/3);
    const qMonths = [q*3, q*3+1, q*3+2];
    let quarterAchieved = 0;
    months.forEach((mo, idx)=>{
      if(!qMonths.includes(mo.m)) return;
      if(idx === months.length-1) quarterAchieved += Math.round((cur.leads) * dayN / dim);
      else quarterAchieved += monthly[idx].leads;
    });
    const pct = quarterTarget>0 ? Math.min(100, Math.round(quarterAchieved*100/quarterTarget)) : 0;
    document.getElementById('kpi_mtd_target').textContent = mtdTarget.toLocaleString('en-US') + " leads";
    document.getElementById('kpi_q_target').textContent = quarterTarget.toLocaleString('en-US') + " leads";
    document.getElementById('kpi_q_achieve_pct').textContent = pct + "%";
    document.getElementById('kpi_q_achieve_num').textContent = quarterAchieved.toLocaleString('en-US');
    document.getElementById('kpi_q_achieve_den').textContent = quarterTarget.toLocaleString('en-US');
    const tzDate = new Date();
    document.getElementById('asOf').textContent = `As of ${tzDate.toLocaleDateString('en-SG',{year:'numeric',month:'long',day:'numeric'})}`;
    document.getElementById('progressFill').style.width = pct + "%";
  }

  function plotBars(elId, labels, series, title, hasData){
    const container = document.getElementById(elId);
    const empty = container.querySelector('.empty');
    if(!hasData){
      empty.style.display = 'flex';
      if(container._plotly){ Plotly.purge(container); }
      return;
    } else {
      empty.style.display = 'none';
    }
    if(!ensurePlotly()) return;
    const traces = series.map(s=>({type:'bar', name:s.name, x:labels, y:s.y}));
    const layout = {
      paper_bgcolor:'white', plot_bgcolor:'white',
      barmode:'group',
      margin:{l:60,r:20,t:10,b:44},
      xaxis:{ title:'Month', gridcolor:'#eef2f7', zerolinecolor:'#cbd5e1', tickfont:{color:'#334155'}, titlefont:{color:'#334155'} },
      yaxis:{ title:title, gridcolor:'#eef2f7', zerolinecolor:'#cbd5e1', tickprefix:'S$ ', separatethousands:true, tickfont:{color:'#334155'}, titlefont:{color:'#334155'} },
      legend:{ orientation:'h', y:1.12, x:0, font:{color:'#0f172a'} }
    };
    Plotly.react(container, traces, layout, {displayModeBar:true, responsive:true});
  }

  function drawAll(){
    const data = aggregateMonthly(12, getFilters());
    document.getElementById('matchCount').textContent = `${data.selectedCount.toLocaleString()} partners match`;
    updateCards(data);
    const mode = document.getElementById('groupBy').value;
    const G = computeAvgSeries(data, 'gross', mode);
    const N = computeAvgSeries(data, 'net', mode);
    const NN = computeAvgSeries(data, 'netnet', mode);
    const hasData = data.selectedCount > 0;
    plotBars('ch_avg_gross', G.labels, G.series, 'Avg Gross Revenue (S$)', hasData);
    plotBars('ch_avg_net', N.labels, N.series, 'Avg Net Revenue (S$)', hasData);
    plotBars('ch_avg_netnet', NN.labels, NN.series, 'Avg Net Net Revenue (S$)', hasData);
    if(diag) diag.style.display = 'none';
  }

  // UI hooks
  window.addEventListener('DOMContentLoaded', function(){
    const fb = document.getElementById('filtersBlock'); fb.open = false;
    document.getElementById('toggleFilters').addEventListener('click', ()=>{
      fb.open = !fb.open;
      document.getElementById('toggleFilters').textContent = fb.open ? 'Hide filters' : 'Show filters';
    });
    document.getElementById('resetBtn').addEventListener('click', ()=>{
      ['f_country','f_partnerCat','f_agreement','f_industry','f_cpm','f_product','f_lead','f_mkt','f_age'].forEach(id=> document.getElementById(id).selectedIndex = 0);
      drawAll();
    });
    ['f_country','f_partnerCat','f_agreement','f_industry','f_cpm','f_product','f_lead','f_mkt','f_age','groupBy']
      .forEach(id=> document.getElementById(id).addEventListener('change', drawAll));

    // Initial draw (defaults are All)
    drawAll();
  });
})();