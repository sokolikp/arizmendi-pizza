const mongoose = require('mongoose');

const ingredientStatisticSchema = new mongoose.Schema({
  ingredient: String,
  count: Number,
  percentage: Number
});

module.exports = mongoose.model('IngredientStatistic', ingredientStatisticSchema);
