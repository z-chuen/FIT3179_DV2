/**
 * Loads the 11 charts in index.html. Keep charts/ and data/ beside this file.
 * Open index.html through an HTTP preview or GitHub Pages.
 */
(() => {
  'use strict';

  const chartFiles = [
    '01_treemap.vega.json',
    '02_ratings_dotplot.vl.json',
    '03_price_rating_scatter.vl.json',
    '04_price_boxplot.vl.json',
    '05_ratings_heatmap.vl.json',
    '06_rating_counts_jitter.vl.json',
    '07_cleaner_unit_prices.vl.json',
    '08_advertised_price_slope.vl.json',
    '09_state_price_choropleth.vega.json',
    '10_state_price_spread_symbols.vega.json',
    '11_sampled_outlets_dotdensity.vega.json'
  ];

  const requiredColumns = {
    'shopee_household_2023.csv': [
      'product_id', 'title', 'product_category', 'source_category_group',
      'topic_group', 'price_actual', 'price_ori', 'item_rating',
      'total_rating', 'rating_count', 'w_date'
    ],
    'pricecatcher_household_oct2026.csv': ['date', 'premise_code', 'item_code', 'price'],
    'lookup_item.csv': ['item_code', 'item', 'unit'],
    'lookup_premise.csv': ['premise_code', 'premise', 'state'],
    'state_display_anchors.csv': ['state', 'longitude', 'latitude'],
    'map_display_points.csv': ['state', 'dot_index', 'longitude', 'latitude']
  };

  const localDataFiles = new Set([...Object.keys(requiredColumns), 'malaysia_states.geojson']);
  const checkedData = new Map();
  const controllers = [];
  window.chartViews = {};

  function showError(element, error) {
    const message = document.createElement('p');
    message.className = 'status error';
    message.setAttribute('role', 'alert');
    message.textContent = 'Chart could not load: ' + error.message;
    element.replaceChildren(message);
    element.setAttribute('aria-busy', 'false');
  }

  async function fetchFile(url) {
    let response;
    try {
      response = await fetch(url, {cache: 'no-cache'});
    } catch (error) {
      throw new Error('Could not fetch ' + url + '. Use an HTTP preview such as Live Server, or open the published GitHub Pages address.');
    }
    if (!response.ok) throw new Error(url + ' returned HTTP ' + response.status + '. Check its filename and folder.');
    return response;
  }

  // Older specs refer to this repository's raw data. Use the packaged copies
  // so that all charts read the same files and share the validation cache.
  function localiseDataURLs(node) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.url === 'string') {
      const match = node.url.match(/^https:\/\/raw\.githubusercontent\.com\/z-chuen\/FIT3179_DV2\/main\/data\/([^/?#]+)$/);
      if (match && localDataFiles.has(match[1])) node.url = 'data/' + match[1];
    }
    for (const value of Object.values(node)) localiseDataURLs(value);
  }

  function dataURLs(node, urls = new Set()) {
    if (!node || typeof node !== 'object') return urls;
    if (typeof node.url === 'string' && node.url.startsWith('data/')) urls.add(node.url);
    for (const value of Object.values(node)) dataURLs(value, urls);
    return urls;
  }

  function checkDataFile(url) {
    const absolute = new URL(url, document.baseURI).href;
    if (!checkedData.has(absolute)) {
      checkedData.set(absolute, (async () => {
        const text = await (await fetchFile(absolute)).text();
        if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(text)) {
          throw new Error(url + ' returned a webpage instead of data. Check its path.');
        }
        const name = new URL(absolute).pathname.split('/').pop();
        if (name.endsWith('.csv')) {
          const rows = vega.read(text, {type: 'csv'});
          if (!rows.length) throw new Error(url + ' contains no rows.');
          const columns = Object.keys(rows[0]);
          const missing = (requiredColumns[name] || []).filter(column => !columns.includes(column));
          if (missing.length) throw new Error(url + ' is missing columns: ' + missing.join(', ') + '. Use the matching prepared CSV.');
        } else if (name.endsWith('.geojson')) {
          const geo = JSON.parse(text);
          if (geo.type !== 'FeatureCollection' || !geo.features?.length) {
            throw new Error(url + ' does not contain map boundaries.');
          }
        }
        return text;
      })());
    }
    return checkedData.get(absolute);
  }

  function wrapText(text, width, fontSize = 11) {
    // Conservative text widths also keep labels readable when fonts differ.
    const limit = Math.max(18, Math.floor((width - 24) / (fontSize * 0.8)));
    const lines = [];
    let line = '';
    for (const word of String(text).split(/\s+/)) {
      if (line && (line + ' ' + word).length > limit) {
        lines.push(line);
        line = word;
      } else {
        line += (line ? ' ' : '') + word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function prepareSpec(original, file, width) {
    const spec = structuredClone(original);
    const isLite = /vega-lite/.test(spec.$schema || '');
    spec.width = width;
    spec.autosize = {...spec.autosize, resize: false};

    // The HTML card supplies the heading. Keep source dates and encoding keys
    // in one smaller block instead of repeating a second chart heading.
    let lines;
    if (/^(03|04)_/.test(file) && typeof spec.title?.text === 'string' && spec.title.text.startsWith('Shopee Malaysia | 2023')) {
      lines = [spec.title.text, ...(spec.title.subtitle || [])];
    } else {
      lines = spec.title?.subtitle || [];
    }
    if (typeof lines === 'string') lines = [lines];
    const heading = wrapText(lines[0] || '', width, 12);
    const notes = lines.slice(1).flatMap(line => wrapText(line, width));
    const titleRows = heading.length + notes.length;
    spec.title = {
      text: heading,
      subtitle: notes,
      anchor: 'start',
      ...(isLite ? {frame: 'bounds'} : {}),
      font: 'Arial', fontSize: 12, fontWeight: 'normal', lineHeight: 15,
      color: '#465467',
      subtitleFont: 'Arial', subtitleFontSize: 11, subtitleLineHeight: 14,
      subtitleColor: '#536174', subtitlePadding: 4, offset: 14
    };

    if (isLite) {
      spec.padding = {top: 12, left: 8, right: 12, bottom: 12};
      const legend = spec.encoding?.color?.legend;
      if (legend && legend.columns === 3) {
        legend.columns = {expr: 'width < 500 ? 1 : 3'};
        legend.direction = 'horizontal';
      }
      if (width < 500 && /^(02|05|07)_/.test(file)) {
        const axis = spec.encoding.y.axis;
        axis.labelFontSize = 11;
        axis.labelLimit = 125;
        axis.labelPadding = 8;
        axis.labelLineHeight = 15;
        if (file.startsWith('02_')) {
          spec.layer[0].encoding.x.title = ['Rating count', '(approx.)'];
          spec.encoding.color.legend.title = 'Product group';
          spec.encoding.color.legend.labelFontSize = 11;
          spec.encoding.color.legend.labelExpr = "datum.label === 'Cleaning supplies' ? 'Cleaning' : datum.label === 'Storage products' ? 'Storage' : 'Kitchen'";
        } else if (file.startsWith('05_')) {
          spec.layer[0].encoding.x.title = 'Listings (%)';
          spec.layer[0].encoding.color.legend.columns = 1;
          spec.layer[0].encoding.color.legend.direction = 'vertical';
        } else {
          spec.encoding.x.title = ['Median price', '(RM per litre)'];
          spec.encoding.x.axis.titleFontSize = 12;
          spec.layer[1].mark.fontSize = 13;
          spec.layer[1].mark.dx = -7;
        }
      }
      if (file.startsWith('07_')) spec.height = 360;
      if (file.startsWith('08_')) {
        // A short display key keeps the full listing titles in the tooltips.
        const labels = {
          '41544305.1108507216': '23 L water dispenser',
          '12924338.1459052465': '8 L drink dispenser',
          '12924338.4401154536': 'Buffet tray',
          '12924338.1834208755': '5-piece buffet set',
          '472316337.17534537672': '3-piece candy box set'
        };
        const expression = Object.entries(labels).reduceRight(
          (tail, [id, label]) => 'datum.product_id === ' + JSON.stringify(id) + ' ? ' + JSON.stringify(label) + ' : (' + tail + ')',
          "substring(datum.title,0,28)+'…'"
        );
        spec.transform.push({calculate: expression, as: 'display_title'});
        spec.encoding.color.field = 'display_title';
        spec.encoding.color.legend = {
          title: 'Selected listings', orient: 'top', columns: 1,
          labelFontSize: 11, labelLimit: Math.max(140, width - 90),
          titleFontSize: 11, rowPadding: 4, offset: 12
        };
        spec.encoding.x.axis.labelExpr = "datum.label === 'Advertised reference' ? ['Advertised', 'reference'] : ['Listed selling', 'price']";
        spec.encoding.x.axis.labelFontSize = 11;
        spec.encoding.x.axis.labelLineHeight = 14;
        spec.encoding.y.title = 'Price (RM)';
        spec.height = 520;
      }
      return spec;
    }

    const top = titleRows * 15 + 24;
    spec.padding = {...spec.padding, top, left: 12, right: 12};

    if (file.startsWith('01_')) {
      spec.height = width < 650 ? 620 : 540;
    }

    if (file.startsWith('06_')) {
      // Centre the grid and its key together, with a stacked key on phones.
      spec.padding.bottom = 12;
      const stacked = width - 24 < 650;
      const tile = Math.min((width - 40) / 10, 28);
      const plotHeight = stacked ? tile * 10 + 184 : tile * 10 + 48;
      spec.height = top + 12 + plotHeight;
      spec.signals.push({name: 'waffleLeft', update: 'width < 650 ? max(8,(width-10*tile)/2) : max(8,(width-560)/2)'});
      const [squares, swatches, labels, footnote] = spec.marks;
      squares.encode.update.x.signal = 'waffleLeft + (datum.cell%10)*tile';
      swatches.encode.update.x.signal = 'width < 650 ? 8 : waffleLeft+10*tile+32';
      labels.encode.update.x.signal = 'width < 650 ? 30 : waffleLeft+10*tile+54';
      labels.encode.update.limit.signal = 'width < 650 ? width-40 : min(226,width-waffleLeft-10*tile-62)';
      labels.encode.update.fontSize.value = 12;
      labels.encode.update.lineHeight = {value: 14};
      labels.encode.update.text.signal = "[datum.label, format(datum.n/datum.total,'.1%') + ' · ' + datum.n + ' listings']";
      footnote.encode.update.text.value = 'Rating counts are not verified sales.';
      footnote.encode.update.fontSize.value = 11;
      footnote.encode.update.text.value = wrapText('Rating counts are not verified sales.', width - 16);
      footnote.encode.update.lineHeight = {value: 14};
      footnote.encode.update.y.signal = 'height-' + (footnote.encode.update.text.value.length > 1 ? 22 : 8);
    }

    if (/^(09|10|11)_/.test(file)) {
      // All three maps retain the same geographic plotting area at each width.
      const innerHeight = width < 650 ? 240 : 330;
      const bottom = file.startsWith('11_') ? 12 : 75;
      spec.padding.bottom = bottom;
      spec.height = top + innerHeight + bottom;
      for (const legend of spec.legends || []) {
        legend.titleLimit = Math.max(180, width - 32);
        if (legend.gradientLength) legend.gradientLength = Math.min(260, width - 48);
        if (file.startsWith('09_')) legend.title = 'Median pack price (RM)';
        if (file.startsWith('10_')) {
          legend.title = 'Price spread (RM)';
          if (width < 500) {
            legend.columns = 2;
            legend.values = {signal: "domain('spreadSize')[1] > 0 ? [domain('spreadSize')[1]/2, domain('spreadSize')[1]] : [0]"};
            spec.scales.find(scale => scale.name === 'spreadSize').range = [0, 600];
          }
        }
      }
      const sampleNote = spec.marks.find(mark => mark.type === 'text');
      sampleNote.encode.update.text.signal = "width < 500 ? [replace(productLabel,' lavender',''), format(sampleOutlets,',')+' sampled outlets'] : productLabel+' | '+sampleOutlets+' sampled outlets | observed 12 Oct 2026'";
      sampleNote.encode.update.y.signal = 'height-(width < 500 ? 26 : 12)';
      sampleNote.encode.update.fontSize.value = 11;
      sampleNote.encode.update.lineHeight = {value: 14};
    }
    return spec;
  }

  function chartWidth(element) {
    return Math.max(1, Math.floor(element.clientWidth || element.parentElement?.clientWidth || 320));
  }

  function captureState(view, file) {
    if (!view) return {};
    if (/^(09|10|11)_/.test(file)) return {selectedItem: view.signal('selectedItem')};
    if (file.startsWith('03_')) return {
      highlight: view.data('groupHighlight_store').map(row => ({
        unit: row.unit,
        fields: row.fields.map(field => ({field: field.field, type: field.type})),
        values: Array.from(row.values)
      }))
    };
    return {};
  }

  async function initialiseChart(file, index) {
    const id = 'chart' + String(index + 1).padStart(2, '0');
    const element = document.getElementById(id);
    if (!element) return;
    try {
      const original = await (await fetchFile('charts/' + file)).json();
      localiseDataURLs(original);
      await Promise.all([...dataURLs(original)].map(checkDataFile));
      const loader = vega.loader();
      const defaultLoad = loader.load.bind(loader);
      loader.load = (uri, ...options) => checkedData.get(new URL(uri, document.baseURI).href) || defaultLoad(uri, ...options);

      let revision = 0;
      let renderedWidth = 0;
      let resizeTimer;
      async function render(width) {
        const current = ++revision;
        const state = captureState(window.chartViews[id], file);
        const host = document.createElement('div');
        host.className = 'chart-surface';
        const result = await vegaEmbed(host, prepareSpec(original, file, width), {
          renderer: 'svg', actions: false, loader
        });
        if (current !== revision) {
          result.view.finalize();
          return;
        }
        if (state.selectedItem !== undefined) result.view.signal('selectedItem', state.selectedItem);
        if (state.highlight) {
          result.view.change('groupHighlight_store', vega.changeset().remove(() => true).insert(state.highlight));
        }
        await result.view.runAsync();
        if (current !== revision) {
          result.view.finalize();
          return;
        }
        window.chartViews[id]?.finalize();
        element.replaceChildren(host);
        window.chartViews[id] = result.view;
        element.setAttribute('aria-busy', 'false');
        renderedWidth = width;
      }

      await render(chartWidth(element));
      const resize = () => {
        const width = chartWidth(element);
        if (Math.abs(width - renderedWidth) < 2) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          render(chartWidth(element)).catch(error => {
            console.error(file, error);
            showError(element, error);
          });
        }, 160);
      };
      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
      if (observer) observer.observe(element);
      else window.addEventListener('resize', resize, {passive: true});
      controllers.push({observer, resize, element});
    } catch (error) {
      console.error(file, error);
      showError(element, error);
    }
  }

  function initialiseCharts() {
    if (typeof window.vega === 'undefined' || typeof window.vegaLite === 'undefined' || typeof window.vegaEmbed !== 'function') {
      document.querySelectorAll('.chart').forEach(element => showError(element,
        new Error('Chart libraries could not load. Check your internet connection and refresh the page.')));
      return;
    }
    window.chartReady = Promise.all(chartFiles.map(initialiseChart));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseCharts, {once: true});
  } else {
    initialiseCharts();
  }
})();
