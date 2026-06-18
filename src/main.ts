import './style.css'
import {
  bindActivationControls,
  defaultEvents,
  defaultWindowDays,
  renderActivationModel,
  type ActivationModelState,
} from './views/activationModel'
import {
  fetchProductUsageDashboard,
  renderProductUsageAnalytics,
  type ProductUsageAnalyticsState,
} from './views/productUsageAnalytics'
import {
  fetchMlScoring,
  renderMlAlgorithm,
  type MlAlgorithmState,
} from './views/mlAlgorithm'
import { renderIntro } from './views/intro'
import { renderActivationIcon } from './sidebar-icons/activationIcon'
import { renderIntroductionIcon } from './sidebar-icons/introductionIcon'
import { renderProductUsageAnalyticsIcon } from './sidebar-icons/productUsageAnalyticsIcon'
import {
  fetchCausalInference,
  renderCausalInference,
  type CausalInferenceState,
} from './views/causalInference'
import { renderCausalInferenceIcon } from './sidebar-icons/causalInferenceIcon'
import { renderMlAlgorithmIcon } from './sidebar-icons/mlAlgorithmIcon'

type AppView = 'intro' | 'activation' | 'usage' | 'ml' | 'causal'

const appState: {
  activeView: AppView
  activationModel: ActivationModelState
  productUsageAnalytics: ProductUsageAnalyticsState
  mlAlgorithm: MlAlgorithmState
  causalInference: CausalInferenceState
} = {
  activeView: 'intro',
  activationModel: {
    selectedEvents: defaultEvents,
    windowDays: defaultWindowDays,
    splitUsers: false,
  },
  productUsageAnalytics: {
    status: 'idle',
  },
  mlAlgorithm: {
    status: 'idle',
  },
  causalInference: {
    status: 'idle',
  },
}

function renderApp() {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark">EC</span>
          <div>
            <strong>Experiment Copilot</strong>
            <small>Activation analytics</small>
          </div>
        </div>

        <nav class="sidebar-nav" aria-label="Product tools">
          <button class="nav-item ${appState.activeView === 'intro' ? 'active' : ''}" data-view="intro">
            ${renderIntroductionIcon()}
            <span>Introduction</span>
          </button>
          <button class="nav-item ${appState.activeView === 'activation' ? 'active' : ''}" data-view="activation">
            ${renderActivationIcon()}
            <span>Activation Model</span>
          </button>
          <button class="nav-item ${appState.activeView === 'usage' ? 'active' : ''}" data-view="usage">
            ${renderProductUsageAnalyticsIcon()}
            <span>Product Usage Analytics</span>
          </button>
          <button class="nav-item ${appState.activeView === 'ml' ? 'active' : ''}" data-view="ml">
            ${renderMlAlgorithmIcon()}
            <span>Account Scoring Model</span>
          </button>
          <button class="nav-item ${appState.activeView === 'causal' ? 'active' : ''}" data-view="causal">
            ${renderCausalInferenceIcon()}
            <span>Causal Inference</span>
          </button>
        </nav>
      </aside>

      <main class="content">
        ${renderMainContent()}
      </main>
    </div>
  `

  bindAppEvents()
  loadViewData()
}

function renderMainContent(): string {
  if (appState.activeView === 'activation') {
    return renderActivationModel(appState.activationModel)
  }

  if (appState.activeView === 'usage') {
    return renderProductUsageAnalytics(appState.productUsageAnalytics)
  }

  if (appState.activeView === 'ml') {
    return renderMlAlgorithm(appState.mlAlgorithm)
  }

  if (appState.activeView === 'causal') {
    return renderCausalInference(appState.causalInference)
  }

  return renderIntro()
}

function loadViewData() {
  if (appState.activeView === 'activation') {
    bindActivationControls(appState.activationModel, (nextState) => {
      appState.activationModel = nextState
      renderApp()
    })
  }

  if (appState.activeView === 'usage' && appState.productUsageAnalytics.status === 'idle') {
    loadProductUsageAnalytics()
  }

  if (appState.activeView === 'ml' && appState.mlAlgorithm.status === 'idle') {
    loadMlScoring()
  }

  if (appState.activeView === 'causal' && appState.causalInference.status === 'idle') {
    loadCausalInference()
  }
}

async function loadProductUsageAnalytics() {
  appState.productUsageAnalytics = {
    status: 'loading',
  }
  renderApp()

  try {
    const dashboard = await fetchProductUsageDashboard()
    appState.productUsageAnalytics = {
      dashboard,
      status: 'success',
    }
  } catch (error) {
    appState.productUsageAnalytics = {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'error',
    }
  }

  renderApp()
}

async function loadMlScoring() {
  appState.mlAlgorithm = {
    status: 'loading',
  }
  renderApp()

  try {
    const dashboard = await fetchMlScoring()
    appState.mlAlgorithm = {
      dashboard,
      status: 'success',
    }
  } catch (error) {
    appState.mlAlgorithm = {
      error: error instanceof Error ? error.message : 'Unknown Snowflake error',
      status: 'error',
    }
  }

  renderApp()
}

async function loadCausalInference() {
  appState.causalInference = {
    status: 'loading',
  }
  renderApp()

  try {
    const dashboard = await fetchCausalInference()
    appState.causalInference = {
      dashboard,
      status: 'success',
    }
  } catch (error) {
    appState.causalInference = {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'error',
    }
  }

  renderApp()
}

function bindAppEvents() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      appState.activeView = (button as HTMLButtonElement).dataset.view as AppView
      renderApp()
    })
  })

  document.querySelector('#open-activation')?.addEventListener('click', () => {
    appState.activeView = 'activation'
    renderApp()
  })
}

renderApp()
