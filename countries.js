// Countries dashboard powered by JSON files in output/.
// Expects: output/countries_all.json and output/countries_details/<ISO3>.json
/* globals d3 */

(function(){
  const container = document.getElementById('treemap-wrap');
  const svg = d3.select('#treemap-svg');
  const g = svg.append('g').attr('class','tiles');
  const pctFormat = d3.format('.1f');
  const DURATION = 1200; // slower, smoother

  const treemap = d3.treemap().paddingInner(6).round(true).tile(d3.treemapSquarify.ratio(1));

  let prevLayout = new Map();
  let color = d3.scaleOrdinal().range(['#cde7f0','#e6acbe','#e8f7bf','#bcd7b4','#f5b7a6','#c8d3ff','#b3c7e6','#e9e0d3','#c7f0e6','#dbd7f0','#f2c28b','#d4d8f7','#f1d5e5','#c9eadf']);

  const countriesIndex = new Map(); // iso3 -> summary row from countries_all.json

  // URL sync helpers
  function getParam(name){
    try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
  }
  function setParam(name, value){
    try {
      const url = new URL(window.location.href);
      if (value == null) url.searchParams.delete(name); else url.searchParams.set(name, value);
      // Also mirror to a generic 'code' for convenience
      url.searchParams.set('code', value || '');
      history.replaceState(null, '', url.toString());
    } catch {}
  }

  function setSvgToContainer() {
    const rect = container.getBoundingClientRect();
    const w = Math.max(200, Math.round(rect.width));
    const h = Math.max(200, Math.round(rect.height));
    svg.attr('width', w).attr('height', h);
    return {w,h};
  }

  function computeLeaves(rootData) {
    const root = d3.hierarchy(rootData).sum(d => d.value || 0).sort((a,b) => b.value - a.value);
    const {w,h} = setSvgToContainer();
    treemap.size([w,h])(root);
    const total = root.value || 1;
    const cats = Array.from(new Set(root.leaves().map(d => d.data.cat)));
    color.domain(cats);
    return root.leaves().map(d => ({
      key: String(d.data.name||d.data.id||'').toLowerCase().replace(/[^a-z0-9]+/g,'_'),
      id: String(d.data.name||d.data.id||'').toLowerCase().replace(/[^a-z0-9]+/g,'_'),
      name: d.data.name,
      value: d.value,
      x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1,
      cat: d.data.cat,
      pct: d.value / total
    }));
  }

  function renderList(listData) {
    const ul = d3.select('#topic-list');
    const items = ul.selectAll('li.topic').data(listData, d=>d.id);
    items.exit().remove();
    const enter = items.enter().append('li').attr('class','topic').style('opacity',0);
    enter.append('div').attr('class','title').text(d => d.text.length>80?d.text.slice(0,80)+'...':d.text);
    enter.append('div').attr('class','pct').text(d => d.pct);
    enter.transition().duration(420).style('opacity',1);
    enter.merge(items);
  }

  function renderTreemap(rootData) {
    const newLeaves = computeLeaves(rootData);
    const newLayout = new Map();
    newLeaves.forEach(d => newLayout.set(d.key, {
      x: d.x0,
      y: d.y0,
      w: d.x1 - d.x0,
      h: d.y1 - d.y0,
      name: d.name,
      cat: d.cat,
      pct: d.pct
    }));

    const groups = g.selectAll('.tile-group').data(newLeaves, d => d.key);

    const exiting = groups.exit();
    exiting.transition().duration(800).style('opacity',0).remove();

    const enter = groups.enter().append('g').attr('class','tile-group');
    enter.append('rect')
      .attr('class','tile')
      .attr('rx',6)
      .attr('ry',6)
      .style('opacity',0.95)
      .each(function(d){
        const r = newLayout.get(d.key);
        const r0 = prevLayout.get(d.key);
        const rect = d3.select(this);
        if (r0) {
          rect.attr('x', r0.x).attr('y', r0.y).attr('width', r0.w).attr('height', r0.h);
        } else {
          const cx = r.x + r.w/2;
          const cy = r.y + r.h/2;
          rect.attr('x', cx).attr('y', cy).attr('width', 0).attr('height', 0);
        }
        rect.style('fill', color(r.cat));
      });
    enter.append('text')
      .attr('class','tile-label name')
      .style('font-size','11px')
      .style('font-weight','600')
      .style('opacity',0);
    enter.append('text')
      .attr('class','tile-label pct')
      .style('font-size','10px')
      .style('opacity',0);

    const merged = enter.merge(groups);
    merged.each(function(d){
      const node = d3.select(this);
      const r = newLayout.get(d.key);
      const tx = r.x + 8;
      const nameY = Math.min(r.y + 18, r.y + Math.max(16, r.h - 16));
      const pctY = Math.min(nameY + 16, r.y + r.h - 6);
      const pctText = `${pctFormat(r.pct * 100)}%`;

      const showBoth = r.w > 140 && r.h > 70;
      const showPctOnly = !showBoth && r.w > 80 && r.h > 40;
      const showPctTiny = !showBoth && !showPctOnly && r.w > 54 && r.h > 32;

      node.select('rect')
        .transition()
        .duration(DURATION)
        .ease(d3.easeCubicInOut)
        .attr('x', r.x)
        .attr('y', r.y)
        .attr('width', r.w)
        .attr('height', r.h)
        .style('fill', color(r.cat));

      const nameLabel = node.select('text.tile-label.name');
      const pctLabel = node.select('text.tile-label.pct');

      if (showBoth) {
        nameLabel.text(r.name.length>48?`${r.name.slice(0,45)}…`:r.name)
          .transition().duration(DURATION).ease(d3.easeCubicInOut)
          .attr('x', tx).attr('y', nameY).style('opacity',1).style('text-anchor','start');
        pctLabel.text(pctText)
          .transition().duration(DURATION).ease(d3.easeCubicInOut)
          .attr('x', tx).attr('y', pctY).style('opacity',0.9).style('text-anchor','start');
      } else if (showPctOnly) {
        nameLabel.transition().duration(400).style('opacity',0);
        pctLabel.text(pctText)
          .transition().duration(DURATION).ease(d3.easeCubicInOut)
          .attr('x', tx).attr('y', nameY).style('opacity',0.95).style('text-anchor','start');
      } else if (showPctTiny) {
        nameLabel.transition().duration(300).style('opacity',0);
        pctLabel.text(pctText)
          .transition().duration(DURATION).ease(d3.easeCubicInOut)
          .attr('x', r.x + r.w/2).attr('y', r.y + r.h/2).style('opacity',0.9).style('text-anchor','middle');
      } else {
        nameLabel.transition().duration(300).style('opacity',0);
        pctLabel.transition().duration(300).style('opacity',0);
      }
    });

    // Hover tooltip
    let tip = document.getElementById('aei-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'aei-tooltip';
      tip.style.position = 'fixed';
      tip.style.pointerEvents = 'none';
      tip.style.zIndex = '9999';
      tip.style.background = 'rgba(0,0,0,0.78)';
      tip.style.color = '#fff';
      tip.style.padding = '8px 10px';
      tip.style.borderRadius = '8px';
      tip.style.fontSize = '12px';
      tip.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
      tip.style.display = 'none';
      document.body.appendChild(tip);
    }

    function showTip(evt, r) {
      const pctText = `${pctFormat(r.pct*100)}%`;
      tip.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${r.name}</div><div>${r.cat}</div><div style="opacity:.9">Share: ${pctText}</div>`;
      const x = evt.clientX + 12;
      const y = evt.clientY + 12;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
      tip.style.display = 'block';
    }
    function hideTip(){ tip.style.display = 'none'; }

    merged
      .on('mousemove', function(evt,d){ const r = newLayout.get(d.key); if (r) showTip(evt, r); })
      .on('mouseenter', function(evt,d){ const r = newLayout.get(d.key); if (r) showTip(evt, r); })
      .on('mouseleave', hideTip);

    prevLayout = new Map();
    newLayout.forEach((v,k) => prevLayout.set(k, {x:v.x, y:v.y, w:v.w, h:v.h}));
    merged.transition().delay((d,i)=>i*8);
  }

  async function loadCountryDetails(code) {
    const res = await fetch(`output/countries_details/${code}.json`);
    if (!res.ok) throw new Error(`Failed to load details for ${code}`);
    return res.json();
  }

  function toTopicList(items, code){
    const arr = Array.isArray(items) ? items : [];
    return arr.slice(0,10).map((t,i) => ({ id:`${code}_t_${i+1}`, text:String(t.text||''), pct:`${pctFormat(+t.share || 0)}%` }));
  }

  function toTree(jobGroups, code){
    // countries sometimes have an object for job_groups; normalize to array
    const groups = Array.isArray(jobGroups) ? jobGroups : (jobGroups && jobGroups.name ? [jobGroups] : []);
    const children = groups.map((g,i) => ({ id:`${code}_g_${i+1}`, name:String(g.name||'Other'), value: Math.max(0, +g.share || 0), cat:String(g.name||'Other') }));
    return { name:'root', children: children.length? children : [{id:`${code}_g_0`, name:'No data', value:1, cat:'No data'}] };
  }

  async function updateDashboard(code){
    const summary = countriesIndex.get(code);
    if (!summary) return;
    document.getElementById('country-title').textContent = summary.country || code;
    const usageCount = summary.total_observations || 0;
    const usagePct = summary.usage_index ? pctFormat(summary.usage_index * 100)+'%' : '—';
    const usageCountEl = document.getElementById('usage-count');
    const usagePctEl = document.getElementById('usage-pct');
    if (usageCountEl) usageCountEl.textContent = String(usageCount);
    if (usagePctEl) usagePctEl.textContent = String(usagePct);

    const details = await loadCountryDetails(code);
    renderList(toTopicList(details.most_frequent_topics, code));
    renderTreemap(toTree(details.job_groups, code));
  }

  function pickInitial(codes){
    const scored = codes.map(c => ({ code:c, n:(countriesIndex.get(c)?.total_observations)||0 }));
    scored.sort((a,b)=> b.n - a.n);
    return (scored[0] && scored[0].n>0) ? scored[0].code : codes[0];
  }

  function onResize(){
    let rt;
    window.addEventListener('resize', ()=>{
      clearTimeout(rt);
      rt = setTimeout(()=>{
        const select = document.getElementById('country-select');
        if (!select || !select.value) return;
        updateDashboard(select.value);
      }, 120);
    });
  }

  async function init(){
    const res = await fetch('output/countries_all.json');
    const all = await res.json();
    all.forEach(row => { if (row && row.country_code) countriesIndex.set(String(row.country_code), row); });
    const codes = Array.from(countriesIndex.keys()).sort();

    const select = document.getElementById('country-select');
    select.innerHTML = '';
    codes.forEach(code => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = countriesIndex.get(code).country || code;
      select.appendChild(opt);
    });

    // URL-selected country takes precedence; support both ?country and ?code
    let initial = (getParam('country') || getParam('code') || '').toUpperCase();
    if (!codes.includes(initial)) initial = pickInitial(codes);
    select.value = initial;
    setParam('country', initial);

    select.addEventListener('change', e => {
      const code = e.target.value;
      setParam('country', code);
      updateDashboard(code);
    });

    // Popstate support (back/forward)
    window.addEventListener('popstate', () => {
      const code = (getParam('country') || getParam('code') || '').toUpperCase();
      if (codes.includes(code) && select.value !== code) {
        select.value = code;
        updateDashboard(code);
      }
    });

    await updateDashboard(initial);
    onResize();
  }

  init().catch(err => console.error('Failed to initialize countries dashboard', err));
})();
