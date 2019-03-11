const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
  date: Date,
  name: String
});

module.exports = mongoose.model('Ingredient', ingredientSchema);
