"""
Análisis del consumo energético en los hogares (Actividad grupal - UNIR).

Este script hace TODOS los cálculos de la tarea y guarda los resultados en
docs/data.js, que la página web (docs/index.html) usa para dibujar gráficos y tablas.

Uso:
    python -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python analysis.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.outliers_influence import variance_inflation_factor
from statsmodels.stats.stattools import durbin_watson, jarque_bera

RNG = np.random.default_rng(42)
OUT = Path(__file__).parent / "docs" / "data.js"

# ---------------------------------------------------------------------------
# 0. Carga y preparación
# ---------------------------------------------------------------------------
df = pd.read_csv(Path(__file__).parent / "consumo_energia_hogares.csv", sep=";")
df = df.rename(columns={"Temp_otoño": "Temp_otono"})

# Zonas climáticas: los municipios comparten exactamente los mismos rangos de
# temperatura simulados, así que se agrupan solos en 5 zonas.
ZONAS = {
    "Norte atlántico": ["Bilbao", "Donostia-San Sebastián", "Gijón", "La Coruña", "Oviedo",
                        "Vigo", "Vitoria", "Santander", "León"],
    "Interior continental": ["Alcalá de Henares", "Zaragoza", "Madrid", "Pamplona", "Salamanca",
                             "Valladolid", "Burgos", "Móstoles", "Logroño"],
    "Interior templado": ["Getafe", "Alcorcón", "Fuenlabrada", "Leganés", "Cartagena",
                          "Badajoz", "Albacete"],
    "Mediterráneo": ["Elche", "Hospitalet de Llobregat", "Sabadell", "Alicante", "Badalona",
                     "Barcelona", "Murcia", "Terrassa", "Valencia", "Castellón de la Plana",
                     "Tarragona"],
    "Sur": ["Jerez de la Frontera", "Córdoba", "Granada", "Málaga", "Sevilla", "Almería", "Huelva"],
}
ORDEN_ZONAS = list(ZONAS)
mun2zona = {m: z for z, ms in ZONAS.items() for m in ms}
df["Zona"] = df["Municipio"].map(mun2zona)
assert df["Zona"].notna().all(), "Hay municipios sin zona"

TIPOS = ["Gas", "Eléctrica", "Otros"]
CONSUMOS = ["Consumo_gas", "Consumo_electricidad", "Consumo_total"]
R = {"n": int(len(df)), "n_municipios": int(df.Municipio.nunique()),
     "nulos": int(df.isna().sum().sum()), "duplicados": int(df.duplicated("ID_Hogar").sum()),
     "tipos_n": df.Tipo_calefaccion.value_counts().reindex(TIPOS).astype(int).to_dict()}


def r(x, k=2):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), k)


# ---------------------------------------------------------------------------
# 1. Estadística descriptiva
# ---------------------------------------------------------------------------
def describe(s: pd.Series) -> dict:
    q1, q2, q3 = s.quantile([0.25, 0.5, 0.75])
    moda = s.mode()
    # Para variables continuas la moda "exacta" casi no se repite; damos también
    # la moda por intervalos (centro del intervalo más frecuente del histograma).
    counts, edges = np.histogram(s, bins="fd")
    i = counts.argmax()
    return {
        "media": r(s.mean()), "mediana": r(q2), "moda": r(moda.iloc[0]),
        "moda_veces": int((s == moda.iloc[0]).sum()), "valores_distintos": int(s.nunique()),
        "moda_intervalo": [r(edges[i]), r(edges[i + 1])],
        "varianza": r(s.var(ddof=1)), "desv": r(s.std(ddof=1)),
        "cv": r(s.std(ddof=1) / s.mean() * 100), "p25": r(q1), "p50": r(q2), "p75": r(q3),
        "iqr": r(q3 - q1), "min": r(s.min()), "max": r(s.max()),
        "asimetria": r(s.skew(), 3), "curtosis": r(s.kurt(), 3),
        "atipicos": int(((s < q1 - 1.5 * (q3 - q1)) | (s > q3 + 1.5 * (q3 - q1))).sum()),
    }


VARS_DESC = ["Superficie_vivienda", "Antiguedad", "Consumo_gas"]
R["desc"] = {v: describe(df[v]) for v in VARS_DESC}

BINS = {"Superficie_vivienda": np.arange(40, 260, 5), "Antiguedad": np.arange(0.5, 75.5, 2),
        "Consumo_gas": np.arange(0, 32000, 500)}
R["hist"] = {}
for v, b in BINS.items():
    c, e = np.histogram(df[v], bins=b)
    R["hist"][v] = {"edges": [r(x) for x in e], "counts": c.tolist()}
# Histograma del gas separado por calefacción (explica la forma "rara" del total)
R["hist_gas_tipo"] = {t: np.histogram(df.loc[df.Tipo_calefaccion == t, "Consumo_gas"],
                                      bins=BINS["Consumo_gas"])[0].tolist() for t in TIPOS}


def box_stats(s: pd.Series) -> dict:
    q1, q2, q3 = s.quantile([0.25, 0.5, 0.75])
    iqr = q3 - q1
    lo = s[s >= q1 - 1.5 * iqr].min()
    hi = s[s <= q3 + 1.5 * iqr].max()
    return {"q1": r(q1), "median": r(q2), "q3": r(q3), "lowerfence": r(lo), "upperfence": r(hi),
            "mean": r(s.mean()), "n": int(len(s)), "outliers": int(((s < lo) | (s > hi)).sum())}


R["box_tipo"] = {c: {t: box_stats(df.loc[df.Tipo_calefaccion == t, c]) for t in TIPOS} for c in CONSUMOS}
R["box_zona"] = {c: {z: box_stats(df.loc[df.Zona == z, c]) for z in ORDEN_ZONAS} for c in CONSUMOS}
# Gas por zona SOLO en hogares con calefacción de gas (quita el efecto del tipo)
R["box_zona_gas_solo_gas"] = {z: box_stats(df.loc[(df.Zona == z) & (df.Tipo_calefaccion == "Gas"),
                                                  "Consumo_gas"]) for z in ORDEN_ZONAS}

mun = (df.groupby("Municipio")
         .agg(zona=("Zona", "first"), n=("ID_Hogar", "size"), t_inv=("Temp_invierno", "mean"),
              gas=("Consumo_gas", "median"), elec=("Consumo_electricidad", "median"),
              pct_gas=("Tipo_calefaccion", lambda s: (s == "Gas").mean() * 100))
         .reset_index().sort_values("t_inv"))
R["municipios"] = [{k: (r(v) if isinstance(v, float) else v) for k, v in row.items()}
                   for row in mun.to_dict("records")]
R["box_mun_gas"] = {m: box_stats(df.loc[df.Municipio == m, "Consumo_gas"]) for m in mun.Municipio}
R["zonas"] = {z: {"municipios": ZONAS[z], "n": int((df.Zona == z).sum()),
                  "t_inv": r(df.loc[df.Zona == z, "Temp_invierno"].mean()),
                  "t_ver": r(df.loc[df.Zona == z, "Temp_verano"].mean())} for z in ORDEN_ZONAS}

# ---------------------------------------------------------------------------
# 2. Intervalos de confianza al 95 % (t de Student)
# ---------------------------------------------------------------------------
def ic(s: pd.Series, conf=0.95) -> dict:
    n, m, sd = len(s), s.mean(), s.std(ddof=1)
    se = sd / np.sqrt(n)
    t = stats.t.ppf((1 + conf) / 2, n - 1)
    return {"n": int(n), "media": r(m), "desv": r(sd), "se": r(se), "t": r(t, 4),
            "lo": r(m - t * se), "hi": r(m + t * se), "amplitud": r(2 * t * se)}


R["ic_global"] = {c: ic(df[c]) for c in CONSUMOS}
R["ic_tipo"] = {c: {t: ic(df.loc[df.Tipo_calefaccion == t, c]) for t in TIPOS} for c in CONSUMOS}
R["ic_zona"] = {c: {z: ic(df.loc[df.Zona == z, c]) for z in ORDEN_ZONAS} for c in CONSUMOS}
R["ic_zona_tipo_gas"] = {z: {t: ic(df.loc[(df.Zona == z) & (df.Tipo_calefaccion == t), "Consumo_gas"])
                             for t in TIPOS} for z in ORDEN_ZONAS}

# Demostración: ¿cuántas veces "atrapa" el IC a la media real? (100 muestras de 50 hogares)
mu_real = df["Consumo_gas"].mean()
demo = []
for _ in range(100):
    s = df["Consumo_gas"].sample(50, random_state=int(RNG.integers(1e9)))
    x = ic(s)
    demo.append([x["lo"], x["hi"], bool(x["lo"] <= mu_real <= x["hi"])])
R["ic_demo"] = {"mu": r(mu_real), "intervalos": demo}

# ---------------------------------------------------------------------------
# 3. Regresión lineal
# ---------------------------------------------------------------------------
PRED = ["Superficie_vivienda", "Antiguedad", "Temp_invierno", "Temp_primavera", "Temp_verano", "Temp_otono"]
R["corr_gas"] = {v: r(df[v].corr(df["Consumo_gas"]), 3) for v in PRED}
R["corr_gas_tipo"] = {t: {v: r(g[v].corr(g["Consumo_gas"]), 3) for v in PRED}
                      for t, g in df.groupby("Tipo_calefaccion")}
num = ["Superficie_vivienda", "Antiguedad", "Temp_invierno", "Temp_primavera", "Temp_verano",
       "Temp_otono", "Consumo_electricidad", "Consumo_gas", "Consumo_total"]
R["corr_matrix"] = {"vars": num, "m": df[num].corr().round(2).values.tolist()}

idx = RNG.choice(len(df), 3000, replace=False)
samp = df.iloc[idx]
R["scatter"] = {c: samp[c].round(2).tolist() for c in PRED + ["Consumo_gas"]}
R["scatter"]["tipo"] = samp["Tipo_calefaccion"].tolist()


def resumen_modelo(m, nombre, formula, datos) -> dict:
    res = m.resid
    jb_stat, jb_p, _, _ = jarque_bera(res)
    bp = het_breuschpagan(res, m.model.exog)
    exog = m.model.exog
    vif = {}
    for i, name in enumerate(m.model.exog_names):
        if name != "Intercept":
            vif[name] = r(variance_inflation_factor(exog, i))
    k = RNG.choice(len(res), min(2500, len(res)), replace=False)
    qs = np.linspace(0.005, 0.995, 120)
    std_res = (res - res.mean()) / res.std()
    return {
        "nombre": nombre, "formula": formula, "n": int(m.nobs),
        "coef": [{"var": v, "b": r(m.params[v], 4), "se": r(m.bse[v], 4), "t": r(m.tvalues[v]),
                  "p": float(f"{m.pvalues[v]:.3g}"), "lo": r(m.conf_int().loc[v, 0], 4),
                  "hi": r(m.conf_int().loc[v, 1], 4)} for v in m.params.index],
        "r2": r(m.rsquared, 4), "r2adj": r(m.rsquared_adj, 4), "rmse": r(np.sqrt(m.mse_resid)),
        "f": r(m.fvalue), "f_p": float(f"{m.f_pvalue:.3g}"), "aic": r(m.aic, 1),
        "jb_p": float(f"{jb_p:.3g}"), "bp_p": float(f"{bp[1]:.3g}"), "dw": r(durbin_watson(res), 3),
        "vif": vif, "asim_res": r(stats.skew(res), 3),
        "fitted": [r(x, 4) for x in m.fittedvalues.values[k]],
        "resid": [r(x, 4) for x in res.values[k]],
        "grupo": datos["Tipo_calefaccion"].values[k].tolist(),
        "qq_teo": [r(x, 3) for x in stats.norm.ppf(qs)],
        "qq_obs": [r(x, 3) for x in np.quantile(std_res, qs)],
    }


modelos = {}
f_simple = "Consumo_gas ~ Superficie_vivienda"
modelos["simple"] = resumen_modelo(smf.ols(f_simple, df).fit(), "Regresión simple", f_simple, df)

f_todo = ("Consumo_gas ~ Superficie_vivienda + Antiguedad + Temp_invierno + Temp_primavera"
          " + Temp_verano + Temp_otono + C(Tipo_calefaccion, Treatment('Eléctrica'))")
modelos["todo"] = resumen_modelo(smf.ols(f_todo, df).fit(), "Múltiple con todas las variables", f_todo, df)

f_mult = ("Consumo_gas ~ Superficie_vivienda + Antiguedad + Temp_invierno"
          " + C(Tipo_calefaccion, Treatment('Eléctrica'))")
modelos["multiple"] = resumen_modelo(smf.ols(f_mult, df).fit(), "Múltiple (modelo propuesto)", f_mult, df)

# Divide y vencerás: un modelo por tipo de calefacción
f_grupo = "Consumo_gas ~ Superficie_vivienda + Antiguedad + Temp_invierno"
f_log = "np.log(Consumo_gas) ~ np.log(Superficie_vivienda) + Antiguedad + Temp_invierno"
modelos["por_tipo"] = {}
modelos["por_tipo_log"] = {}
for t in TIPOS:
    g = df[df.Tipo_calefaccion == t]
    modelos["por_tipo"][t] = resumen_modelo(smf.ols(f_grupo, g).fit(), f"Lineal · {t}", f_grupo, g)
    modelos["por_tipo_log"][t] = resumen_modelo(smf.ols(f_log, g).fit(), f"Log-log · {t}", f_log, g)


# Error en kWh de cada estrategia sobre los MISMOS hogares (validación 80/20)
test = RNG.random(len(df)) < 0.2
tr, te = df[~test], df[test]
def mae(pred):
    return r(np.mean(np.abs(te["Consumo_gas"].values - pred)), 0)
comp = {
    "Simple (solo superficie)": mae(smf.ols(f_simple, tr).fit().predict(te)),
    "Múltiple (un modelo para todos)": mae(smf.ols(f_mult, tr).fit().predict(te)),
}
p_lin, p_log = np.zeros(len(te)), np.zeros(len(te))
for t in TIPOS:
    mt = (te.Tipo_calefaccion == t).values
    p_lin[mt] = smf.ols(f_grupo, tr[tr.Tipo_calefaccion == t]).fit().predict(te[mt])
    ml = smf.ols(f_log, tr[tr.Tipo_calefaccion == t]).fit()
    p_log[mt] = np.exp(ml.predict(te[mt]) + ml.mse_resid / 2)
comp["Un modelo lineal por calefacción"] = mae(p_lin)
comp["Un modelo log-log por calefacción"] = mae(p_log)
R["comparacion_mae"] = comp
R["modelos"] = modelos

OUT.write_text("window.DATA = " + json.dumps(R, ensure_ascii=False) + ";\n", encoding="utf-8")
print(f"OK -> {OUT} ({OUT.stat().st_size/1024:.0f} KB)")

# Resumen en consola
for k in ["simple", "todo", "multiple"]:
    m = modelos[k]
    print(k, "R2", m["r2"], "R2adj", m["r2adj"], "RMSE", m["rmse"], "JB p", m["jb_p"], "BP p", m["bp_p"], "DW", m["dw"])
    for c in m["coef"]:
        print("   ", c["var"], c["b"], c["p"])
for t in TIPOS:
    for key in ["por_tipo", "por_tipo_log"]:
        m = modelos[key][t]
        print(key, t, "R2", m["r2"], "RMSE", m["rmse"], "JB", m["jb_p"], "BP", m["bp_p"],
              {c["var"]: c["b"] for c in m["coef"]})
print("MAE", comp)
print(json.dumps(R["desc"], indent=1, ensure_ascii=False))
for c in CONSUMOS:
    print(c, {t: (v["media"], v["lo"], v["hi"], v["amplitud"]) for t, v in R["ic_tipo"][c].items()})
    print(c, {z: (v["media"], v["amplitud"]) for z, v in R["ic_zona"][c].items()})
print("demo atrapa", sum(x[2] for x in demo))
print(R["corr_gas_tipo"])
