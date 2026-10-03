/* Lógica de la página: dibuja gráficos (Plotly) y tablas a partir de window.DATA (generado por analysis.py). */
const D = window.DATA;
const TIPOS = ["Gas", "Eléctrica", "Otros"];
const ZONAS = Object.keys(D.zonas);
const CONS = { Consumo_gas: "Gas", Consumo_electricidad: "Electricidad", Consumo_total: "Total" };
const NOMBRE = {
  Superficie_vivienda: "Superficie (m²)", Antiguedad: "Antigüedad (años)", Consumo_gas: "Consumo de gas (kWh)",
  Temp_invierno: "Temp. invierno (°C)", Temp_primavera: "Temp. primavera (°C)", Temp_verano: "Temp. verano (°C)",
  Temp_otono: "Temp. otoño (°C)", Consumo_electricidad: "Consumo electricidad (kWh)", Consumo_total: "Consumo total (kWh)",
};
const COEF = (v) => ({
  Intercept: "Base (intercepto)",
  "C(Tipo_calefaccion, Treatment('Eléctrica'))[T.Gas]": "Calefacción = Gas (vs. Eléctrica)",
  "C(Tipo_calefaccion, Treatment('Eléctrica'))[T.Otros]": "Calefacción = Otros (vs. Eléctrica)",
  "np.log(Superficie_vivienda)": "log(Superficie)",
}[v] || NOMBRE[v] || v);

/* ---------- utilidades ---------- */
const nf = (x, d = 0) => x == null ? "—" : Number(x).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" });
const pf = (p) => p < 0.001 ? "< 0,001" : nf(p, 3);
const $ = (id) => document.getElementById(id);
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const tipoColor = (t) => css({ Gas: "--s-gas", "Eléctrica": "--s-elec", Otros: "--s-otros" }[t]);
const sig = (p) => p < 0.05 ? '<span class="pill ok">Significativa</span>' : '<span class="pill no">No significativa</span>';

function table(el, head, rows, cls = []) {
  const h = "<thead><tr>" + head.map((x) => `<th>${x}</th>`).join("") + "</tr></thead>";
  const b = "<tbody>" + rows.map((r, i) => `<tr class="${cls[i] || ""}">` + r.map((x) => `<td>${x}</td>`).join("") + "</tr>").join("") + "</tbody>";
  const t = typeof el === "string" ? $(el) : el;
  if (t.tagName === "TABLE") t.innerHTML = h + b; else t.innerHTML = `<table>${h}${b}</table>`;
}

function layout(extra = {}) {
  const ink2 = css("--ink-2"), grid = css("--grid"), axis = css("--axis");
  const ax = { gridcolor: grid, linecolor: axis, zerolinecolor: axis, tickfont: { color: ink2, size: 12 }, title: { font: { color: ink2, size: 13 } }, automargin: true };
  const L = {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "system-ui, -apple-system, Segoe UI, sans-serif", color: css("--ink") },
    margin: { l: 56, r: 16, t: 16, b: 48 },
    hoverlabel: { bgcolor: css("--surface"), bordercolor: css("--axis"), font: { color: css("--ink") } },
    legend: { orientation: "h", y: 1.08, x: 0, font: { color: ink2 } },
    separators: ",.",
  };
  const out = { ...L, ...extra };
  out.xaxis = { ...ax, ...(extra.xaxis || {}) };
  out.yaxis = { ...ax, ...(extra.yaxis || {}) };
  return out;
}
const CFG = { displayModeBar: false, responsive: true };
const plot = (id, data, lay) => Plotly.react(id, data, layout(lay), CFG);

function toggles(el, options, initial, onChange) {
  const box = $(el); box.innerHTML = "";
  let cur = initial;
  options.forEach(([val, label]) => {
    const b = document.createElement("button");
    b.textContent = label; b.className = val === cur ? "on" : "";
    b.onclick = () => { cur = val; [...box.children].forEach((c) => c.classList.toggle("on", c === b)); onChange(val); };
    box.appendChild(b);
  });
  return () => cur;
}

/* ---------- 0. Datos ---------- */
function renderData() {
  $("dataTiles").innerHTML = [
    ["Hogares", nf(D.n), "filas del archivo"],
    ["Municipios", D.n_municipios, "en 5 zonas climáticas"],
    ["Datos vacíos", D.nulos, `${D.duplicados} hogares repetidos`],
    ["Calefacción", TIPOS.map((t) => `<span class="swatch" style="background:${tipoColor(t)}"></span>${t} ${nf(D.tipos_n[t])}`).join("<br>"), ""],
  ].map(([l, v, n]) => `<div class="tile"><div class="lbl">${l}</div><div class="val" style="${String(v).length > 10 ? "font-size:14px;font-weight:500;line-height:1.7" : ""}">${v}</div><div class="note">${n}</div></div>`).join("");
  table("tblZonas", ["Zona climática", "Hogares", "T. invierno media", "T. verano media", "Municipios"],
    ZONAS.map((z) => [z, nf(D.zonas[z].n), nf(D.zonas[z].t_inv, 1) + " °C", nf(D.zonas[z].t_ver, 1) + " °C",
      `<span style="white-space:normal;display:block;text-align:left;min-width:260px">${D.zonas[z].municipios.join(", ")}</span>`]));
}

