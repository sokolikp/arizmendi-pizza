const Pizza = require('../models/pizza.js');
const IngredientStatistic = require('../models/ingredient_statistic.js');
const Ingredient = require('../models/ingredient.js');
const Util = require('../util/util.js');
const mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;

const IngredientStatisticController = {
  updateIngredientStatisticsForIngredients (ingredients) {
    let totalPizzaCount;
    let ingredientStatisticsToUpdate = [];
    const ingredientStrs = Util.getIngredientStrs(ingredients, 'name');
    return Pizza.countDocuments()
      .then(count => {
        totalPizzaCount = count;
      })
      .then(() => {
        return IngredientStatistic.find({ingredient: ingredientStrs});
      })
      .then(foundIngredientStatistics => {
        // create any missing statistics
        if (foundIngredientStatistics.length !== ingredientStrs.length) {
          const foundIngredientStatisticIngredientStrs = Util.getIngredientStrs(foundIngredientStatistics, 'ingredient');
          let newIngredientStats = [];
          ingredientStrs.forEach(ingredientStr => {
            if (foundIngredientStatisticIngredientStrs.indexOf(ingredientStr) === -1) {
              newIngredientStats.push(ingredientStr);
              const ingredientStatistic = new IngredientStatistic({
                ingredient: ingredientStr,
                count: 1,
                percentage: (1 / totalPizzaCount).toFixed(2)
              });
              foundIngredientStatistics.push(ingredientStatistic);
            }
          });
          console.log("Created " + newIngredientStats.length + " new ingredient statistics", newIngredientStats);
        }
        ingredientStatisticsToUpdate = foundIngredientStatistics;
        return Ingredient.aggregate([
          { $match: {name: {$in: ingredientStrs} } },
          { $group: { _id: "$name", count: { $sum: 1 } } },
        ]);
      })
      .then(aggregatedIngredients => {
        aggregatedIngredients.forEach(ingredientStub => {
          ingredientStatisticsToUpdate.forEach(ingredientStatistic => {
            if (ingredientStub._id === ingredientStatistic.ingredient) {
              ingredientStatistic.count = ingredientStub.count;
              ingredientStatistic.percentage = (ingredientStub.count / totalPizzaCount).toFixed(2);
            }
          });
        });
      })
      .then(() => {
        // not great, but update the stats in a loop and return the resolved collection promise
        let ingredientStatisticPromises = [];
        ingredientStatisticsToUpdate.forEach(ingredientStatisticToUpdate => {
          ingredientStatisticPromises.push(ingredientStatisticToUpdate.save());
        });
        console.log("Saving " + ingredientStatisticPromises.length + " ingredient statistics.");
        return mongoose.Promise.all(ingredientStatisticPromises);
      });
  }
};

module.exports = IngredientStatisticController;
