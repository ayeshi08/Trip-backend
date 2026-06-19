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

  distance: {
    type: Number,
    default: 0
  },

  route: [
    {
      lat: Number,
      lng: Number
    }
  ],

  avgSpeed: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    enum: ['active', 'paused', 'stopped'],
    default: 'active'
  },

  isLocked: {
    type: Boolean,
    default: false
  },

  isValid: {
    type: Boolean,
    default: true
  },

  invalidReason: {
    type: String,
    default: ""
  }
});

module.exports = mongoose.model('Trip', tripSchema);