/* ---------- 1. Descriptiva ---------- */
function renderDesc() {
  const V = ["Superficie_vivienda", "Antiguedad", "Consumo_gas"];
  const U = { Superficie_vivienda: " m²", Antiguedad: " años", Consumo_gas: " kWh" };
  const rows = [
    ["Media", (d) => nf(d.media, 1)], ["Mediana (P50)", (d) => nf(d.mediana, 1)],
    ["Moda exacta*", (d) => `${nf(d.moda, 1)} <span class="muted">(${d.moda_veces} veces)</span>`],
    ["Moda por intervalos*", (d) => `${nf(d.moda_intervalo[0], 0)} – ${nf(d.moda_intervalo[1], 0)}`],
    ["Varianza", (d) => nf(d.varianza, 1)], ["Desviación estándar", (d) => nf(d.desv, 1)],
    ["Coef. de variación", (d) => nf(d.cv, 1) + " %"],
    ["Percentil 25", (d) => nf(d.p25, 1)], ["Percentil 50", (d) => nf(d.p50, 1)], ["Percentil 75", (d) => nf(d.p75, 1)],
    ["Rango intercuartílico", (d) => nf(d.iqr, 1)], ["Mínimo – Máximo", (d) => `${nf(d.min, 0)} – ${nf(d.max, 0)}`],
    ["Asimetría", (d) => nf(d.asimetria, 2)], ["Atípicos (regla 1,5·IQR)", (d) => nf(d.atipicos)],
  ];
  table("tblDesc", ["Medida", ...V.map((v) => NOMBRE[v])], rows.map(([n, f]) => [n, ...V.map((v) => f(D.desc[v]))]));

  const texts = {
    Superficie_vivienda: `<div class="k-title">🔎 Superficie: muchas casas medianas y pocas muy grandes</div>
      La torre más alta está entre 70 y 90 m², y hay una <b>cola larga hacia la derecha</b> que llega hasta 250 m²
      (asimetría = ${nf(D.desc.Superficie_vivienda.asimetria, 2)}). Por eso <b>la media (${nf(D.desc.Superficie_vivienda.media, 1)}) es mayor que la mediana (${nf(D.desc.Superficie_vivienda.mediana, 1)})</b>:
      las casas grandes "tiran" de la media hacia arriba. La mitad central de las casas mide entre 70 y 116 m² (IQR = 46 m²).
      Los ${nf(D.desc.Superficie_vivienda.atipicos)} atípicos son casas grandes, no errores.`,
    Antiguedad: `<div class="k-title">🔎 Antigüedad: reparto casi plano</div>
      Hay más o menos <b>la misma cantidad de casas de cada edad</b>, de 1 a 73 años: el histograma parece una mesa y no una campana.
      Media (${nf(D.desc.Antiguedad.media, 1)}) y mediana (${nf(D.desc.Antiguedad.mediana, 0)}) son casi iguales, así que es <b>simétrica</b> (asimetría ≈ 0) y <b>no tiene atípicos</b>.
      La moda (40 años, ${D.desc.Antiguedad.moda_veces} casas) apenas destaca: en una distribución plana la moda dice poco.
      El coeficiente de variación es alto (${nf(D.desc.Antiguedad.cv, 0)} %) porque hay casas de todas las edades.`,
    Consumo_gas: `<div class="k-title">🔎 Gas: ¡son dos grupos mezclados!</div>
      Muy asimétrica a la derecha (asimetría = ${nf(D.desc.Consumo_gas.asimetria, 2)}). La media (${nf(D.desc.Consumo_gas.media)}) queda muy por encima de la mediana (${nf(D.desc.Consumo_gas.mediana)}) y es la variable
      <b>más dispersa</b> (CV = ${nf(D.desc.Consumo_gas.cv, 0)} %). Si separamos por tipo de calefacción (botón de arriba) se ve el secreto:
      <b>hay una montaña alta y estrecha en ~3 000 kWh</b>, los hogares sin calefacción de gas que solo lo usan para cocinar y el agua caliente,
      y <b>una montaña baja y ancha alrededor de 9 000 kWh</b>, los que calientan la casa con gas. Por eso la media global no representa bien a ningún grupo.`,
  };
  let split = false;
  let cur = "Superficie_vivienda";
  const draw = () => {
    const h = D.hist[cur], d = D.desc[cur];
    const x = h.counts.map((_, i) => (h.edges[i] + h.edges[i + 1]) / 2);
    const w = h.edges[1] - h.edges[0];
    let traces;
    if (split && cur === "Consumo_gas") {
      traces = TIPOS.map((t) => ({ type: "bar", name: t, x, y: D.hist_gas_tipo[t], width: w * 0.92, marker: { color: tipoColor(t) },
        hovertemplate: `${t}<br>%{x:,.0f} kWh: %{y} hogares<extra></extra>` }));
    } else {
      traces = [{ type: "bar", x, y: h.counts, width: w * 0.92, marker: { color: css("--s-one") }, showlegend: false,
        hovertemplate: `${nf(0) && ""}%{x:,.1f}${U[cur]}<br>%{y} hogares<extra></extra>` }];
    }
    const ymax = Math.max(...h.counts);
    const vline = (v, label, dash) => ({ type: "line", x0: v, x1: v, y0: 0, y1: ymax * 1.05, line: { color: css("--ink"), width: 2, dash } });
    plot("chHist", traces, {
      barmode: "stack", bargap: 0,
      xaxis: { title: { text: NOMBRE[cur] } }, yaxis: { title: { text: "Nº de hogares" } },
      shapes: [vline(d.media, "Media", "solid"), vline(d.mediana, "Mediana", "dot")], margin: { l: 56, r: 16, t: 32, b: 48 },
      annotations: [
        { x: d.media, y: ymax * 1.05, text: ` Media ${nf(d.media, 0)}`, showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 12, color: css("--ink-2") } },
        { x: d.mediana, y: ymax * 1.05, text: `Mediana ${nf(d.mediana, 0)} `, showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 12, color: css("--ink-2") } },
      ],
    });
    $("histText").innerHTML = texts[cur];
  };
  const ctl = $("histCtl");
  ctl.innerHTML = '<span class="lbl">Variable:</span><span id="histVar"></span><button id="splitBtn" style="margin-left:8px">Separar el gas por calefacción</button>';
  toggles("histVar", [["Superficie_vivienda", "Superficie"], ["Antiguedad", "Antigüedad"], ["Consumo_gas", "Consumo de gas"]], cur, (v) => {
    cur = v; $("splitBtn").style.display = v === "Consumo_gas" ? "" : "none"; draw();
  });
  $("splitBtn").style.display = "none";
  $("splitBtn").onclick = () => { split = !split; $("splitBtn").classList.toggle("on", split); draw(); };
  draw();
  window.__redraw.push(draw);
}

