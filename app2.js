// CSV-powered dashboard wiring for index2.html
/* globals d3 */

const ISO = {
  US:'United States', AE:'United Arab Emirates', AD:'Andorra', AF:'Afghanistan', AL:'Albania', AM:'Armenia', AO:'Angola',
  AR:'Argentina', AT:'Austria', AU:'Australia', AZ:'Azerbaijan', BE:'Belgium', BG:'Bulgaria', BH:'Bahrain', BR:'Brazil',
  CA:'Canada', CH:'Switzerland', CL:'Chile', CN:'China', CO:'Colombia', CZ:'Czechia', DE:'Germany', DK:'Denmark',
  EE:'Estonia', EG:'Egypt', ES:'Spain', FI:'Finland', FR:'France', GB:'United Kingdom', GR:'Greece', HK:'Hong Kong',
  HU:'Hungary', ID:'Indonesia', IE:'Ireland', IL:'Israel', IN:'India', IQ:'Iraq', IR:'Iran', IT:'Italy', JP:'Japan',
  KE:'Kenya', KR:'South Korea', KW:'Kuwait', LB:'Lebanon', LT:'Lithuania', LU:'Luxembourg', LV:'Latvia', MA:'Morocco',
  MX:'Mexico', MY:'Malaysia', NG:'Nigeria', NL:'Netherlands', NO:'Norway', NZ:'New Zealand', OM:'Oman', PE:'Peru',
  PH:'Philippines', PK:'Pakistan', PL:'Poland', PS:'Palestine', PT:'Portugal', QA:'Qatar', RO:'Romania', RS:'Serbia',
  RU:'Russia', SA:'Saudi Arabia', SE:'Sweden', SG:'Singapore', SI:'Slovenia', SK:'Slovakia', TH:'Thailand', TN:'Tunisia',
  TR:'Turkey', TW:'Taiwan', UA:'Ukraine', UG:'Uganda', UY:'Uruguay', VE:'Venezuela', VN:'Vietnam', ZA:'South Africa'
};

const COUNTRY_DATA = new Map();
const countryName = code => ISO[code] || code;

const container = document.getElementById('treemap-wrap');
const svg = d3.select('#treemap-svg');
const g = svg.append('g').attr('class','tiles');
const pctFormat = d3.format('.1f');

let colorDomain = [];
const color = d3.scaleOrdinal().domain(colorDomain)
  .range(['#cde7f0','#e6acbe','#e8f7bf','#bcd7b4','#f5b7a6','#c8d3ff','#b3c7e6','#e9e0d3','#c7f0e6','#dbd7f0','#f2c28b','#d4d8f7','#f1d5e5','#c9eadf']);

