/**
 * visualisation.js
 * Loads all 11 Vega and Vega-Lite charts for index.html.
 * Keep this file beside index.html, with charts/ and data/ alongside it.
 * Open the page through Live Server or another HTTP server.
 */
(() => {
'use strict';

const chartFiles = [
  '01_treemap.vega.json','02_ratings_dotplot.vl.json','03_price_rating_scatter.vl.json',
  '04_price_boxplot.vl.json','05_ratings_heatmap.vl.json','06_rating_counts_waffle.vega.json',
  '07_cleaner_unit_prices.vl.json','08_advertised_price_slope.vl.json',
  '09_state_price_choropleth.vega.json','10_state_price_spread_symbols.vega.json','11_sampled_outlets_dotdensity.vega.json'
];
window.chartViews = {};
// Vega may report a CSV load failure only in the console and still draw axes.
// Validate each required data file before embedding, and reuse its fetched text.
const checkedData = new Map();
// Leave enough room for category labels on the Vega-Lite charts. On narrow
// screens these charts scroll horizontally instead of collapsing their plots.
function chartWidth(element, file) {
  const minimum = file.endsWith('.vl.json') ? 760 : 280;
  return Math.max(minimum, Math.floor(element.clientWidth));
}
const requiredColumns = {
  'shopee_household_2023.csv': ['product_id','title','product_category','source_category_group','topic_group','price_actual','price_ori','item_rating','total_rating','rating_count','w_date'],
  'pricecatcher_household_oct2026.csv': ['date','premise_code','item_code','price'],
  'lookup_item.csv': ['item_code','item','unit'],
  'lookup_premise.csv': ['premise_code','premise','state'],
  'state_display_anchors.csv': ['state','longitude','latitude'],
  'map_display_points.csv': ['state','dot_index','longitude','latitude']
};
async function fetchFile(url, options) {
  try {
    return await fetch(url, options);
  } catch(error) {
    throw new Error('Could not fetch '+url+': '+error.message+'. If this preview blocks local file requests, use an HTTP preview address or Live Server');
  }
}
function dataURLs(node, urls = new Set()) {
  if(!node || typeof node !== 'object')return urls;
  if(typeof node.url === 'string' && node.url.startsWith('data/'))urls.add(node.url);
  for(const value of Object.values(node))if(value && typeof value === 'object')dataURLs(value, urls);
  return urls;
}
function checkDataFile(url) {
  const absolute = new URL(url, document.baseURI).href;
  if(!checkedData.has(absolute))checkedData.set(absolute, (async()=>{
    const response = await fetchFile(absolute, {cache:'no-cache'});
    if(!response.ok)throw new Error('Missing data file: '+url+' (HTTP '+response.status+'). Copy the matching data folder from the supplied ZIP');
    const text = await response.text();
    if(/^\s*(?:<!doctype\s+html|<html\b)/i.test(text))throw new Error(url+' returned a webpage instead of data. Check the filename and folder path');
    if(url.endsWith('.csv')) {
      const rows = vega.read(text, {type:'csv'});
      if(!rows.length)throw new Error(url+' contains no data rows');
      const name = url.split('/').pop(), columns = Object.keys(rows[0]);
      const missing = (requiredColumns[name] || []).filter(column=>!columns.includes(column));
      if(missing.length)throw new Error(url+' has different columns. Missing: '+missing.join(', ')+'. Use the matching prepared CSV; renaming the original source CSV is not enough');
      if(name === 'shopee_household_2023.csv' && !rows.some(row=>Number(row.item_rating)>=1 && Number(row.item_rating)<=5 && row.topic_group))throw new Error(url+' has no usable household-rating rows');
    } else if(url.endsWith('.geojson')) {
      const geo = JSON.parse(text);
      if(geo.type !== 'FeatureCollection' || !geo.features?.length)throw new Error(url+' does not contain map boundary features');
    }
    return text;
  })());
  return checkedData.get(absolute);
}
async function loadChart(file, i) {
  const id='chart'+String(i+1).padStart(2,'0'),element=document.getElementById(id);
  element.innerHTML='<p class="status">Loading chart…</p>';
  try {
    const response=await fetchFile('charts/'+file);
    if(!response.ok)throw new Error('Could not load '+file);
    const spec=await response.json();
    await Promise.all([...dataURLs(spec)].map(checkDataFile));
    const loader = vega.loader(), defaultLoad = loader.load.bind(loader);
    loader.load = (uri, ...options)=>checkedData.get(new URL(uri, document.baseURI).href) || defaultLoad(uri, ...options);
    const width=chartWidth(element,file);
    spec.width=width;
    if(width<650 && spec.encoding?.color?.legend && spec.encoding.color.legend.columns===3) {
      spec.encoding.color.legend.columns=1;
      spec.encoding.color.legend.direction='vertical';
    }
    if(file.startsWith('06_'))spec.height=width<650?660:550;
    if(file.startsWith('01_')&&width<650)spec.height=620;
    if(file.match(/^(09|10|11)_/))spec.height=width<650?410:500;
    element.innerHTML='';
    const result=await vegaEmbed(element,spec,{renderer:'svg',actions:true,loader});
    window.chartViews[id]=result.view;
    element.style.overflowX='auto';
    const svg=element.querySelector('svg');
    if(svg)svg.style.maxWidth='none';
    let previous=width;
    if (typeof ResizeObserver === 'function') new ResizeObserver(async()=>{
      const next=chartWidth(element,file);
      if(next===previous)return;previous=next;
      try {
        result.view.width(next);
        if(file.startsWith('06_'))result.view.height(next<650?660:550);
        if(file.startsWith('01_'))result.view.height(next<650?620:540);
        if(file.match(/^(09|10|11)_/))result.view.height(next<650?410:500);
        await result.view.runAsync();
      } catch(e) { console.error(e); }
    }).observe(element);
  } catch(error) {
    element.innerHTML='<p class="status error"></p>';
    element.querySelector('p').textContent='Chart could not load: '+error.message;
    console.error(file,error);
  }
}
// Wait until the chart containers are available, including when this file is
// included in the document head with the defer attribute.
function initialiseCharts() {
  if (typeof window.vega === 'undefined' || typeof window.vegaEmbed !== 'function') {
    document.querySelectorAll('.chart').forEach(element => {
      const message = document.createElement('p');
      message.className = 'status error';
      message.textContent = 'Chart libraries could not load. Check your internet connection and reload the page.';
      element.replaceChildren(message);
    });
    return;
  }

  Promise.all(chartFiles.map(loadChart));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialiseCharts, { once: true });
} else {
  initialiseCharts();
}
})();
