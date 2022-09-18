const mongoose = require('mongoose');

const CallSchema = new mongoose.Schema({
  agency: {type: String, required: true},
  service: {type: String, required: true},
  case: {type: String, required: true},
  start: {type: Date, required: true},
  end: {type: Date, required: false,default:null},
  nature: {type: String,required: true},
  address: {type: String, required: true},
  coordinates:{
    longitude: {type:Number},
    latitude:{type:Number}
  }
},{strict: false});

module.exports = mongoose.model('Call', CallSchema);