const treemap = d3.treemap().paddingInner(6).round(true).tile(d3.treemapSquarify.ratio(1));
// Track previous layout for smooth FLIP-like transitions
let prevLayout = new Map();

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
  colorDomain = Array.from(new Set(root.leaves().map(d => d.data.cat))).sort();
  color.domain(colorDomain);
  return root.leaves().map(d => ({
    key: d.data.name,
    id: d.data.id,
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
  exiting.select('rect').transition().duration(220).attr('width',0).attr('height',0).style('opacity',0.01);
  exiting.transition().delay(220).remove();

  const enter = groups.enter().append('g').attr('class','tile-group');
  enter.append('rect')
    .attr('class','tile')
    .attr('rx',6)
    .attr('ry',6)
    .style('opacity',0.95)
    .each(function(d) {
      const r = newLayout.get(d.key);
      const r0 = prevLayout.get(d.key);
      const rect = d3.select(this);
      if (r0) {
        rect.attr('x', r0.x).attr('y', r0.y).attr('width', r0.w).attr('height', r0.h);
      } else {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        rect.attr('x', cx).attr('y', cy).attr('width', 0).attr('height', 0);
      }
      rect.style('fill', color(r.cat));
    });
  enter.append('text').attr('class','tile-label name').style('font-size','11px').style('opacity',0);
  enter.append('text').attr('class','tile-label pct').style('font-size','10px').style('opacity',0);

  const merged = enter.merge(groups);
  merged.each(function(d) {
    const node = d3.select(this);
    const r = newLayout.get(d.key);
    const tx = Math.max(r.x + 8, r.x + 4);
    const nameY = Math.min(r.y + 18, r.y + Math.max(16, r.h - 16));
    const pctY = Math.min(nameY + 16, r.y + r.h - 6);
    const pctText = `${pctFormat(r.pct * 100)}%`;

    const showBoth = r.w > 140 && r.h > 70;
    const showPctOnly = !showBoth && r.w > 80 && r.h > 40;
    const showPctTiny = !showBoth && !showPctOnly && r.w > 54 && r.h > 32;

    node.select('rect').transition().duration(620).ease(d3.easeCubicInOut)
      .attr('x', r.x).attr('y', r.y).attr('width', r.w).attr('height', r.h)
      .style('fill', color(r.cat));

    const nameLabel = node.select('text.tile-label.name');
    const pctLabel = node.select('text.tile-label.pct');

    if (showBoth) {
      nameLabel.text(r.name.length > 48 ? `${r.name.slice(0,45)}...` : r.name)
        .transition().duration(620).ease(d3.easeCubicInOut)
        .attr('x', tx).attr('y', nameY).style('opacity', 1).style('text-anchor','start');
      pctLabel.text(pctText)
        .transition().duration(620).ease(d3.easeCubicInOut)
        .attr('x', tx).attr('y', pctY).style('opacity', 0.9).style('text-anchor','start');
    } else if (showPctOnly) {
      nameLabel.transition().duration(400).style('opacity', 0);
      pctLabel.text(pctText)
        .transition().duration(620).ease(d3.easeCubicInOut)
        .attr('x', tx).attr('y', nameY).style('opacity', 0.95).style('text-anchor','start');
    } else if (showPctTiny) {
      nameLabel.transition().duration(400).style('opacity', 0);
      pctLabel.text(pctText)
        .transition().duration(620).ease(d3.easeCubicInOut)
        .attr('x', r.x + r.w / 2).attr('y', r.y + r.h / 2).style('opacity', 0.9).style('text-anchor','middle');
    } else {
      nameLabel.transition().duration(300).style('opacity', 0);
      pctLabel.transition().duration(300).style('opacity', 0);
    }
  });

  // Update prevLayout for next render and add slight stagger
  prevLayout = new Map();
  newLayout.forEach((v,k) => prevLayout.set(k, { x:v.x, y:v.y, w:v.w, h:v.h }));
  merged.transition().delay((d,i) => i * 6);
}

function updateDashboard(code) {
  const d = COUNTRY_DATA.get(code);
  if (!d) return;
  document.getElementById('country-title').textContent = d.meta.title;
  document.getElementById('usage-count').textContent = d.usage.count != null ? d.usage.count.toLocaleString() : '—';
  document.getElementById('usage-pct').textContent = d.usage.pct != null ? `${pctFormat(d.usage.pct)}%` : '—';
  renderList(d.topics);
  const facet = document.getElementById('facet-toggle').checked ? 'onet_task' : 'collaboration';
  renderTreemap(d.treeByFacet[facet]);
}

// Facet toggle and country selection
document.getElementById('facet-toggle').addEventListener('change', () => {
  const code = document.getElementById('country-select').value;
  if (code) updateDashboard(code);
});
document.getElementById('country-select').addEventListener('change', (e) => {
  updateDashboard(e.target.value);
});

let rt = null;
window.addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    const code = document.getElementById('country-select').value;
    if (code) {
      const d = COUNTRY_DATA.get(code);
      const facet = document.getElementById('facet-toggle').checked ? 'onet_task' : 'collaboration';
      renderTreemap(d.treeByFacet[facet]);
    }
  }, 120);
});

