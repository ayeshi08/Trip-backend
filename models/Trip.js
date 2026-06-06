const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  startLocation: {
    lat: Number,
    lng: Number
  },
  stopLocation: {
    lat: Number,
    lng: Number
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  stopTime: Date,
  distance: Number // in km
});

module.exports = mongoose.model('Trip', tripSchema);