const mongoose = require('mongoose');

const qbSchema = new mongoose.Schema({
  name: String,
  team: String,
  touchdowns: Number,
  interceptions: Number,
  qbr: Number,
});

module.exports = mongoose.model('Quarterback', qbSchema);