function renderBox() {
  let v = "Consumo_gas", g = "tipo";
  const texts = {
    tipo: () => `<div class="k-title">🔎 Por tipo de calefacción</div>
      <ul class="tight">
      <li><b>Gas:</b> los hogares con calefacción de gas tienen la caja <b>mucho más alta y ancha</b> (mediana ${nf(D.box_tipo.Consumo_gas.Gas.median)} kWh)
        que Eléctrica (${nf(D.box_tipo.Consumo_gas["Eléctrica"].median)}) y Otros (${nf(D.box_tipo.Consumo_gas.Otros.median)}). Estos dos últimos son <b>prácticamente iguales</b>: solo usan gas para cocinar y el agua caliente.</li>
      <li><b>Electricidad:</b> es la imagen al revés. Los hogares con calefacción eléctrica gastan ~2,2 veces más luz (mediana ${nf(D.box_tipo.Consumo_electricidad["Eléctrica"].median)}).</li>
      <li><b>Total:</b> Gas &gt; Eléctrica &gt; Otros. "Otros" (leña, pellets, gasoil…) consume menos en el total porque esa energía <b>no se mide</b> en luz ni en gas.</li>
      <li>Los grupos con valores más altos también tienen cajas más anchas: <b>a mayor consumo, mayor variabilidad</b>. Lo veremos otra vez en la regresión.</li>
      </ul>`,
    zona: () => `<div class="k-title">🔎 Por zona climática</div>
      <ul class="tight">
      <li><b>Gas:</b> las diferencias entre zonas son <b>pequeñas</b> comparadas con las del tipo de calefacción.
        El Interior continental (inviernos más fríos) gasta algo más y el Sur y el Mediterráneo algo menos.</li>
      <li><b>Electricidad:</b> aquí sí cambia mucho. El <b>Sur</b> (veranos de 28 a 38 °C) gasta mucha más luz, por el aire acondicionado ❄️,
        y el <b>Norte atlántico</b> (veranos frescos) es el que menos gasta.</li>
      <li>Conclusión: <b>el frío del invierno empuja el gas y el calor del verano empuja la electricidad</b>.</li>
      </ul>`,
    mun: () => `<div class="k-title">🔎 Por municipio (ordenados de invierno más frío a más templado)</div>
      Con 43 cajas cuesta ver un patrón, y por eso agrupar en zonas ayuda. Aun así se nota una ligera <b>bajada del consumo de gas hacia la derecha</b>, donde los inviernos son más templados.
      Las cajas de las ciudades pequeñas, como Salamanca, León o Tarragona, tienen menos hogares y por eso sus medianas "bailan" más.`,
  };
  const draw = () => {
    let src, keys, colors;
    if (g === "tipo") { src = D.box_tipo[v]; keys = TIPOS; colors = keys.map(tipoColor); }
    else if (g === "zona") { src = D.box_zona[v]; keys = ZONAS; colors = keys.map(() => css("--s-one")); }
    else { src = D.box_mun_gas; keys = D.municipios.map((m) => m.Municipio); colors = keys.map(() => css("--s-one")); }
    const traces = keys.map((k, i) => {
      const s = src[k];
      return { type: "box", name: k, x: [k], q1: [s.q1], median: [s.median], q3: [s.q3], lowerfence: [s.lowerfence], upperfence: [s.upperfence],
        mean: [s.mean], boxmean: true, marker: { color: colors[i] }, line: { width: 1.5, color: colors[i] }, fillcolor: colors[i] + "55",
        hoverinfo: "y", showlegend: false };
    });
    plot("chBox", traces, {
      xaxis: { tickangle: g === "mun" ? -60 : 0, type: "category" },
      yaxis: { title: { text: g === "mun" ? "Consumo de gas (kWh)" : NOMBRE[v] }, rangemode: "tozero" },
      margin: { l: 64, r: 16, t: 16, b: g === "mun" ? 120 : 48 },
    });
    $("boxText").innerHTML = texts[g]() + (g === "mun" ? "" : '<p class="small muted">Línea discontinua dentro de la caja = media. Los atípicos no se dibujan uno por uno.</p>');
    $("boxVar").style.opacity = g === "mun" ? .4 : 1;
  };
  toggles("boxVar", Object.entries(CONS), v, (x) => { v = x; draw(); });
  toggles("boxGrp", [["tipo", "Tipo de calefacción"], ["zona", "Zona climática"], ["mun", "Municipio (solo gas)"]], g, (x) => { g = x; draw(); });
  draw();
  window.__redraw.push(draw);
}

/* ---------- 2. Intervalos ---------- */
function renderIcDemo() {
  const d = D.ic_demo, iv = d.intervalos;
  const hits = iv.filter((x) => x[2]).length;
  const draw = () => {
    const mk = (ok) => {
      const xs = [], ys = [];
      iv.forEach((x, i) => { if (x[2] === ok) { xs.push(x[0], x[1], null); ys.push(i + 1, i + 1, null); } });
      return { type: "scatter", mode: "lines", x: xs, y: ys, line: { width: 2, color: ok ? css("--s-one") : css("--bad") },
        name: ok ? `Atrapan la media real (${hits})` : `No la atrapan (${100 - hits})`, hoverinfo: "skip" };
    };
    plot("chIcDemo", [mk(true), mk(false)], {
      shapes: [{ type: "line", x0: d.mu, x1: d.mu, y0: 0, y1: 101, line: { color: css("--ink"), width: 2 } }],
      annotations: [{ x: d.mu, y: 101, text: `Media real = ${nf(d.mu)} kWh`, showarrow: false, yanchor: "bottom", font: { size: 12, color: css("--ink-2") } }],
      xaxis: { title: { text: "Consumo de gas (kWh)" } }, yaxis: { title: { text: "Muestra nº" }, showgrid: false },
      margin: { l: 56, r: 16, t: 40, b: 48 },
    });
  };
  draw(); window.__redraw.push(draw);
  $("icDemoText").innerHTML = `<div class="k-title">🔎 Resultado</div><b>${hits} de 100</b> intervalos atraparon la media real. Es justo lo que promete el "95 %".
    Fíjate en que cada intervalo tiene un ancho distinto: depende de lo desordenada que salió cada muestra. Con solo 50 contadores las horquillas son
    anchas (unos ±1 200 kWh). Con miles de hogares se estrechan muchísimo, como veremos ahora.`;
}

