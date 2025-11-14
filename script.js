// Treemap controller using states.json/countries.json with dropdowns for all entries
/* globals d3 */
(function(){
  const svg = d3.select('#treemap-svg');
  const g = svg.append('g');
  const wrap = document.getElementById('treemap-wrap');
  const modeSelect = document.getElementById('mode-select');
  const placeSelect = document.getElementById('place-select');
  const titleEl = document.getElementById('place-title');
  const topicList = d3.select('#topic-list');

  const DEFAULT_CATS = [
    'Computer and Mathematical','Arts, Design, Entertainment, Sports, and Media','Office and Administrative Support',
    'Educational Instruction and Library','Life, Physical, and Social','Community and Social Service','Sales and Related',
    'Farming, Fishing, and Forestry','Management','Business and Financial Operations','Architecture and Engineering',
    'Production','Legal','Healthcare Practitioners and Technical'
  ];
  let catDomain = [...DEFAULT_CATS, 'Other'];
  const color = d3.scaleOrdinal()
    .domain(catDomain)
    .range(['#60a5fa','#fca5a5','#fbd38d','#86efac','#fbb6ce','#c7d2fe','#93c5fd','#f5e0b7','#5eead4','#d8b4fe','#f6ad55','#a5b4fc','#f9a8d4','#99f6e4','#e5e7eb']);

  const pctFormat = d3.format('.1f');
  let width=0, height=0;
  let resizeTimer = null;
  function doResize(){ const r = wrap.getBoundingClientRect(); width = Math.round(r.width); height = Math.round(r.height); svg.attr('viewBox',`0 0 ${width} ${height}`); }
  function resize(){
    doResize();
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(()=>{ renderCurrent(); }, 80);
  }
  window.addEventListener('resize', resize); doResize();

  const state = { mode:'states', code:null, data:{states:null, countries:null} };
  // Preferred default selections when no URL code and no prior choice
  const DEFAULT_KEYS = { states: 'CA', countries: 'USA' };
  let suppressPush = false;
  let usedFallback = false;

  // Minimal built-in sample so the UI still works if fetch() fails
  const FALLBACK_STATES = [
    {
      state_code: 'CA', state: 'California', usage_index: 1, total_observations: 1000,
      most_frequent_topics: [
        { text: 'Provide educational tutoring and academic assistance across multiple subjects and disciplines', share: 12.7 },
        { text: 'Provide comprehensive software development assistance across multiple programming domains and technologies', share: 14.0 }
      ],
      job_groups: [
        { name: 'Computer and Mathematical', value: 33.3 },
        { name: 'Arts, Design, Entertainment, Sports, and Media', value: 12.6 },
        { name: 'Office and Administrative Support', value: 9.9 },
        { name: 'Educational Instruction and Library', value: 12.7 },
        { name: 'Life, Physical, and Social', value: 9.3 }
      ]
    },
    {
      state_code: 'NY', state: 'New York', usage_index: 0.82, total_observations: 800,
      most_frequent_topics: [
        { text: 'Provide educational tutoring and academic assistance across multiple subjects and disciplines', share: 10.4 },
        { text: 'Help edit, improve, and create professional written documents and communications', share: 8.2 }
      ],
      job_groups: [
        { name: 'Computer and Mathematical', value: 28.0 },
        { name: 'Business and Financial Operations', value: 8.0 },
        { name: 'Arts, Design, Entertainment, Sports, and Media', value: 10.0 },
        { name: 'Management', value: 6.0 },
        { name: 'Office and Administrative Support', value: 7.5 }
      ]
    }
  ];

  const FALLBACK_COUNTRIES = [
    {
      country_code: 'USA', country: 'United States', usage_index: 1.0, total_observations: 10000,
      most_frequent_topics: [
        { text: 'Provide comprehensive software development assistance across multiple programming domains and technologies', share: 15.0 },
        { text: 'Provide educational tutoring and academic assistance across multiple subjects and disciplines', share: 13.0 }
      ],
      job_groups: [
        { name: 'Computer and Mathematical', value: 32.0 },
        { name: 'Educational Instruction and Library', value: 12.0 },
        { name: 'Arts, Design, Entertainment, Sports, and Media', value: 12.0 },
        { name: 'Office and Administrative Support', value: 10.0 }
      ]
    },
    {
      country_code: 'IND', country: 'India', usage_index: 0.9, total_observations: 9000,
      most_frequent_topics: [
        { text: 'Provide comprehensive software development assistance across multiple programming domains and technologies', share: 18.0 },
        { text: 'Provide technical IT support and troubleshooting assistance', share: 9.0 }
      ],
      job_groups: [
        { name: 'Computer and Mathematical', value: 36.0 },
        { name: 'Business and Financial Operations', value: 6.0 },
        { name: 'Management', value: 5.0 },
        { name: 'Office and Administrative Support', value: 7.0 }
      ]
    }
  ];

  async function fetchFirst(paths){
    for (const p of paths) {
      try { const r = await fetch(p); if (r.ok) return await r.json(); } catch {}
    }
    return [];
  }

  function normalizeTopic(t){
    const text = t?.text ?? String(t ?? '');
    const pctRaw = typeof t?.share === 'number' ? t.share : (typeof t?.pct === 'string' ? parseFloat(t.pct) : null);
    const pct = pctRaw != null && !Number.isNaN(pctRaw) ? `${pctRaw.toFixed(1)}%` : '';
    return { id: t?.id || text, text, pct };
  }

  function normalizeTopicValue(t){
    if (!t) return null;
    const name = t.text || String(t);
    const value = typeof t.share === 'number' ? t.share : (typeof t.value === 'number' ? t.value : null);
    if (value == null || Number.isNaN(value)) return null;
    return { name, value };
  }

  function normalizeTopicsList(x){
    if (Array.isArray(x)) return x.filter(Boolean);
    if (x && typeof x === 'object' && ('text' in x || 'share' in x || 'value' in x)) return [x];
    return [];
  }

  function normalizeGroups(jg){
    if (Array.isArray(jg)) {
      return jg.filter(Boolean).map(g => ({ name: g.name || String(g), value: typeof g.share === 'number' ? g.share : (g.value || 0) }));
    } else if (jg && typeof jg === 'object' && jg.name) {
      return [{ name: jg.name, value: typeof jg.share === 'number' ? jg.share : (jg.value || 0) }];
    }
    return [];
  }

  function toBankFromArray(arr, mode, domain){
    const bank = {};
    (arr || []).forEach(row => {
      const name = mode==='states' ? (row.state || row.name) : (row.country || row.name);
      const code = mode==='states' ? (row.state_code || row.code || name) : (row.country_code || row.code || name);
      const topicsRaw = normalizeTopicsList(row.most_frequent_topics);
      const topics = topicsRaw.map(normalizeTopic);
      const topicsForTree = topicsRaw.map(normalizeTopicValue).filter(Boolean);
      const groups = normalizeGroups(row.job_groups);
      const usageValue = Math.max(0.0001, (typeof row.usage_index === 'number' ? row.usage_index : 0) || (row.total_observations || 0.0001));
      const valuesByCat = Object.create(null);
      if (groups.length >= 2) {
        groups.forEach(g => { const k = g.name; valuesByCat[k] = (valuesByCat[k]||0) + (typeof g.value === 'number' ? g.value : 0); });
      } else if (topicsForTree.length >= 2) {
        const sum = topicsForTree.reduce((s,t)=> s + (typeof t.value === 'number' ? t.value : 0), 0);
        valuesByCat['Other'] = sum;
      } else {
        valuesByCat['Other'] = usageValue;
      }
      const children = domain.map(cat => ({ name: cat, cat, value: (typeof valuesByCat[cat] === 'number' ? valuesByCat[cat] : 0) }));
      const tree = { name: 'root', children };
      bank[String(code).toUpperCase()] = { meta: { title: name, code: String(code).toUpperCase() }, topics, tree, _raw: row };
    });
    return bank;
  }

  async function loadData(){
    let [statesRaw, countriesRaw] = await Promise.all([
      // Prefer the larger "_all" files, fall back to the smaller ones
      fetchFirst(['states_all.json']),
      fetchFirst(['countries_all.json'])
    ]);
    if ((!Array.isArray(statesRaw) || statesRaw.length === 0) && (!Array.isArray(countriesRaw) || countriesRaw.length === 0)) {
      // Likely opened with file:// — use small built-in sample
      usedFallback = true;
      statesRaw = FALLBACK_STATES;
      countriesRaw = FALLBACK_COUNTRIES;
    }
    // compute domain union from job_groups across datasets
    const seen = new Set(DEFAULT_CATS);
    function collect(arr){
      const list = Array.isArray(arr) ? arr : [];
      list.forEach(r=>{
        const jg = r?.job_groups;
        if (Array.isArray(jg)) jg.forEach(g=>{ if(g && g.name) seen.add(g.name); });
        else if (jg && typeof jg === 'object' && jg.name) seen.add(jg.name);
      });
    }
    collect(statesRaw); collect(countriesRaw); seen.add('Other');
    catDomain = Array.from(seen);
    color.domain(catDomain);

    state.data.states = Array.isArray(statesRaw) ? toBankFromArray(statesRaw,'states', catDomain) : toBankFromArray([], 'states', catDomain);
    state.data.countries = Array.isArray(countriesRaw) ? toBankFromArray(countriesRaw,'countries', catDomain) : toBankFromArray([], 'countries', catDomain);

    // Initial/restore from URL
    const params = new URLSearchParams(location.search);
    const mode = params.get('mode'); const code = params.get('code');
    if(mode && ['states','countries'].includes(mode)) state.mode = mode;
    if(code) state.code = code.toUpperCase();

    initControls();
    modeSelect.value = state.mode;
    if(state.code && placeSelect.querySelector(`option[value="${state.code}"]`)) {
      placeSelect.value = state.code;
    } else {
      state.code = placeSelect.value;
    }

    // Replace initial state so Back/Forward works predictably
    replaceState();
    if (usedFallback) showFallbackNotice();
    renderCurrent();
  }

  function showFallbackNotice(){
    const box = document.createElement('div');
    box.setAttribute('role','status');
    box.style.marginTop = '8px';
    box.style.padding = '10px 12px';
    box.style.border = '1px solid #e3dfd6';
    box.style.borderRadius = '8px';
    box.style.background = '#fff8e1';
    box.style.color = '#6b5e00';
    box.style.fontSize = '12px';
    box.innerHTML = 'Loaded sample data because the app could not fetch states.json/countries.json. Please run a local server (e.g., <code>python -m http.server</code>) and open <code>http://localhost:8000</code> to see the full dataset.';
    const leftPanel = document.querySelector('.panel.left');
    if (leftPanel) leftPanel.appendChild(box);
  }

  function initControls(){
    const bank = state.mode==='states' ? state.data.states : state.data.countries;
    placeSelect.innerHTML = '';
    const entries = Object.entries(bank).sort((a,b)=>{
      const an = a[1].meta?.title || a[0]; const bn = b[1].meta?.title || b[0];
      return an.localeCompare(bn);
    });
    for (const [k, v] of entries) {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = v.meta?.title || k;
      placeSelect.appendChild(opt);
    }
    // Default to last selection for this mode if available
    const lastKey = localStorage.getItem(`last_${state.mode}_key`);
    const firstKey = entries.length ? entries[0][0] : '';
    const explicit = DEFAULT_KEYS[state.mode];
    const preferred = (explicit && bank[explicit]) ? explicit : firstKey;
    state.code = state.code || lastKey || preferred;
    if (state.code && bank[state.code]) {
      placeSelect.value = state.code;
    } else if (preferred) {
      state.code = preferred;
      placeSelect.value = preferred;
    }
  }

  modeSelect.addEventListener('change', ()=>{
    state.mode = modeSelect.value;
    state.code = null; // reset entity when mode changes
    initControls();
    persistState();
    renderCurrent();
  });
  placeSelect.addEventListener('change', ()=>{
    state.code = placeSelect.value;
    persistState();
    localStorage.setItem(`last_${state.mode}_key`, state.code);
    renderCurrent();
  });

  function replaceState(){
    const url = new URL(location.href);
    url.searchParams.set('mode', state.mode);
    url.searchParams.set('code', state.code||'');
    history.replaceState({mode:state.mode,code:state.code}, '', url);
  }
  function persistState(){
    if (suppressPush) return;
    const url = new URL(location.href);
    url.searchParams.set('mode', state.mode);
    url.searchParams.set('code', state.code||'');
    history.pushState({mode:state.mode,code:state.code}, '', url);
  }
  window.addEventListener('popstate', (evt)=>{
    const s = evt.state; if(!s) return;
    suppressPush = true;
    state.mode = s.mode || state.mode; state.code = (s.code || state.code || '').toUpperCase();
    modeSelect.value = state.mode;
    initControls();
    if(state.code) placeSelect.value = state.code;
    renderCurrent();
    suppressPush = false;
  });

  function renderCurrent(){
    const bank = state.mode==='states' ? state.data.states : state.data.countries;
    if (!bank) return;
    const entry = bank[state.code]; if(!entry) return;
    titleEl.textContent = entry.meta?.title || state.code;
    renderTopics(entry.topics||[]);
    renderTreemap(entry.tree);
  }

  function renderTopics(list){
    const items = topicList.selectAll('li.topic').data(list, d=>d.id||d.text);
    items.exit().remove();
    const enter = items.enter().append('li').attr('class','topic').style('opacity',0);
    enter.append('div').attr('class','title');
    enter.append('div').attr('class','pct');
    const merged = enter.merge(items);
    merged.select('.title').text(d => d.text);
    merged.select('.pct').text(d => d.pct || '');
    enter.transition().duration(320).style('opacity',1);
  }

  const prevByKey = Object.create(null);
  function renderTreemap(rootData){
    const root = d3.hierarchy(rootData).sum(d=>Math.max(0, +d.value || 0));
    d3.treemap().size([width,height]).padding(6).round(true)(root);
    const total = root.value || 1;
    const nodes = root.leaves();
    const tiles = g.selectAll('g.tile').data(nodes, d=>d.data.name);
    const tilesEnter = tiles.enter().append('g').attr('class','tile');
    tilesEnter.append('rect');
    tilesEnter.append('text').attr('class','label');
    const all = tilesEnter.merge(tiles);
    // FLIP: start from previous position and size
    all.each(function(d){
      const k = d.data.name; const prev = prevByKey[k];
      const sel = d3.select(this);
      if (prev) {
        sel.attr('transform',`translate(${prev.x},${prev.y})`);
        sel.select('rect').attr('width', prev.w).attr('height', prev.h);
      } else {
        sel.attr('transform',`translate(${d.x0},${d.y0})`);
        sel.select('rect').attr('width', 0).attr('height', 0);
      }
    });
    // Animate to new position/size
    all.transition().duration(650).ease(d3.easeCubicInOut)
      .attr('transform', d=>`translate(${d.x0},${d.y0})`);

    all.select('rect').transition().duration(650).ease(d3.easeCubicInOut)
      .attr('width', d=>Math.max(0,d.x1-d.x0))
      .attr('height', d=>Math.max(0,d.y1-d.y0))
      .attr('rx',6).attr('ry',6)
      .attr('fill', d=>color(d.data.cat || d.data.name));

    // Labels with percent
    all.select('text')
      .attr('x', 8).attr('y', 16)
      .each(function(d){
        const w = d.x1-d.x0, h = d.y1-d.y0; const show = w>90 && h>34;
        const t = d3.select(this); t.selectAll('*').remove();
        if (!show) { t.text(''); return; }
        const name = d.data.name.length>28? d.data.name.slice(0,27)+'…' : d.data.name;
        const pct = pctFormat((d.value/total)*100) + '%';
        t.append('tspan').text(name);
        t.append('tspan').attr('x',8).attr('dy','1.2em').attr('class','pct').text(pct);
      });

    // Save positions for next frame
    all.each(function(d){ prevByKey[d.data.name] = { x:d.x0, y:d.y0, w:Math.max(0,d.x1-d.x0), h:Math.max(0,d.y1-d.y0) }; });

    // Shrink exits (no fade toggle)
    tiles.exit().each(function(d){ delete prevByKey[d.data.name]; })
      .select('rect').transition().duration(420).ease(d3.easeCubicInOut)
      .attr('width', 0).attr('height', 0)
      .on('end', function(){ d3.select(this.parentNode).remove(); });

    // Legend removed per request; treemap uses full panel height

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
    function showTip(evt, d){
      const pct = ((d.value/total)*100);
      tip.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${d.data.name}</div>`+
        `<div>${d.data.cat||''}</div>`+
        `<div style=\"opacity:.9\">Share: ${pctFormat(pct)}%</div>`;
      tip.style.left = (evt.clientX + 12) + 'px';
      tip.style.top = (evt.clientY + 12) + 'px';
      tip.style.display = 'block';
    }
    function hideTip(){ tip.style.display = 'none'; }

    all.on('mousemove', (evt,d)=>showTip(evt,d))
       .on('mouseenter', (evt,d)=>showTip(evt,d))
       .on('mouseleave', hideTip);
  }

  loadData();
})();
