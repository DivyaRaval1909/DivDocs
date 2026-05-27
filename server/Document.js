const { Schema, model } = require("mongoose")

const Document = new Schema(
  {
    _id: String,
    title: {
      type: String,
      default: "Untitled Document",
    },
    data: Object,
  },
  { timestamps: true }
)

module.exports = model("Document", Document)