function tq(conf, df) {
  // Cuantil t aproximado (Cornish-Fisher), suficiente para la demo interactiva
  const p = (1 + conf) / 2;
  const a = [2.515517, 0.802853, 0.010328], b = [1.432788, 0.189269, 0.001308];
  const t = Math.sqrt(-2 * Math.log(1 - p));
  const z = t - (a[0] + a[1] * t + a[2] * t * t) / (1 + b[0] * t + b[1] * t * t + b[2] * t ** 3);
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
}
function renderIcSlider() {
  const upd = () => {
    const s = +$("slS").value, n = +$("slN").value, c = +$("slC").value / 100;
    const t = tq(c, n - 1), w = 2 * t * s / Math.sqrt(n);
    $("oS").textContent = nf(s); $("oN").textContent = nf(n); $("oC").textContent = Math.round(c * 100) + " %";
    $("oW").textContent = nf(w);
    $("oWexp").innerHTML = `= 2 × t(${nf(t, 3)}) × ${nf(s)} / √${nf(n)}. Prueba: <b>leer 4 veces más contadores → horquilla la mitad de ancha</b> (por la raíz cuadrada).
      Consumos más variados entre hogares → horquilla más ancha. Querer más seguridad (99 %) → horquilla más ancha.
      Los valores iniciales son los del grupo "calefacción de gas" (s = 3 927, n = 9 934).`;
  };
  ["slS", "slN", "slC"].forEach((id) => $(id).addEventListener("input", upd));
  upd();
}

function renderIc() {
  let g = "tipo";
  const draw = () => {
    const keys = g === "tipo" ? TIPOS : ZONAS;
    const src = g === "tipo" ? D.ic_tipo : D.ic_zona;
    // Los IC son tan estrechos (±1 %) que dibujados sobre la media parecen puntos:
    // graficamos su AMPLITUD, que es justo lo que pregunta el enunciado.
    const cons = Object.keys(CONS);
    const zc = ["--s-elec", "--s-gas", "--s-otros", "--s-4", "--s-5"];
    const traces = keys.map((k, i) => ({
      type: "bar", name: k, x: cons.map((c) => CONS[c]), y: cons.map((c) => src[c][k].amplitud),
      marker: { color: g === "tipo" ? tipoColor(k) : css(zc[i]), line: { color: css("--surface"), width: 2 } },
      text: cons.map((c) => nf(src[c][k].amplitud)), textposition: "outside", cliponaxis: false, textfont: { color: css("--ink-2"), size: 11 },
      customdata: cons.map((c) => [nf(src[c][k].media), nf(src[c][k].lo), nf(src[c][k].hi), nf(src[c][k].n), nf(src[c][k].desv)]),
      hovertemplate: `<b>${k}</b> · %{x}<br>Media: %{customdata[0]} kWh<br>IC 95 %: [%{customdata[1]} – %{customdata[2]}]<br>Amplitud: %{y:,.0f} kWh<br>n = %{customdata[3]} · s = %{customdata[4]}<extra></extra>`,
    }));
    plot("chIc", traces, { barmode: "group", bargap: 0.25, yaxis: { title: { text: "Amplitud del IC 95 % (kWh)" }, rangemode: "tozero" },
      legend: { orientation: "h", y: 1.12, x: 0 }, margin: { l: 64, r: 16, t: 56, b: 40 } });
    const rows = [];
    keys.forEach((k) => cons.forEach((c) => {
      const r = src[c][k];
      rows.push([k, CONS[c], nf(r.n), nf(r.media), nf(r.desv), nf(r.se, 1), `[${nf(r.lo)} – ${nf(r.hi)}]`, nf(r.amplitud, 1)]);
    }));
    table("tblIc", [g === "tipo" ? "Calefacción" : "Zona", "Consumo", "n", "Media", "Desv. (s)", "Error est. (s/√n)", "IC 95 %", "Amplitud"], rows);
  };
  toggles("icGrp", [["tipo", "Tipo de calefacción"], ["zona", "Zona climática"]], g, (x) => { g = x; draw(); });
  draw(); window.__redraw.push(draw);
  const t = D.ic_tipo;
  $("icText").innerHTML = `<div class="k-title">🔎 ¿Tienen todos los intervalos la misma amplitud? <u>No</u>, y la fórmula explica por qué</div>
    <ul class="tight">
      <li><b>Consumos más variados, horquilla más ancha.</b> En gas, el grupo "Gas" tiene ${nf(t.Consumo_gas.Gas.n)} hogares (el más grande), pero su intervalo es el <b>más ancho</b>
        (${nf(t.Consumo_gas.Gas.amplitud)} kWh) porque su desviación es enorme (s = ${nf(t.Consumo_gas.Gas.desv)}). "Eléctrica" es mucho más homogéneo
        (s = ${nf(t.Consumo_gas["Eléctrica"].desv)}) y su intervalo mide solo ${nf(t.Consumo_gas["Eléctrica"].amplitud)} kWh.</li>
      <li><b>Menos hogares, horquilla más ancha.</b> "Eléctrica" y "Otros" tienen casi la misma s en gas (~1 370), pero "Otros" tiene menos hogares
        (${nf(t.Consumo_gas.Otros.n)} frente a ${nf(t.Consumo_gas["Eléctrica"].n)}), así que su intervalo es más ancho (${nf(t.Consumo_gas.Otros.amplitud)} frente a ${nf(t.Consumo_gas["Eléctrica"].amplitud)}).
        Por zonas pasa lo mismo: el "Interior templado" es la zona con menos hogares y tiene los intervalos más anchos.</li>
      <li><b>El consumo total</b> suma las variabilidades del gas y de la luz, por eso suele tener los intervalos más anchos.</li>
      <li><b>Interpretación:</b> "con un 95 % de confianza, el consumo medio de gas de <i>todos</i> los hogares españoles con calefacción de gas
        está entre ${nf(t.Consumo_gas.Gas.lo)} y ${nf(t.Consumo_gas.Gas.hi)} kWh". Como los intervalos de Gas y Eléctrica <b>no se tocan ni de lejos</b>,
        la diferencia es real y no fruto del azar. En cambio, en gas los de <b>Eléctrica y Otros se solapan</b>: no hay diferencia.</li>
      <li>Usamos la <b>t de Student</b> (con n tan grande es casi igual a la normal, t ≈ 1,96). Gracias al <b>Teorema Central del Límite</b>,
        aunque el consumo sea asimétrico, la <i>media</i> de miles de hogares sí sigue una campana, así que el intervalo es válido.</li>
    </ul>`;
}

