import { useEffect } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Providers, useAuth, useContent } from './context'
import Home from './pages/Home'
import ConceptPage from './pages/Concept'
import PlanPage from './pages/Plan'
import { ErrorBoundary } from './components/ErrorBoundary'
import MyPlanPage from './pages/MyPlan'
import DomainsPage from './pages/Domains'
import SourcesPage from './pages/Sources'
import ProfilePage from './pages/Profile'
import PracticePage from './pages/Practice'
import ProjectsPage from './pages/Projects'
import InterviewPage from './pages/Interview'
import LoginPage from './pages/Login'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function Shell() {
  const { user, signOut } = useAuth()
  const { content, error } = useContent()
  return (
    <>
      <header className="nav">
        <Link to="/" className="brand">🗄️ Intervio</Link>
        <nav aria-label="Main">
          <NavLink to="/" end>Roadmap</NavLink>
          <NavLink to="/my-plan">My plan</NavLink>
          <NavLink to="/domains">Domains</NavLink>
          <NavLink to="/practice">Practice</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/interview">Interview</NavLink>
        </nav>
        <div className="who">
          {user ? <><span className="muted small">{user}</span><button className="ghost small" onClick={signOut}>Sign out</button></> : <Link className="btn ghost small" to="/login">Sign in</Link>}
        </div>
      </header>
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
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/interview" element={<InterviewPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<p>Page not found. <Link to="/">Back home</Link></p>} />
        </Routes>
      </ErrorBoundary></main>
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
