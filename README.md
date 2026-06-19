# SignalFoundry

### Decision intelligence for product and go-to-market teams

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-2563eb?style=for-the-badge&logo=github)](https://naghmehshahverdi.github.io/ABtesting/)
[![Snowflake](https://img.shields.io/badge/Data-Snowflake-29B5E8?style=for-the-badge&logo=snowflake&logoColor=white)](https://www.snowflake.com/)
[![TypeScript](https://img.shields.io/badge/Frontend-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Build-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)

SignalFoundry is an end-to-end data science portfolio project that connects product analytics, predictive modeling, causal inference, and a grounded AI copilot in one decision workflow.

**[Open the live application →](https://naghmehshahverdi.github.io/ABtesting/)**

![SignalFoundry decision-intelligence illustration](src/assets/hero.png)

## What it answers

| Module | Business question | What it demonstrates |
|---|---|---|
| **Activation Model** | Which behaviors indicate that a user has reached product value? | Configurable activation events, observation windows, cohort comparison, and product telemetry analysis |
| **Account Scoring** | Which accounts are most likely to become Closed Won in the next 90 days? | Time-aware feature engineering, model comparison, probability calibration, revenue-aware ranking, and account-level decision support |
| **Causal Inference** | Which intervention might actually change the outcome? | Propensity modeling, overlap diagnostics, cross-fitted AIPW estimates, confidence intervals, heterogeneous effects, and experiment design |
| **Account Scoring Copilot** | What do the model results mean, and which accounts should be reviewed first? | A RAG-style assistant grounded in published model metrics, ranked accounts, drivers, and explanations |

## Account Scoring Copilot

The copilot is not a general chatbot. Its server-side prompt is supplied with a constrained account-scoring context retrieved from Snowflake:

- validation and held-out model metrics;
- calibration and cohort performance;
- global feature importance;
- ranked account scores;
- available account-level explanations; and
- explicit limitations that prevent causal or unsupported claims.

The browser never receives Snowflake credentials or the language-model API key. Questions are sent to the hosted API, which builds the grounded context and calls the configured LLM. The assistant is instructed not to invent accounts, scores, reasons, or recommendations.

## Model governance

The project intentionally separates model selection from final evaluation:

- Models are selected using a validation period.
- The most recent period remains a held-out temporal test.
- Revenue captured in the top 10% is the primary business metric.
- PR-AUC, ROC-AUC, lift, recall, Brier score, and calibration provide supporting evidence.
- A challenger is not promoted from one point estimate alone; the page specifies paired account-level bootstrap intervals, temporal stability tests, capacity sensitivity, and a future holdout requirement.

This distinction matters because the test-period revenue advantage between Gradient Boosting and the deployed XGBoost benchmark may be practically meaningful without yet being statistically stable.

## Architecture

```text
GitHub Pages frontend
        │
        ▼
Render API (Express)
        ├── Snowflake queries and secure credentials
        ├── cached scoring snapshot + background refresh
        ├── causal-inference outputs
        └── grounded LLM request
                 │
                 ▼
        Account Scoring Copilot
```

- **Frontend:** TypeScript and Vite, deployed to GitHub Pages.
- **API:** Node.js and Express, deployed separately because GitHub Pages is static.
- **Warehouse:** Snowflake stores model metrics, calibration results, scores, feature importance, and explanation data.
- **Authentication:** Snowflake key-pair authentication and server-only environment variables.
- **Performance:** The scoring API serves a last-known-good historical snapshot immediately and refreshes its Snowflake cache in the background.

## Important data note

The uploaded portfolio dataset is a **frozen historical snapshot** and is no longer updated. The application demonstrates a live production-shaped architecture—the frontend calls a hosted API and the API can query Snowflake—but the displayed accounts are not current sales recommendations.

A production implementation would continuously ingest new events, timestamp every scoring run, monitor drift and data quality, rescore on a schedule, and retrain through a governed promotion process.

## Notebooks

| Notebook | Purpose |
|---|---|
| [`data.ipynb`](data.ipynb) | Data access and source exploration |
| [`ml.ipynb`](ml.ipynb) | Account-month dataset construction, model training, temporal evaluation, and Snowflake publishing |
| [`ml_new.ipynb`](ml_new.ipynb) | Extended modeling and account-explanation workflow |
| [`causal_inference.ipynb`](causal_inference.ipynb) | Treatment-effect estimation, diagnostics, heterogeneous effects, and experiment recommendations |
| [`rag_ml.ipynb`](rag_ml.ipynb) | Grounded account-scoring copilot prototype and API integration |

## Run locally

```bash
git clone https://github.com/NaghmehShahverdi/ABtesting.git
cd ABtesting
npm install
cp .env.example .env
npm run dev
```

Run the API separately:

```bash
npm start
```

The expected environment variables are documented in [`.env.example`](.env.example). Never commit `.env`, passwords, API keys, or RSA private keys.

## Roadmap

- Add an **optimization-based decision layer** that allocates limited Sales capacity across accounts using expected value, cost, constraints, and business rules.
- Add paired bootstrap confidence intervals and rolling temporal stability results to model comparison.
- Add directional SHAP explanations and production drift monitoring.
- Split the frontend bundle for faster first-page loading.

## Technology

`Snowflake` · `Python` · `scikit-learn` · `XGBoost` · `Causal Inference` · `RAG/LLM` · `Node.js` · `Express` · `TypeScript` · `Vite`

---

Built by **Naghmeh Shahverdizadeh** 
