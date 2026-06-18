import './style.css'
import './copilot.css'
import {
  bindActivationControls,
  defaultEvents,
  defaultWindowDays,
  renderActivationModel,
  type ActivationModelState,
} from './views/activationModel'
import {
  bindAccountCopilot,
  fetchMlScoring,
  renderMlAlgorithm,
  type MlAlgorithmState,
} from './views/mlAlgorithm'
import { renderIntro } from './views/intro'
import { renderActivationIcon } from './sidebar-icons/activationIcon'
import { renderIntroductionIcon } from './sidebar-icons/introductionIcon'
import {
  fetchCausalInference,
  renderCausalInference,
  type CausalInferenceState,
} from './views/causalInference'
import { renderCausalInferenceIcon } from './sidebar-icons/causalInferenceIcon'
import { renderMlAlgorithmIcon } from './sidebar-icons/mlAlgorithmIcon'

type AppView = 'intro' | 'activation' | 'ml' | 'causal'

const appState: {
  activeView: AppView
  activationModel: ActivationModelState
  mlAlgorithm: MlAlgorithmState
  causalInference: CausalInferenceState
} = {
  activeView: 'intro',
  activationModel: {
    selectedEvents: defaultEvents,
    windowDays: defaultWindowDays,
    splitUsers: false,
  },
  mlAlgorithm: {
    status: 'idle',
  },
  causalInference: {
    status: 'idle',
  },
}

let shellMounted = false

function renderApp() {
  const app = document.querySelector<HTMLDivElement>('#app')!

  if (!shellMounted) {
    app.innerHTML = `
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
            ${renderSidebarNav()}
          </nav>
        </aside>

        <main class="content"></main>
      </div>
    `

    bindAppEvents()
    shellMounted = true
  } else {
    const nav = document.querySelector('.sidebar-nav')
    if (nav) {
      nav.innerHTML = renderSidebarNav()
    }
  }

  updateMainContent()
  loadViewData()
}

function renderSidebarNav(): string {
  return `
    <button class="nav-item ${appState.activeView === 'intro' ? 'active' : ''}" data-view="intro">
      ${renderIntroductionIcon()}
      <span>Introduction</span>
    </button>
    <button class="nav-item ${appState.activeView === 'activation' ? 'active' : ''}" data-view="activation">
      ${renderActivationIcon()}
      <span>Activation Model</span>
    </button>
    <button class="nav-item ${appState.activeView === 'ml' ? 'active' : ''}" data-view="ml">
      ${renderMlAlgorithmIcon()}
      <span>Account Scoring Model</span>
    </button>
    <button class="nav-item ${appState.activeView === 'causal' ? 'active' : ''}" data-view="causal">
      ${renderCausalInferenceIcon()}
      <span>Causal Inference</span>
    </button>
  `
}

function updateMainContent() {
  const main = document.querySelector<HTMLElement>('.content')
  if (!main) {
    return
  }

  main.innerHTML = renderMainContent()
}

function refreshActivationView() {
  updateMainContent()
  bindActivationControls(() => appState.activationModel, (nextState) => {
    appState.activationModel = nextState
    refreshActivationView()
  })
}

function renderMainContent(): string {
  if (appState.activeView === 'activation') {
    return renderActivationModel(appState.activationModel)
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
    refreshActivationView()
    return
  }

  if (
    appState.activeView === 'ml' &&
    (appState.mlAlgorithm.status === 'idle' || appState.mlAlgorithm.status === 'error')
  ) {
    loadMlScoring()
  } else if (appState.activeView === 'ml' && appState.mlAlgorithm.status === 'success') {
    bindAccountCopilot()
  }

  if (
    appState.activeView === 'causal' &&
    (appState.causalInference.status === 'idle' || appState.causalInference.status === 'error')
  ) {
    loadCausalInference()
  }
}

async function loadMlScoring() {
  if (appState.mlAlgorithm.status === 'loading') {
    return
  }

  appState.mlAlgorithm = { status: 'loading' }
  updateMainContent()

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

  if (appState.activeView === 'ml') {
    updateMainContent()
    bindAccountCopilot()
  }
}

async function loadCausalInference() {
  if (appState.causalInference.status === 'loading') {
    return
  }

  appState.causalInference = { status: 'loading' }
  updateMainContent()

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

  if (appState.activeView === 'causal') {
    updateMainContent()
  }
}

function bindAppEvents() {
  document.querySelector('.sidebar-nav')?.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-view]')
    if (!button?.dataset.view) {
      return
    }

    const nextView = button.dataset.view as AppView
    if (nextView === appState.activeView) {
      return
    }

    appState.activeView = nextView
    renderApp()
  })

  document.querySelector('#app')?.addEventListener('click', (event) => {
    if ((event.target as Element).closest('#open-activation')) {
      appState.activeView = 'activation'
      renderApp()
    }
  })
}

renderApp()
