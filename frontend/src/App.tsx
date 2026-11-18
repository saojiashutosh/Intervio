import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { Providers, useContent } from './context'
import { SearchPalette, Sidebar, TopBar } from './components/Chrome'
import Home from './pages/Home'
import ConceptPage from './pages/Concept'
import PlanPage from './pages/Plan'
import { ErrorBoundary } from './components/ErrorBoundary'
import MyPlanPage from './pages/MyPlan'
import DomainsPage from './pages/Domains'
import SourcesPage from './pages/Sources'
import ProfilePage from './pages/Profile'
import PracticePage from './pages/Practice'
import { ProblemPage, ProblemsPage } from './pages/Problems'
import ProjectsPage from './pages/Projects'
import InterviewPage from './pages/Interview'
import LoginPage from './pages/Login'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function Shell() {
  const { content, error } = useContent()
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => { setMenu(false) }, [pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch((v) => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <TopBar onMenu={() => setMenu(true)} onSearch={() => setSearch(true)} />
      <SearchPalette open={search} onClose={() => setSearch(false)} />
      <div className="layout">
        <Sidebar open={menu} onClose={() => setMenu(false)} />
      <main className="container"><ErrorBoundary>
        {error && <div className="card"><h3>Can’t load content</h3><p>{error}</p><p className="muted small">Start the API: <code>cd backend &amp;&amp; .venv\Scripts\python manage.py runserver</code></p></div>}
        {!content && !error && <p className="muted">Loading…</p>}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/concept/:slug" element={<ConceptPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/my-plan" element={<MyPlanPage />} />
          <Route path="/domains" element={<DomainsPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/problems" element={<ProblemsPage />} />
          <Route path="/problems/:slug" element={<ProblemPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/interview" element={<InterviewPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<p>Page not found. <Link to="/">Back home</Link></p>} />
        </Routes>
      </ErrorBoundary></main>
      </div>
      <footer className="foot muted small">Intervio · learn it, break it, explain it. · <Link to="/sources">Sources &amp; trust levels</Link></footer>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Providers><ScrollTop /><Shell /></Providers>
    </BrowserRouter>
  )
}
