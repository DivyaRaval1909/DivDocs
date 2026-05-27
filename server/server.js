require("dotenv").config()
const mongoose = require("mongoose")
const crypto = require("crypto")
const Document = require("./Document")

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected successfully"))
.catch((err) => console.error("MongoDB connection error:", err))

const io = require("socket.io")(3001, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
})

const defaultValue = ""
const activeUsers = {}

const adjectives = ["Anonymous", "Clever", "Vibrant", "Swift", "Calm", "Happy", "Kind", "Witty", "Creative", "Silent"]
const animals = ["Panda", "Fox", "Koala", "Cheetah", "Owl", "Tiger", "Dolphin", "Otter", "Rabbit", "Falcon"]
const colors = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#14B8A6"]

function getRandomUser() {
  const username = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${animals[Math.floor(Math.random() * animals.length)]}`
  const color = colors[Math.floor(Math.random() * colors.length)]
  return { username, color }
}

function getUsersInRoom(documentId) {
  return Object.values(activeUsers).filter(u => u.documentId === documentId)
}

io.on("connection", socket => {
  console.log("New client connected:", socket.id)

  // Dashboard - Get all documents
  socket.on("get-documents", async () => {
    console.log("Socket", socket.id, "requested documents list")
    try {
      const documents = await Document.find({}, { data: 0 }).sort({ updatedAt: -1 })
      socket.emit("load-documents", documents)
      console.log("Sent", documents.length, "documents to socket", socket.id)
    } catch (error) {
      console.error("Error in get-documents:", error)
      socket.emit("error", "Failed to load documents list")
    }
  })

  // Dashboard - Create new document
  socket.on("create-document", async () => {
    console.log("Socket", socket.id, "requested document creation")
    try {
      const newId = crypto.randomUUID()
      const newDoc = await Document.create({ _id: newId, title: "Untitled Document", data: defaultValue })
      console.log("Document created with ID:", newDoc._id)
      socket.emit("document-created", newDoc._id)
      io.emit("documents-updated") // Notify all clients to refresh lists
    } catch (error) {
      console.error("Error in create-document:", error)
      socket.emit("error", "Failed to create document")
    }
  })

  // Rename document
  socket.on("rename-document", async ({ documentId, title }) => {
    console.log("Socket", socket.id, "requested rename of", documentId, "to", title)
    try {
      await Document.findByIdAndUpdate(documentId, { title })
      io.to(documentId).emit("document-title-updated", title)
      io.emit("documents-updated") // Notify all clients to refresh lists
    } catch (error) {
      console.error("Error in rename-document:", error)
      socket.emit("error", "Failed to rename document")
    }
  })

  // Delete document
  socket.on("delete-document", async (documentId) => {
    console.log("Socket", socket.id, "requested deletion of document:", documentId)
    try {
      await Document.findByIdAndDelete(documentId)
      io.to(documentId).emit("document-deleted")
      io.emit("documents-updated") // Notify all clients to refresh lists
    } catch (error) {
      console.error("Error in delete-document:", error)
      socket.emit("error", "Failed to delete document")
    }
  })

  // Join document editor
  socket.on("get-document", async documentId => {
    console.log("Socket", socket.id, "requested document editor for:", documentId)
    try {
      const document = await findOrCreateDocument(documentId)
      socket.join(documentId)
      
      // Load document data and title
      socket.emit("load-document", { data: document.data, title: document.title })

      // Add user to presence tracker
      const { username, color } = getRandomUser()
      activeUsers[socket.id] = { socketId: socket.id, documentId, username, color }
      
      // Broadcast updated user list to everyone in document room
      io.to(documentId).emit("active-users", getUsersInRoom(documentId))
      console.log("Socket", socket.id, "successfully loaded document. Active collaborators in room:", getUsersInRoom(documentId).length)

      socket.on("send-changes", delta => {
        socket.broadcast.to(documentId).emit("receive-changes", delta)
      })

      socket.on("save-document", async data => {
        await Document.findByIdAndUpdate(documentId, { data })
      })

    } catch (error) {
      console.error("Error in get-document:", error)
      socket.emit("error", "Failed to load document")
    }
  })

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id)
    const user = activeUsers[socket.id]
    if (user) {
      const docId = user.documentId
      delete activeUsers[socket.id]
      // Notify remaining clients in document room
      io.to(docId).emit("active-users", getUsersInRoom(docId))
    }
  })
})

io.on("error", (error) => {
  console.error("Socket.IO error:", error)
})

console.log("Server running on port 3001")

async function findOrCreateDocument(id) {
  if (id == null) return

  const document = await Document.findById(id)
  if (document) return document
  return await Document.create({ _id: id, title: "Untitled Document", data: defaultValue })
}