# ¿Por qué unas casas gastan más energía que otras?

Actividad grupal de la Maestría en IA (UNIR), Equipo 1011H: **análisis del consumo energético de 20 000 hogares en España**.

👉 **Página interactiva:** https://rickrgr-22.github.io/Maestria-UNIR-IA-Equipo1011H/

Cada técnica se explica dos veces: "como para un niño de 10 años" 🧒 y con lo que significa en nuestros datos 🔎. Además, cada sección trae una frase lista para la diapositiva 🎤.

## Qué hay en la página

| Ejercicio | Técnicas | Lo interactivo |
|---|---|---|
| **0. Datos** | Revisión de calidad, agrupación de los municipios en 5 zonas climáticas | — |
| **1. Descriptiva** | Media, mediana, moda, varianza, desviación, CV, percentiles, IQR, histogramas, box-plots | Cambiar de variable, separar el gas por calefacción, box-plots por tipo, zona o municipio |
| **2. Inferencia** | Intervalos de confianza al 95 % (t de Student) por tipo de calefacción y por zona | Simulación de 100 intervalos y deslizadores que muestran por qué cambia la amplitud |
| **3. Regresión** | Correlación, regresión simple y múltiple, valores p, R² y R² ajustado, VIF, análisis de residuos (LINE), "divide y vencerás", modelo log-log, validación 80/20 | Gráficos de dispersión, residuos y Q-Q por modelo, calculadora de predicción |

## Resultados clave

- **La calefacción manda:** con calefacción de gas un hogar consume ~2,8 veces más gas. "Eléctrica" y "Otros" consumen el mismo gas.
- **Intervalos al 95 %:** son muy estrechos (±1 %) por el tamaño de la muestra. No tienen la misma amplitud porque esta depende de la dispersión (s) y del tamaño del grupo (n): amplitud = 2·t·s/√n.
- **Regresión:**
  - Solo con la superficie, R² = 0,36.
  - El modelo múltiple `Gas ~ Superficie + Antigüedad + T_invierno + Tipo_calefacción` llega a R² ajustado = 0,903.
  - Las temperaturas de primavera, verano y otoño no aportan.
- **Divide y vencerás:** con un modelo por tipo de calefacción, R² ≈ 0,98. En escala log-log, R² = 0,9995 y el error medio baja de 972 a 47 kWh.
- **Fórmula descubierta:** `Gas ≈ K · Superficie · e^(0,0025·Antigüedad) · e^(−0,039·T_invierno)`:
  - el doble de superficie supone el doble de gas;
  - cada año de antigüedad suma un +0,25 %;
  - cada °C más templado en invierno ahorra un −3,9 %.

## Estructura

```
analysis.py                  # Todos los cálculos (pandas, scipy, statsmodels) → docs/data.js
consumo_energia_hogares.csv  # Datos originales (separados por ';')
docs/index.html              # Página (GitHub Pages sirve esta carpeta)
docs/app.js                  # Gráficos (Plotly) y tablas
docs/styles.css
docs/data.js                 # Resultados generados por analysis.py
```

## Reproducir

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python analysis.py      # regenera docs/data.js
cd docs && python3 -m http.server # abre http://localhost:8000
```

> Nota: el enunciado menciona 10 000 hogares, pero el CSV entregado tiene 20 000, y se usaron todos. Los datos son simulados, por eso los modelos ajustan tan bien.
