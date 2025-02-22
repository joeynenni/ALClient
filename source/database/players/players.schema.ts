import pkg from "mongoose"
const { Schema } = pkg

const PlayerSchema = new Schema({
    lastSeen: { type: Number },
    map: String,
    name: { required: true, type: String },
    owner: String,
    s: { required: false, type: Object },
    serverIdentifier: String,
    serverRegion: String,
    slots: { type: Object },
    type: String,
    x: Number,
    y: Number,
})

PlayerSchema.index({ name: 1 }, { unique: true }) // Characters can only be on one server at a time
PlayerSchema.index({ serverIdentifier: 1, serverRegion: 1 })
PlayerSchema.index({ lastSeen: 1 })
PlayerSchema.index({ owner: 1 })

export default PlayerSchema