/* ---------- 3. Regresión ---------- */
function renderScatter() {
  let v = "Superficie_vivienda";
  const draw = () => {
    const S = D.scatter;
    const traces = TIPOS.map((t) => {
      const ix = S.tipo.map((x, i) => x === t ? i : -1).filter((i) => i >= 0);
      return { type: "scattergl", mode: "markers", name: t, x: ix.map((i) => S[v][i]), y: ix.map((i) => S.Consumo_gas[i]),
        marker: { size: 5, color: tipoColor(t), opacity: 0.55 },
        hovertemplate: `${t}<br>${NOMBRE[v]}: %{x}<br>Gas: %{y:,.0f} kWh<extra></extra>` };
    });
    plot("chScatter", traces, { xaxis: { title: { text: NOMBRE[v] } }, yaxis: { title: { text: "Consumo de gas (kWh)" } }, margin: { l: 64, r: 16, t: 40, b: 48 } });
  };
  toggles("scVar", Object.keys(D.corr_gas).map((k) => [k, NOMBRE[k].replace(/ \(.+\)/, "")]), v, (x) => { v = x; draw(); });
  draw(); window.__redraw.push(draw);
  const fr = (r) => { const a = Math.abs(r); return a > .7 ? "Fuerte" : a > .4 ? "Moderada" : a > .15 ? "Débil" : "Casi nula"; };
  table("tblCorr", ["Variable", "r (todos)", "r (Gas)", "r (Eléctrica)", "r (Otros)", "Fuerza"],
    Object.keys(D.corr_gas).map((k) => [NOMBRE[k], nf(D.corr_gas[k], 3), ...TIPOS.map((t) => nf(D.corr_gas_tipo[t][k], 3)), fr(D.corr_gas_tipo.Gas[k])]));
}

function coefTable(el, m, opts = {}) {
  const rows = m.coef.map((c) => [COEF(c.var), nf(c.b, opts.dec ?? 2), nf(c.se, opts.dec ?? 2), nf(c.t, 1), pf(c.p),
    `[${nf(c.lo, opts.dec ?? 1)} ; ${nf(c.hi, opts.dec ?? 1)}]`, c.var === "Intercept" ? "" : sig(c.p)]);
  rows.push([`<b>R² = ${nf(m.r2, 4)} · R² ajustado = ${nf(m.r2adj, 4)}</b>`, "", "", "", "", `Error típico (RMSE) = ${nf(m.rmse, opts.dec ? 3 : 0)}`, ""]);
  table(el, ["Variable", "Coeficiente", "Error est.", "t", "Valor p", "IC 95 % del coef.", ""], rows, m.coef.map((c) => c.p >= 0.05 ? "dim" : "").concat(""));
}

