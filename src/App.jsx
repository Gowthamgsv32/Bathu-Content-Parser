import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import DashboardLayout from './layout/DashboardLayout'
import Dashboard from './pages/Dashboard'
import './App.css'

// Code-split: pdfjs-dist is heavy and only needed on this one page, so it
// shouldn't bloat the initial bundle for every visitor.
const TnpscParser = lazy(() => import('./pages/TnpscParser'))

function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Dashboard />} />
        <Route
          path="tnpsc-parser"
          element={
            <Suspense fallback={<div className="page"><p>Loading…</p></div>}>
              <TnpscParser />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  )
}

export default App
