import { useCallback, useEffect, useState, useRef } from "react"
import Quill from "quill"
import "quill/dist/quill.snow.css"
import { io } from "socket.io-client"
import { useParams, useNavigate } from "react-router-dom"

const SAVE_INTERVAL_MS = 2000
const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, 4, 5, 6, false] }],
  [{ font: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  ["bold", "italic", "underline"],
  [{ color: [] }, { background: [] }],
  [{ script: "sub" }, { script: "super" }],
  [{ align: [] }],
  ["image", "blockquote", "code-block"],
  ["clean"],
]

export default function TextEditor({ darkMode, setDarkMode }) {
  const { id: documentId } = useParams()
  const navigate = useNavigate()

  const [socket, setSocket] = useState(null)
  const [quill, setQuill] = useState(null)
  const [isLoaded, setIsLoaded] = useState(false)
  
  // Document Title State
  const [title, setTitle] = useState("Untitled Document")
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState("")

  // Collaboration Presence State
  const [activeUsers, setActiveUsers] = useState([])

  // Sidebar, Stats & Outline State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [headings, setHeadings] = useState([])
  const [stats, setStats] = useState({ words: 0, characters: 0 })

  // Saving / Auto-save Indicator State
  const [saveStatus, setSaveStatus] = useState("Saved") // "Saved", "Saving..."

  // Modals & Dropdowns State
  const [showShareModal, setShowShareModal] = useState(false)
  const [showExportDropdown, setShowExportDropdown] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  // Export dropdown ref to close when clicking outside
  const exportDropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
        setShowExportDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Socket Connection Setup
  useEffect(() => {
    const socketUrl = `${window.location.protocol}//${window.location.hostname}:3001`
    const s = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    })

    s.on("connect", () => {
      console.log("Editor socket connected:", s.id)
    })

    s.on("connect_error", (error) => {
      console.error("Editor connection error:", error)
    })

    setSocket(s)

    return () => {
      s.disconnect()
    }
  }, [])

  // Handle active users presence & title updates & deleted document
  useEffect(() => {
    if (socket == null) return

    const handleTitleUpdated = (newTitle) => {
      setTitle(newTitle)
      setTitleInput(newTitle)
    }

    const handleActiveUsers = (users) => {
      setActiveUsers(users)
    }

    const handleDocDeleted = () => {
      alert("This document has been deleted by another user.")
      navigate("/")
    }

    socket.on("document-title-updated", handleTitleUpdated)
    socket.on("active-users", handleActiveUsers)
    socket.on("document-deleted", handleDocDeleted)

    return () => {
      socket.off("document-title-updated", handleTitleUpdated)
      socket.off("active-users", handleActiveUsers)
      socket.off("document-deleted", handleDocDeleted)
    }
  }, [socket, navigate])

  // Parse Stats and Outline
  const updateStatsAndOutline = useCallback(() => {
    if (quill == null) return

    // Word & Character count
    const text = quill.getText().trim()
    const words = text ? text.split(/\s+/).length : 0
    const characters = quill.getLength() - 1
    setStats({ words, characters })

    // Generate heading outline
    const headingElements = quill.root.querySelectorAll("h1, h2, h3, h4")
    const list = Array.from(headingElements).map((el, index) => {
      // Add id to elements if they don't have one, so we can scroll to them
      if (!el.id) {
        el.id = `heading-${index}`
      }
      return {
        id: el.id,
        text: el.innerText,
        tag: el.tagName.toLowerCase(),
      }
    })
    setHeadings(list)
  }, [quill])

  // Handle Loading Document
  useEffect(() => {
    if (socket == null || quill == null) return

    const handleLoadDocument = ({ data, title }) => {
      if (data && typeof data === "object" && (data.ops || Array.isArray(data))) {
        quill.setContents(data)
      } else {
        quill.setText(data || "")
      }
      quill.enable()
      setTitle(title)
      setTitleInput(title)
      setIsLoaded(true)
      
      // Initial stats/outline render
      setTimeout(updateStatsAndOutline, 100)
    }

    const handleError = (error) => {
      console.error("Server error:", error)
    }

    socket.on("load-document", handleLoadDocument)
    socket.on("error", handleError)

    console.log("Requesting document details:", documentId)
    socket.emit("get-document", documentId)

    return () => {
      socket.off("load-document", handleLoadDocument)
      socket.off("error", handleError)
    }
  }, [socket, quill, documentId, updateStatsAndOutline])

  // Periodic Auto-save
  useEffect(() => {
    if (socket == null || quill == null || !isLoaded) return

    const interval = setInterval(() => {
      setSaveStatus("Saving...")
      socket.emit("save-document", quill.getContents())
      // Emulate a minor latency for premium visual cue
      setTimeout(() => setSaveStatus("Saved"), 600)
    }, SAVE_INTERVAL_MS)

    return () => {
      clearInterval(interval)
    }
  }, [socket, quill, isLoaded])

  // Recieve Delta Changes from collaborators
  useEffect(() => {
    if (socket == null || quill == null) return

    const handler = (delta) => {
      quill.updateContents(delta)
    }
    socket.on("receive-changes", handler)

    return () => {
      socket.off("receive-changes", handler)
    }
  }, [socket, quill])

  // Send Delta Changes to collaborators & update outline
  useEffect(() => {
    if (socket == null || quill == null) return

    const handler = (delta, oldDelta, source) => {
      // Recalculate stats/outline on edit
      updateStatsAndOutline()

      if (source !== "user") return
      socket.emit("send-changes", delta)
    }
    quill.on("text-change", handler)

    return () => {
      quill.off("text-change", handler)
    }
  }, [socket, quill, updateStatsAndOutline])

  // Initialize Quill Editor
  const wrapperRef = useCallback(wrapper => {
    if (wrapper == null) return

    wrapper.innerHTML = ""
    const editor = document.createElement("div")
    wrapper.append(editor)
    const q = new Quill(editor, {
      theme: "snow",
      modules: { toolbar: TOOLBAR_OPTIONS },
    })
    q.disable()
    q.setText("Loading collaborative workspace...")
    setQuill(q)
  }, [])

  // Title renaming actions
  const startEditingTitle = () => {
    setIsEditingTitle(true)
    setTitleInput(title)
  }

  const saveTitle = () => {
    setIsEditingTitle(false)
    const trimmed = titleInput.trim()
    if (!trimmed || trimmed === title) return
    setTitle(trimmed)
    if (socket) {
      socket.emit("rename-document", { documentId, title: trimmed })
    }
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === "Enter") {
      saveTitle()
    } else if (e.key === "Escape") {
      setIsEditingTitle(false)
    }
  }

  // Scroll to a heading in the editor
  const scrollToHeading = (id) => {
    if (quill == null) return
    const el = quill.root.querySelector(`#${id}`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }

  // File Download Helpers
  const downloadFile = (content, mimeType, filename) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Simple Markdown Exporter
  const getMarkdownContent = () => {
    if (!quill) return ""
    let html = quill.root.innerHTML
    let md = html
      .replace(/<h1>(.*?)<\/h1>/g, "# $1\n\n")
      .replace(/<h2>(.*?)<\/h2>/g, "## $1\n\n")
      .replace(/<h3>(.*?)<\/h3>/g, "### $1\n\n")
      .replace(/<h4>(.*?)<\/h4>/g, "#### $1\n\n")
      .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
      .replace(/<em>(.*?)<\/em>/g, "*$1*")
      .replace(/<u>(.*?)<\/u>/g, "_$1_")
      .replace(/<p>(.*?)<\/p>/g, "$1\n\n")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<li>(.*?)<\/li>/g, "* $1")
      .replace(/<ul[^>]*>/g, "")
      .replace(/<\/ul>/g, "\n")
      .replace(/<ol[^>]*>/g, "")
      .replace(/<\/ol>/g, "\n")
    
    // Remove other html tags
    md = md.replace(/<[^>]+>/g, "")
    return md
  }

  const exportDocument = (format) => {
    setShowExportDropdown(false)
    if (!quill) return

    const baseName = title.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "untitled"

    switch(format) {
      case "pdf":
        window.print()
        break
      case "markdown":
        downloadFile(getMarkdownContent(), "text/markdown;charset=utf-8", `${baseName}.md`)
        break
      case "html":
        downloadFile(quill.root.innerHTML, "text/html;charset=utf-8", `${baseName}.html`)
        break
      case "txt":
        downloadFile(quill.getText(), "text/plain;charset=utf-8", `${baseName}.txt`)
        break
      default:
        break
    }
  }

  const copyShareLink = () => {
    const link = window.location.href
    navigator.clipboard.writeText(link).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    })
  }

  return (
    <div className={`editor-view-wrapper ${darkMode ? "dark-theme" : ""}`}>
      {/* Editor Navbar */}
      <nav className="editor-navbar">
        <div className="navbar-left">
          <button className="back-btn" onClick={() => navigate("/")} title="Back to Dashboard">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 11H7.83L13.42 5.41L12 4L4 12L12 20L13.41 18.59L7.83 13H20V11Z" fill="currentColor"/>
            </svg>
          </button>
          
          <div className="title-editor-container">
            {isEditingTitle ? (
              <input
                type="text"
                className="title-editor-input"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={handleTitleKeyDown}
                autoFocus
              />
            ) : (
              <h2 className="title-editor-text" onClick={startEditingTitle}>
                {title}
                <svg className="edit-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 17.25V21H6.75L17.81 9.94L14.07 6.2L3 17.25ZM20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.87 8.86L20.71 7.04Z" fill="currentColor"/>
                </svg>
              </h2>
            )}
            
            <div className="saving-indicator">
              <span className={`status-dot ${saveStatus === "Saving..." ? "saving" : "saved"}`}></span>
              <span className="status-text">{saveStatus}</span>
            </div>
          </div>
        </div>

        <div className="navbar-right">
          {/* Active Collaborators */}
          <div className="active-users-list" title={`${activeUsers.length} active collaborator(s)`}>
            {activeUsers.slice(0, 3).map((user, idx) => (
              <div
                key={user.socketId}
                className="user-avatar"
                style={{ backgroundColor: user.color, zIndex: 10 - idx }}
                title={user.username}
              >
                {user.username.split(" ").map(w => w[0]).join("")}
              </div>
            ))}
            {activeUsers.length > 3 && (
              <div className="user-avatar extra" z-index={5}>
                +{activeUsers.length - 3}
              </div>
            )}
          </div>

          {/* Dark Mode Toggle */}
          <button
            className="navbar-action-btn theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 7C9.24 7 7 9.24 7 12C7 14.76 9.24 17 12 17C14.76 17 17 14.76 17 12C17 9.24 14.76 7 12 7ZM12 9C13.66 9 15 10.34 15 12C15 13.66 13.66 15 12 15C10.34 15 9 13.66 9 12C9 10.34 10.34 9 12 9ZM12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="currentColor"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.3 2A10 10 0 002 11.7a10 10 0 0010.5 10.3 10.2 10.2 0 008-3.7.8.8 0 00-.7-1.3H19a8 8 0 01-6.7-11.3v-.3a.8.8 0 00-.8-.7z" fill="currentColor"/>
              </svg>
            )}
          </button>

          {/* Export Dropdown */}
          <div className="export-menu-container" ref={exportDropdownRef}>
            <button
              className="navbar-action-btn border-btn"
              onClick={() => setShowExportDropdown(!showExportDropdown)}
            >
              Export
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width: 14, height: 14, marginLeft: 4}}>
                <path d="M7 10L12 15L17 10H7Z" fill="currentColor"/>
              </svg>
            </button>
            {showExportDropdown && (
              <div className="export-dropdown">
                <button onClick={() => exportDocument("pdf")}>PDF (Print Layout)</button>
                <button onClick={() => exportDocument("markdown")}>Markdown (.md)</button>
                <button onClick={() => exportDocument("html")}>HTML (.html)</button>
                <button onClick={() => exportDocument("txt")}>Plain Text (.txt)</button>
              </div>
            )}
          </div>

          {/* Share Button */}
          <button className="navbar-action-btn primary-btn" onClick={() => setShowShareModal(true)}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: 6}}>
              <path d="M18 16.08C17.24 16.08 16.56 16.38 16.04 16.85L8.91 12.7C8.96 12.47 9 12.24 9 12C9 11.76 8.96 11.53 8.91 11.3L15.96 7.19C16.5 7.69 17.21 8 18 8C19.66 8 21 6.66 21 5C21 3.34 19.66 2 18 2C16.34 2 15 3.34 15 5C15 5.24 15.04 5.47 15.09 5.7L8.04 9.81C7.5 9.31 6.79 9 6 9C4.34 9 3 10.34 3 12C3 13.66 4.34 15 6 15C6.79 15 7.5 14.69 8.04 14.19L15.16 18.34C15.11 18.55 15.08 18.77 15.08 19C15.08 20.61 16.39 21.92 18 21.92C19.61 21.92 20.92 20.61 20.92 19C20.92 17.39 19.61 16.08 18 16.08Z" fill="currentColor"/>
            </svg>
            Share
          </button>
        </div>
      </nav>

      {/* Editor Body with Collapsible Sidebar */}
      <div className="editor-body">
        {/* Toggle Sidebar Button (Fixed Position) */}
        <button
          className={`sidebar-toggle-btn ${isSidebarOpen ? "open" : ""}`}
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          title={isSidebarOpen ? "Collapse Outline" : "Expand Outline"}
        >
          {isSidebarOpen ? (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12L15.41 7.41Z" fill="currentColor"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 6L8.59 7.41L13.17 12L8.59 16.59L10 18L16 12L10 6Z" fill="currentColor"/>
            </svg>
          )}
        </button>

        {isSidebarOpen && (
          <aside className="editor-sidebar">
            <div className="sidebar-section">
              <h3>Document Outline</h3>
              {headings.length > 0 ? (
                <ul className="outline-list">
                  {headings.map((heading) => (
                    <li
                      key={heading.id}
                      className={`outline-item outline-${heading.tag}`}
                      onClick={() => scrollToHeading(heading.id)}
                    >
                      {heading.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sidebar-hint">
                  Create Headings (H1, H2, H3) inside the document to populate the interactive outline.
                </p>
              )}
            </div>

            <div className="sidebar-divider"></div>

            <div className="sidebar-section">
              <h3>Workspace Stats</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-value">{stats.words}</span>
                  <span className="stat-label">Words</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stats.characters}</span>
                  <span className="stat-label">Characters</span>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Text Quill Container */}
        <div className="editor-container-wrapper">
          <div className="container" ref={wrapperRef}></div>
        </div>
      </div>

      {/* Share Modal Dialog */}
      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Share Document</h3>
              <button className="close-modal-btn" onClick={() => setShowShareModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p>Collaborate in real-time by sharing this link with other members:</p>
              <div className="share-link-input-group">
                <input
                  type="text"
                  readOnly
                  value={window.location.href}
                  className="share-link-input"
                  onClick={(e) => e.target.select()}
                />
                <button
                  className={`copy-link-btn ${shareCopied ? "success" : ""}`}
                  onClick={copyShareLink}
                >
                  {shareCopied ? "Copied!" : "Copy Link"}
                </button>
              </div>
              <div className="share-permissions-info">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width: 18, height: 18, marginRight: 8}}>
                  <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z" fill="currentColor"/>
                </svg>
                <span>Anyone with this link will be able to read and edit this document instantly.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}