function renderModels() {
  const M = D.modelos;
  coefTable("tblSimple", M.simple);
  $("simpleText").innerHTML = `<div class="k-title">🔎 Regresión simple: Gas = ${nf(M.simple.coef[0].b, 0)} + ${nf(M.simple.coef[1].b, 1)} × Superficie</div>
    Cada <b>m² extra suma unos ${nf(M.simple.coef[1].b, 0)} kWh</b> de gas al año, y el valor p ≈ 0 dice que la relación es real.
    Pero el <b>R² = ${nf(M.simple.r2, 2)}</b>: el tamaño solo explica el ${nf(M.simple.r2 * 100, 0)} % de las diferencias y la fórmula se equivoca de media unos ${nf(M.simple.rmse)} kWh.
    El intercepto negativo no tiene sentido físico (no hay casas de 0 m²) y además no es significativo. Nos faltan ingredientes.`;

  coefTable("tblTodo", M.todo);
  const g = (m, name) => m.coef.find((c) => c.var === name);
  $("todoText").innerHTML = `<div class="k-title">🔎 ¿Qué sobra?</div>
    <ul class="tight">
      <li><b>Temp. verano</b> (p = ${pf(g(M.todo, "Temp_verano").p)}) y <b>Temp. otoño</b> (p = ${pf(g(M.todo, "Temp_otono").p)}): <b>no significativas</b> ❌. Las quitamos.</li>
      <li><b>Temp. primavera</b> (p = ${pf(g(M.todo, "Temp_primavera").p)}): por poco "significativa", pero su efecto es diminuto (${nf(g(M.todo, "Temp_primavera").b, 1)} kWh/°C,
        y con el signo contrario al esperado). Con 20 000 datos hasta efectos irrelevantes salen significativos. No aporta: la quitamos.</li>
      <li><b>Calefacción "Otros"</b> (p = ${pf(g(M.todo, "C(Tipo_calefaccion, Treatment('Eléctrica'))[T.Otros]").p)}): consume el mismo gas que "Eléctrica". La dejamos para respetar la variable, pero en la práctica es "Gas sí/no".</li>
      <li><b>Multicolinealidad:</b> todos los VIF están por debajo de 1,4, así que las variables no se "pisan" entre ellas ✅.</li>
    </ul>`;

  coefTable("tblMult", M.multiple);
  $("multTiles").innerHTML = [
    ["R² simple → múltiple", `${nf(M.simple.r2, 2)} → ${nf(M.multiple.r2, 2)}`, "de 36 % a 90 % explicado"],
    ["R² ajustado (todas vs. propuesto)", `${nf(M.todo.r2adj, 4)} vs ${nf(M.multiple.r2adj, 4)}`, "quitar 3 variables no cuesta nada"],
    ["Error típico (RMSE)", `${nf(M.simple.rmse)} → ${nf(M.multiple.rmse)}`, "kWh por hogar"],
  ].map(([l, v, n]) => `<div class="tile"><div class="lbl">${l}</div><div class="val" style="font-size:22px">${v}</div><div class="note">${n}</div></div>`).join("");
  const c = (n) => g(M.multiple, n).b;
  $("multText").innerHTML = `<div class="k-title">🔎 Por qué estas variables y qué dicen</div>
    Elegimos <b>Superficie</b>, <b>Antigüedad</b>, <b>Temp. de invierno</b> y <b>Tipo de calefacción</b> porque en el Ejercicio 1 y en los gráficos de dispersión
    fueron las únicas con relación clara con el gas y tienen sentido físico: más espacio que calentar, peor aislamiento, más frío y gas como fuente de calor.
    <div class="formula" style="margin:8px 0">Gas = ${nf(c("Intercept"), 0)} + ${nf(c("Superficie_vivienda"), 1)}·Superficie + ${nf(c("Antiguedad"), 1)}·Antigüedad − ${nf(-c("Temp_invierno"), 1)}·T_invierno + ${nf(c("C(Tipo_calefaccion, Treatment('Eléctrica'))[T.Gas]"), 0)}·[Calef. Gas] + ${nf(c("C(Tipo_calefaccion, Treatment('Eléctrica'))[T.Otros]"), 0)}·[Otros]</div>
    <ul class="tight">
      <li>Todos los coeficientes clave tienen <b>p &lt; 0,001</b> ✅, y la prueba F del modelo completo también (p ≈ 0).</li>
      <li><b>R² ajustado = ${nf(M.multiple.r2adj, 3)}</b>: igual que con todas las variables, así que el modelo propuesto es más simple <b>sin perder nada</b> (principio de parsimonia ✂️).</li>
    </ul>`;
}

function renderResid() {
  const M = D.modelos;
  const opts = [["simple", "Simple"], ["multiple", "Múltiple propuesto"], ["Gas", "Lineal · solo Gas"], ["logGas", "Log-log · solo Gas"]];
  const get = (k) => k === "Gas" ? M.por_tipo.Gas : k === "logGas" ? M.por_tipo_log.Gas : M[k];
  let cur = "multiple";
  const draw = () => {
    const m = get(cur);
    const traces = TIPOS.filter((t) => m.grupo.includes(t)).map((t) => {
      const ix = m.grupo.map((x, i) => x === t ? i : -1).filter((i) => i >= 0);
      return { type: "scattergl", mode: "markers", name: t, x: ix.map((i) => m.fitted[i]), y: ix.map((i) => m.resid[i]),
        marker: { size: 4, color: tipoColor(t), opacity: 0.5 }, hovertemplate: `${t}<br>Predicho: %{x:,.0f}<br>Residuo: %{y:,.0f}<extra></extra>` };
    });
    const log = cur === "logGas";
    plot("chResid", traces, { xaxis: { title: { text: log ? "Predicho (log kWh)" : "Predicho (kWh)" } }, yaxis: { title: { text: log ? "Residuo (log)" : "Residuo (kWh)" } },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0, line: { color: css("--ink"), width: 1.5 } }], margin: { l: 64, r: 16, t: 40, b: 48 } });
    const lo = Math.min(...m.qq_teo), hi = Math.max(...m.qq_teo);
    plot("chQQ", [
      { type: "scatter", mode: "markers", x: m.qq_teo, y: m.qq_obs, marker: { size: 6, color: css("--s-one") }, name: "Residuos", hovertemplate: "Teórico %{x:.2f}<br>Observado %{y:.2f}<extra></extra>" },
      { type: "scatter", mode: "lines", x: [lo, hi], y: [lo, hi], line: { color: css("--ink-2"), dash: "dot", width: 1.5 }, name: "Campana perfecta", hoverinfo: "skip" },
    ], { xaxis: { title: { text: "Cuantiles teóricos (normal)" } }, yaxis: { title: { text: "Cuantiles de los residuos" } }, margin: { l: 64, r: 16, t: 40, b: 48 } });
    const ok = (b) => b ? '<span class="pill ok">Se cumple</span>' : '<span class="pill no">No se cumple</span>';
    table("tblDiag", ["Condición", "Prueba", "Resultado", "¿Se cumple?"], [
      ["Linealidad", "Residuos vs. predichos sin curva", "Ver gráfico", ok(cur !== "simple" && cur !== "multiple")],
      ["Independencia", "Durbin-Watson (ideal ≈ 2)", nf(m.dw, 3), ok(Math.abs(m.dw - 2) < 0.3)],
      ["Normalidad", "Jarque-Bera (p)", pf(m.jb_p) + ` · asimetría ${nf(m.asim_res, 2)}`, ok(m.jb_p > 0.05)],
      ["Varianza constante", "Breusch-Pagan (p)", pf(m.bp_p), ok(m.bp_p > 0.05)],
    ]);
  };
  toggles("resModel", opts, cur, (x) => { cur = x; draw(); });
  draw(); window.__redraw.push(draw);
  $("diagText").innerHTML = `<div class="k-title">🔎 Lo que nos dicen los residuos (prueba a cambiar de modelo arriba)</div>
    <ul class="tight">
      <li><b>Modelo múltiple:</b> los residuos <b>no son errores al azar</b>. Dibujan una <b>curva en forma de "V" o sonrisa 🙂</b>, así que la relación no es del todo una recta (falla la linealidad),
        y se abren como un <b>embudo 📢</b>: el error es pequeño en hogares que gastan poco y enorme en los que gastan mucho (heterocedasticidad, Breusch-Pagan p ≈ 0).
        Además, los colores van por caminos distintos: <b>los hogares con calefacción de gas tienen sus propios errores</b>. En el modelo simple el embudo es todavía mayor.
        El Q-Q plot se aleja de la diagonal en las puntas, con colas más pesadas que una campana.</li>
      <li><b>Independencia ✅:</b> Durbin-Watson ≈ 2 en todos los modelos. El error de un hogar no depende del siguiente.</li>
      <li><b>Normalidad y varianza constante ❌:</b> las pruebas formales fallan. Ojo, con 20 000 datos estas pruebas detectan hasta desviaciones minúsculas.
        Gracias al gran tamaño de muestra, los coeficientes y sus valores p siguen siendo bastante fiables (Teorema Central del Límite),
        aunque convendría usar errores estándar robustos. Lo importante es que <b>el embudo nos da una pista</b>: los efectos son <b>multiplicativos</b>
        y distintos según el tipo de calefacción.</li>
      <li><b>Log-log por grupo:</b> la curva y el embudo <b>desaparecen</b> (se cumple la linealidad) y los errores son diminutos, de ~1 %.
        El Q-Q plot todavía muestra una cola hacia la izquierda (algunos hogares gastan un poco menos de lo esperado), pero un error del 1 % no tiene importancia práctica.
        Es la fórmula que mejor respeta las condiciones.</li>
    </ul>`;
}

