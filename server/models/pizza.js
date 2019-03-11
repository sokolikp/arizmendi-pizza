const mongoose = require('mongoose');

const pizzaSchema = new mongoose.Schema({
  date: Date,
  dateStr: String,
  ingredientsRawString: String,
  ingredients: [String]
});


module.exports = mongoose.model('Pizza', pizzaSchema);
