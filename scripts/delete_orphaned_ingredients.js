const mongoose = require('mongoose');
// override mongoose promises
mongoose.Promise = require('q').Promise;
const Pizza = require('../server/models/pizza.js');
const IngredientStatistic = require('../server/models/ingredient_statistic.js');
const Ingredient = require('../server/models/ingredient.js');
const IngredientStatisticController = require('../server/controllers/ingredient_statistic.js');

// connect mongodb
const dbUri =  process.env.MONGODB_URI || 'mongodb://localhost/arizmendi';
mongoose.connect(dbUri, {useNewUrlParser: true});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log("Connected to mondoDB")
});

function deleteOrphanedIngredients () {
  let orphanedIngredients = [];
  return Pizza.find({}, {date: 1})
    .then(pizzas => {
      const validPizzaDates = pizzas.map(pizza => { return pizza.date; });
      return Ingredient.find({date: {$nin: validPizzaDates }});
    })
    .then(ingredients => {
      orphanedIngredients = ingredients;
      const ids = orphanedIngredients.map(ingredient => { return ingredient._id; });
      return Ingredient.deleteMany({_id: ids});
    })
    .then(result => {
      console.log("deleted ingredients:", result);
      return IngredientStatisticController.updateIngredientStatisticsForIngredients(orphanedIngredients);
    })
    .then(() => {
      return deleteOrphanedIngredientStatistics();
    })
    .catch(err => {
      console.log(err);
    });
}

function deleteOrphanedIngredientStatistics () {
  return Ingredient.distinct("name")
    .then(validIngredientNames => {
      return IngredientStatistic.deleteMany({ingredient: {$nin: validIngredientNames }});
    })
    .then(result => {
      console.log("deleted ingredient statistics:", result);
    });
}

deleteOrphanedIngredients().then(process.exit);