function renderDivide() {
  const M = D.modelos;
  const vars = ["Intercept", "Superficie_vivienda", "Antiguedad", "Temp_invierno"];
  const row = (t) => { const m = M.por_tipo[t]; const b = (v) => m.coef.find((c) => c.var === v).b; return [t, nf(m.n), ...vars.map((v) => nf(b(v), 1)), nf(m.r2, 4), nf(m.rmse)]; };
  table("tblPorTipo", ["Grupo", "n", "Base", "€ Superficie (kWh/m²)", "Antigüedad (kWh/año)", "T. invierno (kWh/°C)", "R²", "RMSE"].map((x) => x.replace("€ ", "")),
    [...TIPOS.map(row), ["<b>Modelo único</b>", nf(D.n), ...["Intercept", "Superficie_vivienda", "Antiguedad", "Temp_invierno"].map((v) => nf(M.multiple.coef.find((c) => c.var === v).b, 1)), nf(M.multiple.r2, 4), nf(M.multiple.rmse)]]);
  const G = M.por_tipo.Gas, E = M.por_tipo["Eléctrica"];
  const b = (m, v) => m.coef.find((c) => c.var === v).b;
  $("porTipoText").innerHTML = `<div class="k-title">🔎 ¡Sí, dividir funciona muchísimo mejor!</div>
    <ul class="tight">
      <li>El R² pasa de <b>${nf(M.multiple.r2, 3)}</b> con un modelo para todos a <b>~0,98</b> en cada grupo.</li>
      <li>Los coeficientes son <b>muy distintos</b> entre grupos: en los hogares con gas cada m² suma <b>${nf(b(G, "Superficie_vivienda"), 0)} kWh</b> y cada °C más de frío suma <b>${nf(-b(G, "Temp_invierno"), 0)} kWh</b>.
        En los eléctricos, solo ${nf(b(E, "Superficie_vivienda"), 0)} y ${nf(-b(E, "Temp_invierno"), 0)}. El modelo único usaba un "promedio" (${nf(b(M.multiple, "Superficie_vivienda"), 0)} kWh/m²) que no le sirve a nadie.</li>
      <li><b>"Eléctrica" y "Otros" tienen coeficientes casi idénticos</b>: bastaría con <b>dos modelos</b> (con gas / sin gas).</li>
      <li>Otras formas de dividir, por zona climática o por municipio, ayudan mucho menos, porque la temperatura ya recoge el efecto del clima.
        La división natural es la de <b>tipo de calefacción</b>.</li>
    </ul>`;

  const L = M.por_tipo_log;
  table("tblLog", ["Grupo", "Base (log)", "log(Superficie)", "Antigüedad", "T. invierno", "R²", "Error típico"],
    TIPOS.map((t) => { const m = L[t]; return [t, nf(b(m, "Intercept"), 3), nf(b(m, "np.log(Superficie_vivienda)"), 3), nf(b(m, "Antiguedad"), 4), nf(b(m, "Temp_invierno"), 4), nf(m.r2, 4), "≈ 1 %"]; }));
  const lg = L.Gas, k = (m) => Math.exp(b(m, "Intercept"));
  $("logText").innerHTML = `<div class="k-title">🔎 Encontramos la "fórmula secreta" de los datos</div>
    <div class="formula" style="margin:8px 0">Gas ≈ K × Superficie^${nf(b(lg, "np.log(Superficie_vivienda)"), 2)} × e^(${nf(b(lg, "Antiguedad"), 4)}·Antigüedad) × e^(${nf(b(lg, "Temp_invierno"), 4)}·T_invierno)
K(Gas) ≈ ${nf(k(lg), 0)}   K(Eléctrica) ≈ ${nf(k(L["Eléctrica"]), 0)}   K(Otros) ≈ ${nf(k(L.Otros), 0)}</div>
    <ul class="tight">
      <li><b>Exponente de la superficie ≈ 1,00:</b> casa el <b>doble</b> de grande, gas el <b>doble</b>. Es proporcional.</li>
      <li><b>Antigüedad:</b> cada año más suma <b>+${nf((Math.exp(b(lg, "Antiguedad")) - 1) * 100, 2)} %</b> de consumo.</li>
      <li><b>Temperatura de invierno:</b> cada °C más templado <b>ahorra un ${nf((1 - Math.exp(b(lg, "Temp_invierno"))) * 100, 1)} %</b>.</li>
      <li><b>¡Los porcentajes son IGUALES en los tres grupos!</b> Lo único que cambia es K: un hogar con calefacción de gas consume
        <b>${nf(k(lg) / k(L["Eléctrica"]), 1)} veces</b> más gas que uno igual sin ella. Por eso el modelo lineal único fallaba: los efectos se <b>multiplican</b>, no se suman.</li>
      <li><b>R² = ${nf(lg.r2, 4)}</b>: casi perfecto. Esto pasa porque los datos son <b>simulados</b> con una fórmula de este estilo. En la vida real nunca veríamos algo tan limpio.</li>
    </ul>`;

  const entries = Object.entries(D.comparacion_mae);
  plot("chMae", [{ type: "bar", orientation: "h", y: entries.map((e) => e[0]), x: entries.map((e) => e[1]), marker: { color: css("--s-one") },
    text: entries.map((e) => nf(e[1]) + " kWh"), textposition: "outside", cliponaxis: false, textfont: { color: css("--ink-2") },
    hovertemplate: "%{y}<br>Error medio: %{x:,.0f} kWh<extra></extra>" }],
    { xaxis: { title: { text: "Error absoluto medio en hogares nuevos (kWh) · menos es mejor" }, range: [0, Math.max(...entries.map((e) => e[1])) * 1.2] },
      yaxis: { autorange: "reversed" }, margin: { l: 16, r: 16, t: 8, b: 48 } });
}

