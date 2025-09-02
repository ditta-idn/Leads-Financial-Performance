// Combined Leads Dashboard — Targets + Financial (stacked area) + Performance
(function(){
  const diag = document.getElementById('diag');
  function log(msg){ if(diag){ diag.innerHTML = msg; } }
  function ensurePlotly(){ 
    if(!window.Plotly){ log('⚠️ Plotly not loaded'); return false; }
    return true;
  }

  const now = new Date();
  function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addMonths(d,n){ const x=new Date(d); x.setMonth(x.getMonth()+n); return x; }
  function monthShort(y,m){ return new Date(y,m,1).toLocaleString('en-US',{month:'short', year:'2-digit'}); }

  // Seeded RNG
  function mulberry32(a){ return function(){ let t=a += 0x6D2B79F5; t = Math.imul(t ^ t>>>15, t | 1); t ^= t + Math.imul(t ^ t>>>7, t | 61); return ((t ^ t>>>14) >>> 0) / 4294967296; } }
  let rng = mulberry32(24681357);
  function rand(a=0,b=1){ return a + (b-a)*rng(); }
  function choice(arr){ return arr[Math.floor(rand(0,arr.length))]; }

  // Dimensions
  const Countries = ["Indonesia","Malaysia","Phillipine","Thailand","Vietnam"];
  const PartnerCats = ["VC Partner","Referral partner","AM managed Partners","Alliance Partner","Distribution Partner","TPI Partner","Embedded partner","Refferal Others"];
  const Agreements = ["Revenue Sharing","Non Revenue Sharing"];
  const Industries = ["Digital Product","Entertainment","Property","Financial Service","Travel&Hospitality","Non Profit","Retail","Services","Other"];
  const CPMs = ["Hanna","Rizky","Olivia","Charisse"];
  const Products = ["VA","eWallet","Cards","Direct Debit","QR Code"];
  const LeadFlows = ["Self Serve","Sales","CPM"];
  const MktActs = ["Event campaign","Campaign","Non Marketing"];

  // One unified partner universe used by BOTH financial & performance sections
  const Partners = Array.from({length: 200}).map((_,i)=>{
    const product = choice(Products);
    const industry = choice(Industries);
    const country = choice(Countries);
    const lead = choice(LeadFlows);
    const partnerCat = choice(PartnerCats);
    // financial base
    const baseTPV = (
      product==='Cards' ? rand(400000, 5000000) :
      product==='eWallet' ? rand(250000, 3000000) :
      product==='QR Code' ? rand(180000, 1500000) :
      product==='Direct Debit' ? rand(120000, 900000) :
      rand(150000, 1200000)
    );
    const grossRate = rand(0.006, 0.02);
    const netRate   = Math.max(0.002, grossRate - rand(0.001, 0.006));
    const netNetRate= Math.max(0.001, netRate   - rand(0.0005, 0.004));
    // performance base
    const baseLeads = (
      lead==='Self Serve' ? rand(20, 120) :
      lead==='CPM' ? rand(8, 60) :
      rand(10, 80)
    );
    const convBase = (
      lead==='Self Serve' ? rand(0.28, 0.55) :
      lead==='Sales' ? rand(0.18, 0.4) :
      rand(0.22, 0.48)
    );
    const cycleBase = (
      lead==='Self Serve' ? rand(5, 25) :
      lead==='Sales' ? rand(25, 70) :
      rand(15, 45)
    ); // days
    const monthsAgo = Math.floor(rand(0, 20));
    const activation = new Date(now.getFullYear(), now.getMonth()-monthsAgo, 1 + Math.floor(rand(0,25)));
    return { id:'P'+(i+1), country, partnerCat, agreement:choice(Agreements), industry, cpm:choice(CPMs), product, lead, mkt:choice(MktActs), activation, baseTPV, grossRate, netRate, netNetRate, baseLeads, convBase, cycleBase };
  });

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
    const now2 = new Date();
    if(f.country!=='All' && p.country!==f.country) return false;
    if(f.partnerCat!=='All' && p.partnerCat!==f.partnerCat) return false;
    if(f.agreement!=='All' && p.agreement!==f.agreement) return false;
    if(f.industry!=='All' && p.industry!==f.industry) return false;
    if(f.cpm!=='All' && p.cpm!==f.cpm) return false;
    if(f.product!=='All' && p.product!==f.product) return false;
    if(f.lead!=='All' && p.lead!==f.lead) return false;
    if(f.mkt!=='All' && p.mkt!==f.mkt) return false;
    const monthsActive = (now2.getFullYear()-p.activation.getFullYear())*12 + (now2.getMonth()-p.activation.getMonth()) - (now2.getDate()<p.activation.getDate()?1:0);
    if(f.age==='Less than 6 months transacting' && monthsActive>=6) return false;
    if(f.age==='More than 6 months transacting' && monthsActive<6) return false;
    return true;
  }

  function seasonalFactor(month, industry){
    let f = 1.0;
    if(industry==='Retail'){ if(month===10||month===11) f += 0.18; if(month===0) f -= 0.05; }
    if(industry==='Travel&Hospitality'){ if(month===5||month===6) f += 0.15; if(month===1) f -= 0.05; }
    if(industry==='Entertainment'){ if(month===11) f += 0.10; }
    return f;
  }

  // Aggregate monthly for both revenue & leads
  function aggregate(N=12, filters=getFilters()){
    const months = [];
    const monthly = Array.from({length:N}, ()=>({ tpv:0, gross:0, net:0, netnet:0, leads:0, convLeads:0, cycleSum:0, cycleCount:0, dim:30, byFlow:{}, byPartner:{} }));
    for(let k=N-1;k>=0;k--){
      const d = startOfMonth(addMonths(now, -k));
      months.push({ y:d.getFullYear(), m:d.getMonth(), dim:daysInMonth(d.getFullYear(), d.getMonth()) });
    }
    const selected = Partners.filter(p=>partnerMatches(p, filters));
    const partnerTypes = ["VC Partner","Referral partner","AM managed Partners","Alliance Partner","Distribution Partner","TPI Partner","Embedded partner"];
    const flows = ["Self Serve","Sales","CPM"];
    monthly.forEach((mo,idx)=>{
      mo.dim = months[idx].dim;
      mo.byFlow = { "Self Serve":{gross:0,net:0,netnet:0,count:0}, "Sales":{gross:0,net:0,netnet:0,count:0}, "CPM":{gross:0,net:0,netnet:0,count:0} };
      mo.byPartner = {}; partnerTypes.forEach(pt=> mo.byPartner[pt] = {gross:0,net:0,netnet:0,count:0});
    });
    selected.forEach(p=>{
      months.forEach((mo, idx)=>{
        // skip months before partner activation
        if(p.activation > new Date(mo.y, mo.m, mo.dim)) return;
        const monthsActive = (new Date(mo.y, mo.m, 1).getFullYear()-p.activation.getFullYear())*12 + (new Date(mo.y, mo.m, 1).getMonth()-p.activation.getMonth());
        const growth = Math.min(1 + 0.015*monthsActive, 2.2);
        const season = seasonalFactor(mo.m, p.industry);
        const noise = 0.9 + 0.2*rand();
        const tpv = p.baseTPV * growth * season * noise;
        const gross = tpv * p.grossRate;
        const net   = tpv * p.netRate;
        const netnet= tpv * p.netNetRate;

        // leads for performance
        const leadSeason = season; // reuse same seasonal shape
        const leads = Math.max(0, Math.round(p.baseLeads * leadSeason * (0.8 + 0.4*rand())));
        const convRate = Math.min(0.95, Math.max(0.05, p.convBase * (0.85 + 0.3*rand())));
        const transacting = Math.round(leads * convRate);
        const cycle = Math.max(2, p.cycleBase * (0.8 + 0.4*rand()));

        monthly[idx].tpv   += tpv;
        monthly[idx].gross += gross;
        monthly[idx].net   += net;
        monthly[idx].netnet+= netnet;
        monthly[idx].leads += leads;
        monthly[idx].convLeads += transacting;
        monthly[idx].cycleSum += cycle * transacting;
        monthly[idx].cycleCount += transacting;

        // buckets for averages
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
    return { months, monthly, selectedCount: selected.length };
  }

  function monthLabels(months){ return months.map(m=> monthShort(m.y, m.m)); }

  function computeAvgSeries(data, kind, mode){
    const labels = monthLabels(data.months);
    const groups = (mode==='Sales Flow') ? ["Self Serve","Sales","CPM"]
      : ["VC Partner","Referral partner","AM managed Partners","Alliance Partner","Distribution Partner","TPI Partner","Embedded partner"];
    const series = groups.map(g=>({ name:g, y:[] }));
    for(let i=0;i<data.monthly.length;i++){
      if(mode==='Sales Flow'){
        groups.forEach((g,gi)=>{
          const b = data.monthly[i].byFlow[g];
          const v = b.count>0 ? b[kind]/b.count : null;
          series[gi].y.push(v);
        });
      } else {
        groups.forEach((g,gi)=>{
          const b = data.monthly[i].byPartner[g] || {gross:0,net:0,netnet:0,count:0};
          const v = b.count>0 ? b[kind]/b.count : null;
          series[gi].y.push(v);
        });
      }
    }
    return { labels, series };
  }

  function updateCards(data){
    const months = data.months, monthly = data.monthly;
    const cur = monthly[monthly.length-1];
    const curMonth = months[months.length-1];
    const dayN = new Date().getDate();
    const dim = curMonth.dim;
    const prevLeads = monthly[monthly.length-2]?.leads || 0;
    const monthlyTarget = Math.round(prevLeads * 1.05);
    const mtdTarget = Math.round(monthlyTarget * dayN / dim);
    // quarter calc
    const q = Math.floor(curMonth.m/3);
    const qMonths = [q*3, q*3+1, q*3+2];
    let prevQuarterLeads = 0;
    monthly.forEach((mo, idx)=>{ if(qMonths.includes(months[idx].m)) prevQuarterLeads += monthly[idx].leads; });
    const quarterTarget = Math.round(prevQuarterLeads * 1.10);
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
  }

  function plotStackArea(elId, labels, series, title, hasData){
    const el = document.getElementById(elId);
    const empty = el.querySelector('.empty');
    if(!hasData){ empty.style.display='flex'; if(el._plotly){ Plotly.purge(el); } return; }
    empty.style.display='none';
    if(!ensurePlotly()) return;
    const traces = series.map((s, i)=> ({
      type:'scatter', mode:'lines',
      name:s.name, x:labels, y:s.y,
      stackgroup:'one', groupnorm:'', // stacked absolute
      line:{width:1}, hovertemplate:'%{x}<br>%{y:.2f}<extra>'+s.name+'</extra>'
    }));
    const layout = {
      paper_bgcolor:'white', plot_bgcolor:'white',
      margin:{l:60,r:20,t:10,b:44},
      xaxis:{ title:'Month', gridcolor:'#eef2f7', zerolinecolor:'#cbd5e1' },
      yaxis:{ title:title, gridcolor:'#eef2f7', zerolinecolor:'#cbd5e1', tickprefix:'S$ ' },
      legend:{ orientation:'h', y:1.12, x:0 }
    };
    Plotly.react(el, traces, layout, {displayModeBar:true, responsive:true});
  }

  function plotBars(elId, x, y, title, yTitle){
    const el = document.getElementById(elId);
    const empty = el.querySelector('.empty');
    if(!ensurePlotly()){ empty.style.display='flex'; return; }
    if(y.every(v=> v==null)){ empty.style.display='flex'; if(el._plotly){ Plotly.purge(el); } return; }
    empty.style.display='none';
    const trace = { type:'bar', name:title, x, y };
    const layout = {
      paper_bgcolor:'white', plot_bgcolor:'white',
      margin:{l:70,r:20,t:10,b:44},
      xaxis:{ title:'Month', gridcolor:'#eef2f7', zerolinecolor:'#cbd5e1' },
      yaxis:{ title:yTitle, gridcolor:'#eef2f7', zerolinecolor:'#cbd5e1' },
      legend:{orientation:'h', y:1.12, x:0}
    };
    Plotly.react(el, [trace], layout, {displayModeBar:true, responsive:true});
  }

  function plotBarLineDual(elId, x, barsY, lineY, y1Title, y2Title, lineName){
    const el = document.getElementById(elId);
    const empty = el.querySelector('.empty');
    if(!ensurePlotly()){ empty.style.display='flex'; return; }
    const bars = { type:'bar', name:'# of leads', x, y: barsY, marker:{opacity:0.9} };
    const line = { type:'scatter', mode:'lines+markers', name:lineName, x, y: lineY, yaxis:'y2' };
    const layout = {
      paper_bgcolor:'white', plot_bgcolor:'white',
      barmode:'group',
      margin:{l:70,r:70,t:10,b:44},
      xaxis:{ title:'Month', gridcolor:'#eef2f7', zerolinecolor:'#cbd5e1' },
      yaxis:{ title:y1Title, gridcolor:'#eef2f7', zerolinecolor:'#cbd5e1' },
      yaxis2:{ title:y2Title, overlaying:'y', side:'right', gridcolor:'#f8fafc', tickformat: (y2Title.includes('%') ? '.0%' : null) },
      legend:{orientation:'h', y:1.12, x:0}
    };
    Plotly.react(el, [bars, line], layout, {displayModeBar:true, responsive:true});
  }

  function drawAll(){
    const filters = getFilters();
    if(!ensurePlotly()) return;
    // recompute
    const data = aggregate(12, filters);
    const labels = monthLabels(data.months);
    document.getElementById('matchCount').textContent = `${data.selectedCount.toLocaleString()} partners match`;
    const tzDate = new Date();
    document.getElementById('asOf').textContent = `As of ${tzDate.toLocaleDateString('en-SG',{year:'numeric',month:'long',day:'numeric'})}`;

    // 1) Cards
    updateCards(data);

    // 2) Financial metrics — stacked area
    const mode = document.getElementById('groupBy').value;
    const G = computeAvgSeries(data, 'gross', mode);
    const N = computeAvgSeries(data, 'net', mode);
    const NN = computeAvgSeries(data, 'netnet', mode);
    const hasData = data.selectedCount > 0;
    plotStackArea('ch_avg_gross', G.labels, G.series, 'Avg Gross Revenue (S$)', hasData);
    plotStackArea('ch_avg_net', N.labels, N.series, 'Avg Net Revenue (S$)', hasData);
    plotStackArea('ch_avg_netnet', NN.labels, NN.series, 'Avg Net Net Revenue (S$)', hasData);

    // 3) Performance — uses leads & conversions from same data
    const leads = data.monthly.map(m=> m.leads);
    const avgCycle = data.monthly.map(m=> m.cycleCount>0 ? (m.cycleSum/m.cycleCount) : null);
    const convPct = data.monthly.map(m=> m.leads>0 ? (m.convLeads/m.leads) : null);

    plotBars('ch_leads', labels, leads, '# of leads', '# of Leads');
    plotBarLineDual('ch_cycle', labels, leads, avgCycle, '# of Leads', 'Avg Deal Cycle (days)', 'Avg cycle (days)');
    plotBarLineDual('ch_convert', labels, leads, convPct, '# of Leads', '% Transacting', '% converting');

    if(diag) diag.style.display = 'none';
  }

  // UI hooks
  window.addEventListener('DOMContentLoaded', function(){
    try {
    const fb = document.getElementById('filtersBlock'); fb.open = false;
    document.getElementById('toggleFilters').addEventListener('click', ()=>{
      fb.open = !fb.open;
      document.getElementById('toggleFilters').textContent = fb.open ? 'Hide filters' : 'Show filters';
    });
    document.getElementById('resetBtn').addEventListener('click', ()=>{
      ['f_country','f_partnerCat','f_agreement','f_industry','f_cpm','f_product','f_lead','f_mkt','f_age'].forEach(id=> document.getElementById(id).selectedIndex = 0);
      document.getElementById('groupBy').selectedIndex = 0;
      drawAll();
    });
    ['f_country','f_partnerCat','f_agreement','f_industry','f_cpm','f_product','f_lead','f_mkt','f_age','groupBy']
      .forEach(id=> document.getElementById(id).addEventListener('change', drawAll));

    drawAll();
      if(diag) diag.style.display = 'none';
    } catch(e){ if(diag){ diag.textContent = '⚠️ ' + e.message; } console.error(e); }
  });
})();