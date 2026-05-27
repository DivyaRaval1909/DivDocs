import { useState, useEffect } from "react"
import Dashboard from "./Dashboard"
import TextEditor from "./TextEditor"
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom"

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("divdocs-dark-mode") === "true"
  })

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("dark-theme")
    } else {
      document.body.classList.remove("dark-theme")
    }
    localStorage.setItem("divdocs-dark-mode", darkMode)
  }, [darkMode])

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard darkMode={darkMode} setDarkMode={setDarkMode} />} />
        <Route path="/documents/:id" element={<TextEditor darkMode={darkMode} setDarkMode={setDarkMode} />} />
      </Routes>
    </Router>
  )
}

export default App