function renderCalc() {
  const M = D.modelos;
  const b = (m, v) => m.coef.find((c) => c.var === v).b;
  let tipo = "Gas";
  const upd = () => {
    const S = +$("cSup").value, A = +$("cAnt").value, T = +$("cTmp").value;
    $("oSup").textContent = S; $("oAnt").textContent = A; $("oTmp").textContent = nf(T, 1);
    const m = M.multiple;
    const pm = b(m, "Intercept") + b(m, "Superficie_vivienda") * S + b(m, "Antiguedad") * A + b(m, "Temp_invierno") * T
      + (tipo === "Gas" ? b(m, "C(Tipo_calefaccion, Treatment('Eléctrica'))[T.Gas]") : tipo === "Otros" ? b(m, "C(Tipo_calefaccion, Treatment('Eléctrica'))[T.Otros]") : 0);
    const l = M.por_tipo[tipo];
    const pl = b(l, "Intercept") + b(l, "Superficie_vivienda") * S + b(l, "Antiguedad") * A + b(l, "Temp_invierno") * T;
    const g = M.por_tipo_log[tipo];
    const pg = Math.exp(b(g, "Intercept") + b(g, "np.log(Superficie_vivienda)") * Math.log(S) + b(g, "Antiguedad") * A + b(g, "Temp_invierno") * T);
    $("pMult").textContent = nf(pm); $("pLin").textContent = nf(pl); $("pLog").textContent = nf(pg);
    $("calcExp").innerHTML = `Prueba: pon una casa <b>pequeña (40 m²) con calefacción eléctrica en zona cálida</b>. El modelo único puede predecir
      un consumo absurdamente bajo, o incluso negativo, porque usa coeficientes "promedio". Los modelos por grupo se mantienen razonables.`;
  };
  toggles("calcTipo", TIPOS.map((t) => [t, t]), tipo, (x) => { tipo = x; upd(); });
  ["cSup", "cAnt", "cTmp"].forEach((id) => $(id).addEventListener("input", upd));
  upd();
}

function renderInterp() {
  const L = D.modelos.por_tipo_log.Gas, G = D.modelos.por_tipo.Gas, m = D.modelos.multiple;
  const b = (mm, v) => mm.coef.find((c) => c.var === v).b;
  table("tblInterp", ["Variable", "Modelo múltiple (kWh)", "Modelo log-log (%)", "Qué significa en el consumo 💡"], [
    ["Superficie", `+${nf(b(m, "Superficie_vivienda"), 1)} por m²`, "Proporcional (exp. ≈ 1)", "Una vivienda del doble de m² necesita el doble de gas para calentarse"],
    ["Antigüedad", `+${nf(b(m, "Antiguedad"), 1)} por año`, `+${nf((Math.exp(b(L, "Antiguedad")) - 1) * 100, 2)} % por año`, "Las viviendas antiguas aíslan peor (ventanas, muros sin aislamiento) y se escapa más calor"],
    ["Temp. invierno", `${nf(b(m, "Temp_invierno"), 1)} por °C`, `−${nf((1 - Math.exp(b(L, "Temp_invierno"))) * 100, 1)} % por °C`, "Cada °C más frío en invierno obliga a la caldera a trabajar más horas"],
    ["Calefacción de gas", `+${nf(b(m, "C(Tipo_calefaccion, Treatment('Eléctrica'))[T.Gas]"), 0)}`, "× 2,8", "Si la calefacción es de gas, el gas pasa de usarse solo para cocina y agua caliente a calentar toda la casa"],
    ["Calefacción Otros", `${nf(b(m, "C(Tipo_calefaccion, Treatment('Eléctrica'))[T.Otros]"), 1)} (no signif.)`, "× 1,0", "Igual que la eléctrica: el gas solo se usa para cocinar y el agua caliente"],
  ].map((r) => r.map((x, i) => i === 3 ? `<span style="white-space:normal;display:block;text-align:left;min-width:220px">${x}</span>` : x)));
}

/* ---------- arranque y tema ---------- */
window.__redraw = [];
function init() {
  renderData(); renderDesc(); renderBox(); renderIcDemo(); renderIcSlider(); renderIc();
  renderScatter(); renderModels(); renderResid(); renderDivide(); renderCalc(); renderInterp();
}
function redrawAll() { window.__redraw.forEach((f) => f()); renderDivide(); renderData(); }

$("themeBtn").onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  redrawAll();
};
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawAll);

// Resaltar la sección activa en la barra
const links = [...document.querySelectorAll("nav.top a")];
const obs = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
}), { rootMargin: "-40% 0px -55% 0px" });
document.querySelectorAll("section.block").forEach((s) => obs.observe(s));

init();
