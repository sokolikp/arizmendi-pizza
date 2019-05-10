const express = require("express");
const app = express();
const bodyParser = require('body-parser');
const http = require('http');
const server = http.Server(app);
const request = require('request');
const moment = require('moment');
const mongoose = require('mongoose');
// override mongoose promises
mongoose.Promise = require('q').Promise;
const isProduction = process.env.NODE_ENV === 'production';
const util = require('./server/util/util.js');
const Pizza = require('./server/models/pizza.js');
const IngredientStatistic = require('./server/models/ingredient_statistic.js');
const Ingredient = require('./server/models/ingredient.js');

// config
app.set("port", process.env.PORT || 3000);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// connect mongodb
const dbUri =  process.env.MONGODB_URI || 'mongodb://localhost/arizmendi';
mongoose.connect(dbUri, {useNewUrlParser: true});

// set up the MongoDB schema stuff
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log("Connected to mondoDB")
});

// serve static assets in production - otherwise client server handles asset serving
if (isProduction) {
  app.use(express.static(__dirname + "/client/dist"));
}

// routes

// GET is a little weird because we proxy a request to the squarespace
// Arizmendi site. Since we don't want to bombard them with requests
// every time someone requests our page, we save the pizza data
// in our own MongoDB instance so that we can use that for future requests.
// So while this is a GET for the client, we post data to our db for later use.
const dayOptions = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
app.get('/api/pizza/', (req, res) => {
  const {start, end} = req.query;

  // you gotta send me the date strings!
  if (!start || !end) {
    return res.sendStatus(400);
  }

  // validate start/end
  if (!dayOptions.has(start.split(" ")[0]) || !dayOptions.has(end.split(" ")[0])) {
    console.log("Bad start/end date");
    return res.sendStatus(400);
  }

  // first, check whether it's in our db
  Pizza.find({dateStr: start}, function (err, pizzas) {
    if (err) {
      console.log("Error finding record.");
      return;
    }

    if (pizzas.length > 1) {
      console.log("Found multiple records!");
      return res.json({cached: true, data: pizzas[0].ingredientsRawString});
    } else if (pizzas.length === 1) {
      return res.json({cached: true, data: pizzas[0].ingredientsRawString});
    } else {
      // make a proxy request. We just grab the entire HTML page
      // and parse the result.
      const options = {
        url: 'http://arizmendi-valencia.squarespace.com/pizza/',
        headers: {
          'User-Agent': 'request' // user-agent is required by squarespace
        }
      };

      request(options, (err, response, body) => {
        if (err) {
          return res.sendStatus(500);
        }

        if (response && response.statusCode !== 200) {
          return res.sendStatus(500);
        }

        const pizzaData = util.parseHtml(body, start);
        if (pizzaData === null || pizzaData.length === 0) {
          return res.sendStatus(500);
        }

        // if we got here without issue, we'll save the whole week's pizza data in our db
        const momentDate = moment(start, 'dddd MMM D, YYYY').utc();
        const pizzas = getPizzasFromPizzaData(pizzaData);
        console.log("Before save pizzas:", pizzas.length);

        savePizzas(pizzas)
          .then(savedPizzas => {
            return saveIngredientsForPizzas(savedPizzas);
          })
          .then(savedIngredients => {
            return updatePizzaStatisticsForIngredients(savedIngredients);
          })
          .then(updatedStatistics => {
            let targetPizza;
            pizzas.forEach((pizza) => {
              if (pizza.dateStr === start) {
                targetPizza = pizza;
              }
            });
            console.log("Found today's pizza:", targetPizza);
            if (!targetPizza) {
              return res.sendStatus(500);
            }
            res.json({cached: false, data: targetPizza.ingredientsRawString});
          })
          .catch(err => {
            console.log("Error returning pizza!", err);
        });
      });
    }
  });
});

function getPizzasFromPizzaData (pizzaData) {
  return pizzaData.map(data => {
    const momentDate = moment(data.date, 'dddd MMM D, YYYY').utc();
    return new Pizza({
      date: momentDate.toDate(),
      dateStr: data.date,
      ingredientsRawString: data.pizza,
      ingredients: data.pizza.toLowerCase().split(", ")
    });
  });
}

function savePizzas(pizzas) {
  let newPizzas = [];
  return Pizza.find({dateStr: pizzas.map(pizza => { return pizza.dateStr; })})
    .then(existingPizzas => {
      let existingPizzaDateStrs = existingPizzas.map(pizza => { return pizza.dateStr; });
      pizzas.forEach(pizza => {
        if (existingPizzaDateStrs.indexOf(pizza.dateStr) === -1) {
          newPizzas.push(pizza);
        }
      });
      return Pizza.insertMany(newPizzas);
    })
    .then(result => {
      console.log("Saved " + result.length + " pizzas!");
      return newPizzas;
    });
}

function saveIngredientsForPizzas(pizzas) {
  let pizzaDates = [];
  let ingredients = [];
  pizzas.forEach(pizza => {
    pizzaDates.push(pizza.date);

    pizza.ingredients.forEach(ingredientStr => {
      const ingredient = new Ingredient({
        date: pizza.date,
        name: ingredientStr
      });
      ingredients.push(ingredient);
    });
  });

  // first, delete any ingredients associated with these pizzas
  // just to be safe
  return Ingredient.deleteMany({date: pizzaDates})
    .then(result => {
      console.log("Deleted " + result.deletedCount + " ingredients before saving.");
      return Ingredient.insertMany(ingredients);
    })
    .then(result => {
      console.log("Saved " + result.length + " ingredients for " + pizzas.length + " pizzas!");
      return ingredients;
    });
}

function getIngredientStrs(ingredientsOrIngredientStatistics, key) {
  let ingredientStrs = new Set();
  ingredientsOrIngredientStatistics.forEach(ingredientOrIngredientStatistic => {
    ingredientStrs.add(ingredientOrIngredientStatistic[key]);
  });
  return Array.from(ingredientStrs);
}

function updatePizzaStatisticsForIngredients(ingredients) {
  let totalPizzaCount;
  let ingredientStatisticsToUpdate = [];
  const ingredientStrs = getIngredientStrs(ingredients, 'name');
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
        const foundIngredientStatisticIngredientStrs = getIngredientStrs(foundIngredientStatistics, 'ingredient');
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

app.get('/api/pizza_statistics/', (req, res) => {
  let {ingredients} = req.query;
  ingredients = ingredients.split(", ");
  ingredients.forEach((ingredient, i) => {
    ingredients[i] = ingredient.toLowerCase();
  });
  IngredientStatistic.find({ingredient: ingredients}, function (err, ingredientStatistics) {
    res.json(ingredientStatistics);
  });
});

server.listen(app.get("port"), () => {
  console.log(`Find the server at: http://localhost:${app.get("port")}/`);
});