d3.csv('data.csv', d3.autoType).then(rows => {
  const byCode = d3.group(rows, d => d.geo_id);
  byCode.forEach((rows, code) => {
    const usageCountRow = rows.find(r => r.facet === 'country' && r.variable === 'usage_count');
    const usagePctRow = rows.find(r => r.facet === 'country' && r.variable === 'usage_pct');
    const usageCount = usageCountRow ? +usageCountRow.value : null;
    const usagePct = usagePctRow ? (+usagePctRow.value * 100) : null;

    const tasksPct = rows.filter(r => r.facet === 'onet_task' && r.variable === 'onet_task_pct' && r.cluster_name);
    tasksPct.sort((a,b) => (+b.value) - (+a.value));
    const topics = tasksPct.slice(0,5).map((r,i) => ({
      id: `task_${i}_${code}`,
      text: String(r.cluster_name),
      pct: `${d3.format('.1f')((+r.value)*100)}%`
    }));

    const collabCounts = rows.filter(r => r.facet === 'collaboration' && r.variable === 'collaboration_count' && r.cluster_name);
    const taskCounts = rows.filter(r => r.facet === 'onet_task' && r.variable === 'onet_task_count' && r.cluster_name);

    const collabChildren = collabCounts.map((r,i) => ({ id:`c_${i}_${code}`, name:String(r.cluster_name), value:+r.value, cat:String(r.cluster_name) }));
    const taskChildren = taskCounts.map((r,i) => ({ id:`t_${i}_${code}`, name:String(r.cluster_name), value:+r.value, cat:String(r.cluster_name) }));

    COUNTRY_DATA.set(code, {
      meta: { title: countryName(code), code },
      usage: { count: usageCount, pct: usagePct },
      topics,
      treeByFacet: {
        collaboration: { name:'root', children: collabChildren.length ? collabChildren : taskChildren },
        onet_task: { name:'root', children: taskChildren.length ? taskChildren : collabChildren }
      }
    });
  });

  const select = document.getElementById('country-select');
  const codes = Array.from(COUNTRY_DATA.keys()).sort();
  select.innerHTML = '';
  codes.forEach(code => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = countryName(code);
    select.appendChild(opt);
  });

  let initialCode = codes[0];
  const scored = codes.map(code => ({ code, count: (COUNTRY_DATA.get(code)?.usage?.count)||0 }));
  scored.sort((a,b) => b.count - a.count);
  if (scored.length && scored[0].count > 0) initialCode = scored[0].code;
  select.value = initialCode;
  updateDashboard(initialCode);
}).catch(err => { console.error('Failed to load CSV', err); });

// Fallback: if CSV did not populate select, inject minimal sample data
(function ensureSelectAndDefault(){
  const select = document.getElementById('country-select');
  if (!select) return;
  const hasOptions = select.options && select.options.length > 0;
  if (hasOptions) return;

  const fallback = {
    AE: {
      meta: { title: countryName('AE'), code:'AE' },
      usage: { count: 3011, pct: 31.218442001712815 },
      topics: [
        {id:'ae_t1', text:'Analyze user needs and software requirements...', pct:'0.9%'},
        {id:'ae_t2', text:'Assist students who need extra help...', pct:'0.8%'},
        {id:'ae_t3', text:'Conduct searches to find needed information', pct:'0.6%'}
      ],
      treeByFacet: {
        collaboration: { name:'root', children: [
          {id:'ae_c1', name:'directive', value:1200, cat:'directive'},
          {id:'ae_c2', name:'task iteration', value:755, cat:'task iteration'},
          {id:'ae_c3', name:'learning', value:504, cat:'learning'},
          {id:'ae_c4', name:'feedback loop', value:349, cat:'feedback loop'},
          {id:'ae_c5', name:'validation', value:128, cat:'validation'}
        ]},
        onet_task: { name:'root', children: [
          {id:'ae_o1', name:'Analyze user needs and software requirements...', value:26, cat:'Analyze user needs and software requirements...'},
          {id:'ae_o2', name:'Assist students who need extra help...', value:24, cat:'Assist students who need extra help...'},
          {id:'ae_o3', name:'Conduct searches to find needed information', value:18, cat:'Conduct searches to find needed information'}
        ]}
      }
    },
    AD: {
      meta: { title: countryName('AD'), code:'AD' },
      usage: { count: 40, pct: 0.4147252341642353 },
      topics: [
        {id:'ad_t1', text:'Task iteration', pct:'37.5%'},
        {id:'ad_t2', text:'Not classified', pct:'62.5%'}
      ],
      treeByFacet: {
        collaboration: { name:'root', children: [
          {id:'ad_c1', name:'task iteration', value:15, cat:'task iteration'},
          {id:'ad_c2', name:'none', value:10, cat:'none'}
        ]},
        onet_task: { name:'root', children: [
          {id:'ad_o1', name:'Conduct searches to find needed information', value:18, cat:'Conduct searches to find needed information'}
        ]}
      }
    }
  };

  Object.entries(fallback).forEach(([code, data]) => COUNTRY_DATA.set(code, data));

  const codes = Array.from(COUNTRY_DATA.keys()).sort();
  select.innerHTML = '';
  codes.forEach(code => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = countryName(code);
    select.appendChild(opt);
  });
  const initial = codes.includes('AE') ? 'AE' : codes[0];
  select.value = initial;
  updateDashboard(initial);
})();
