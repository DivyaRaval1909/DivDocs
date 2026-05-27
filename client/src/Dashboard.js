import React, { useEffect, useState } from "react"
import { io } from "socket.io-client"
import { useNavigate } from "react-router-dom"

export default function Dashboard({ darkMode, setDarkMode }) {
  const [socket, setSocket] = useState(null)
  const [documents, setDocuments] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [renamingId, setRenamingId] = useState(null)
  const [renameTitle, setRenameTitle] = useState("")
  const [copyStatus, setCopyStatus] = useState("") // Stores docId of copied document
  const [error, setError] = useState(null)

  const navigate = useNavigate()

  useEffect(() => {
    const socketUrl = `${window.location.protocol}//${window.location.hostname}:3001`
    const s = io(socketUrl)
    setSocket(s)

    s.on("connect", () => {
      console.log("Dashboard connected")
      s.emit("get-documents")
    })

    s.on("load-documents", (docs) => {
      setDocuments(docs)
      setLoading(false)
      setError(null)
    })

    s.on("error", (err) => {
      console.error("Dashboard error:", err)
      setDocuments([])
      setLoading(false)
      setError(err)
    })

    s.on("document-created", (newId) => {
      navigate(`/documents/${newId}`)
    })

    s.on("documents-updated", () => {
      s.emit("get-documents")
    })

    return () => {
      s.disconnect()
    }
  }, [navigate])

  const handleCreateDocument = () => {
    if (socket) {
      socket.emit("create-document")
    }
  }

  const handleDeleteDocument = (id, e) => {
    e.stopPropagation()
    if (window.confirm("Are you sure you want to permanently delete this document?")) {
      if (socket) {
        socket.emit("delete-document", id)
      }
    }
  }

  const startRename = (id, currentTitle, e) => {
    e.stopPropagation()
    setRenamingId(id)
    setRenameTitle(currentTitle)
  }

  const saveRename = (id, e) => {
    if (e) e.stopPropagation()
    const trimmed = renameTitle.trim()
    if (!trimmed) return
    if (socket) {
      socket.emit("rename-document", { documentId: id, title: trimmed })
    }
    setRenamingId(null)
  }

  const handleKeyDown = (id, e) => {
    if (e.key === "Enter") {
      saveRename(id)
    } else if (e.key === "Escape") {
      setRenamingId(null)
    }
  }

  const handleCopyLink = (id, e) => {
    e.stopPropagation()
    const link = `${window.location.origin}/documents/${id}`
    navigator.clipboard.writeText(link).then(() => {
      setCopyStatus(id)
      setTimeout(() => setCopyStatus(""), 2000)
    })
  }

  const filteredDocuments = documents.filter((doc) =>
    (doc.title || "Untitled Document").toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatDate = (dateString) => {
    if (!dateString) return "Recently updated"
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  return (
    <div className="dashboard-wrapper">
      {/* Top Navbar */}
      <nav className="dash-navbar">
        <div className="navbar-brand">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3H19ZM16 17H8V15H16V17ZM16 13H8V11H16V13ZM16 9H8V7H16V9Z" fill="currentColor"/>
            </svg>
          </div>
          <span className="brand-name">DivDocs</span>
        </div>

        <div className="search-container">
          <div className="search-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z" fill="currentColor"/>
            </svg>
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="navbar-actions" style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
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

          <button className="new-doc-btn" onClick={handleCreateDocument}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V19Z" fill="currentColor"/>
            </svg>
            New Document
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-text">
            <h1>Your Documents</h1>
            <p>Create, collaborate, and edit in real-time with automatic cloud syncing.</p>
          </div>
          <div className="header-stats">
            <span className="stats-badge">{documents.length} Total Docs</span>
          </div>
        </header>

        {loading ? (
          <div className="dashboard-loading">
            <div className="spinner"></div>
            <p>Fetching your documents...</p>
          </div>
        ) : (
          <div className="documents-grid">
            {/* Create New Document Card */}
            <div className="doc-card create-card" onClick={handleCreateDocument}>
              <div className="create-card-content">
                <div className="plus-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V19Z" fill="currentColor"/>
                  </svg>
                </div>
                <h3>Blank Document</h3>
                <p>Start a new collaborative note</p>
              </div>
            </div>

            {/* Document Cards */}
            {filteredDocuments.map((doc) => (
              <div
                key={doc._id}
                className="doc-card"
                onClick={() => navigate(`/documents/${doc._id}`)}
              >
                <div className="doc-card-body">
                  <div className="doc-icon-wrapper">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="currentColor"/>
                    </svg>
                  </div>
                  
                  {renamingId === doc._id ? (
                    <div className="rename-input-wrapper" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        className="rename-input"
                        value={renameTitle}
                        onChange={(e) => setRenameTitle(e.target.value)}
                        onBlur={() => saveRename(doc._id)}
                        onKeyDown={(e) => handleKeyDown(doc._id, e)}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <h3 className="doc-title" title={doc.title || "Untitled Document"}>
                      {doc.title || "Untitled Document"}
                    </h3>
                  )}
                </div>

                <div className="doc-card-footer">
                  <span className="doc-date">
                    {formatDate(doc.updatedAt)}
                  </span>
                  
                  <div className="doc-actions">
                    <button
                      className="action-btn"
                      title="Rename Document"
                      onClick={(e) => startRename(doc._id, doc.title || "Untitled Document", e)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 17.25V21H6.75L17.81 9.94L14.07 6.2L3 17.25ZM20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.87 8.86L20.71 7.04Z" fill="currentColor"/>
                      </svg>
                    </button>
                    <button
                      className={`action-btn ${copyStatus === doc._id ? "success" : ""}`}
                      title={copyStatus === doc._id ? "Link Copied!" : "Copy Share Link"}
                      onClick={(e) => handleCopyLink(doc._id, e)}
                    >
                      {copyStatus === doc._id ? (
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="currentColor"/>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 16.08C17.24 16.08 16.56 16.38 16.04 16.85L8.91 12.7C8.96 12.47 9 12.24 9 12C9 11.76 8.96 11.53 8.91 11.3L15.96 7.19C16.5 7.69 17.21 8 18 8C19.66 8 21 6.66 21 5C21 3.34 19.66 2 18 2C16.34 2 15 3.34 15 5C15 5.24 15.04 5.47 15.09 5.7L8.04 9.81C7.5 9.31 6.79 9 6 9C4.34 9 3 10.34 3 12C3 13.66 4.34 15 6 15C6.79 15 7.5 14.69 8.04 14.19L15.16 18.34C15.11 18.55 15.08 18.77 15.08 19C15.08 20.61 16.39 21.92 18 21.92C19.61 21.92 20.92 20.61 20.92 19C20.92 17.39 19.61 16.08 18 16.08Z" fill="currentColor"/>
                        </svg>
                      )}
                    </button>
                    <button
                      className="action-btn danger"
                      title="Delete Document"
                      onClick={(e) => handleDeleteDocument(doc._id, e)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredDocuments.length === 0 && !loading && (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="currentColor" opacity="0.3"/>
                </svg>
                {error ? (
                  <>
                    <h3>No documents available</h3>
                    <p style={{ color: "var(--danger-color)" }}>Database Error: {error}</p>
                  </>
                ) : (
                  <>
                    <h3>No documents found</h3>
                    <p>Try searching for a different keyword or start a new document.</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
